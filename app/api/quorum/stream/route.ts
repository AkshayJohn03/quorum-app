import { NextResponse } from 'next/server';
import { buildQlooClient, QLOO_DOMAINS, domainLabel, type QlooClient } from '@/lib/qloo';
import { buildLLM, type LLMClient } from '@/lib/llm';
import type { Claim, DecisionReport, PanelStatement, QlooAffinity, Receipt, SegmentFingerprint } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby cap — matches the decision route

interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

function sse(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** LLM plans which Qloo searches represent this concept. Heuristic fallback offline. */
async function planSearches(concept: string, llm: LLMClient): Promise<{ query: string; filterType: string }[]> {
  const domains = ['urn:entity:artist', 'urn:entity:brand', 'urn:entity:movie'];
  if (llm.kind === 'live') {
    try {
      const prompt = [
        'Convert this business concept into 3 Qloo taste-graph searches that capture its audience.',
        'The concept:', concept,
        'Respond with ONLY 3 lines, each: <search query> | <urn:entity:artist|urn:entity:brand|urn:entity:movie>',
        'Example for "a listening bar with vinyl and natural wine":',
        'jazz | urn:entity:artist',
        'natural wine | urn:entity:brand',
        'A24 | urn:entity:movie',
      ].join('\n');
      const raw = await llm.complete(prompt);
      const lines = raw.split('\n').filter((l) => l.includes('|')).slice(0, 3);
      const planned = lines.map((l) => {
        const [query, ft] = l.split('|').map((x) => x.trim());
        return { query, filterType: ft };
      });
      if (planned.length >= 2 && planned.every((p) => p.query && p.filterType.startsWith('urn:entity:'))) return planned;
    } catch { /* fall through */ }
  }
  const words = concept.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 3);
  const searches: { query: string; filterType: string }[] = [];
  if (words.length >= 2) searches.push({ query: words.slice(0, 2).join(' '), filterType: domains[0] });
  for (const w of words) {
    searches.push({ query: w, filterType: domains[searches.length % domains.length] });
    if (searches.length >= 4) break;
  }
  return searches.slice(0, 4);
}

export async function POST(req: Request) {
  let body: { concept?: string; neighborhood?: string; skipQloo?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const concept = (body.concept || '').trim();
  const neighborhood = (body.neighborhood || '').trim();
  const skipQloo = !!body.skipQloo;
  if (concept.length < 12) return NextResponse.json({ error: 'describe the concept (min 12 chars)' }, { status: 422 });
  if (!neighborhood) return NextResponse.json({ error: 'street is required' }, { status: 422 });

  const qloo = buildQlooClient();
  const llm = buildLLM();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse({ event, data })));
      };

      try {
        // ---- 1. planning ----
        emit('stage', { label: 'Planning Qloo searches', detail: concept.slice(0, 80) });
        const planned = await planSearches(concept, llm);
        emit('planned', { searches: planned });

        // ---- 2. neighborhood entity ----
        emit('stage', { label: `Searching Qloo for "${neighborhood}"` });
        const hoodEntities = await qloo.searchEntities(neighborhood);
        const hoodSignal = hoodEntities[0];
        if (!hoodSignal) throw new Error(`no Qloo match for "${neighborhood}"`);
        emit('neighborhood', { name: hoodSignal.name, domain: hoodSignal.domain, id: hoodSignal.id });

        // ---- 3. concept entity search ----
        const conceptSignalIds: string[] = [];
        for (const plan of planned) {
          emit('searching', { query: plan.query, filterType: plan.filterType });
          try {
            const entities = await qloo.searchEntities(plan.query);
            entities.slice(0, 2).forEach((e) => {
              conceptSignalIds.push(e.id);
              emit('entity_found', { query: plan.query, name: e.name, domain: e.domain, id: e.id });
            });
          } catch { /* additive */ }
        }
        if (!conceptSignalIds.length) throw new Error('Qloo search returned no entities');

        // ---- 4. multi-domain scan (parallel) ----
        const allSignals = [...conceptSignalIds, hoodSignal.id];
        emit('stage', { label: `Scanning ${QLOO_DOMAINS.length} Qloo domains in parallel`, domains: QLOO_DOMAINS });

        const receipts: Receipt[] = [];
        const domainPromises = QLOO_DOMAINS.map(async (domain) => {
          try {
            const affs: QlooAffinity[] = await qloo.affinities(allSignals, `urn:entity:${domain}`, 4);
            const top = affs.slice(0, 3);
            emit('domain_scanned', { domain, label: domainLabel(domain), count: top.length, top: top.map((a) => ({ name: a.name, affinity: +a.affinity.toFixed(2) })) });
            top.forEach((a) => receipts.push({ entity: a.name, domain, affinity: a.affinity, note: domainLabel(domain) }));
          } catch { /* additive */ }
        });
        await Promise.allSettled(domainPromises);

        // dedupe + sort
        const byName = new Map<string, Receipt>();
        for (const r of receipts) {
          const key = r.entity.toLowerCase();
          const prev = byName.get(key);
          if (!prev || r.affinity > prev.affinity) byName.set(key, r);
        }
        const finalReceipts = [...byName.values()].sort((a, b) => b.affinity - a.affinity).slice(0, 16);
        if (finalReceipts.length === 0) {
          finalReceipts.push({ entity: neighborhood, domain: 'place', affinity: 0.5, note: 'the street itself' });
        }
        emit('fingerprint_complete', { total: finalReceipts.length, top: finalReceipts.slice(0, 4).map((r) => ({ entity: r.entity, affinity: r.affinity })) });

        const fingerprint: SegmentFingerprint = { segmentLabel: neighborhood, geo: neighborhood, receipts: finalReceipts, chains: [] };

        // ---- 5. claims ----
        emit('stage', { label: 'Decomposing into testable claims' });
        const claims: Claim[] = [
          { id: 'c1', text: `${concept} will find its audience personally relevant here`, kind: 'audience-fit' },
          { id: 'c2', text: 'the format fits how this audience already spends their evenings', kind: 'format' },
          { id: 'c3', text: 'this audience will accept the price point', kind: 'price' },
          { id: 'c4', text: 'nothing nearby already serves this exact need', kind: 'gap' },
        ];

        // ---- 6. grounded panel ----
        emit('stage', { label: 'Convening the grounded panel' });
        const stances: PanelStatement['stance'][] = ['enthusiast', 'skeptical', 'rejector', 'enthusiast'];
        const statements: PanelStatement[] = [];
        const names = ['Maya', 'Dev', 'Sofia', 'Ravi'];

        for (let i = 0; i < claims.length; i++) {
          const claim = claims[i];
          const receipt = fingerprint.receipts[i % fingerprint.receipts.length];
          const stance = receipt.affinity >= 0.65 ? 'enthusiast' : receipt.affinity >= 0.45 ? 'skeptical' : 'rejector';
          const panelist = `${names[i % 4]}, ${24 + i * 3} — into ${receipt.entity}`;

          let text: string;
          if (llm.kind === 'live') {
            const prompt = [
              `You are ${panelist}, part of a focus group in ${fingerprint.geo}.`,
              `Your measured taste fingerprint: ${fingerprint.receipts.map((r) => `${r.entity} (${r.affinity.toFixed(2)})`).join('; ')}.`,
              `Claim: "${claim.text}"`,
              `React in 2 sentences. Reference one entity. Be ${stance}. Do not invent entities.`,
            ].join('\n');
            text = await llm.complete(prompt);
          } else {
            text = stance === 'enthusiast'
              ? `This lands — ${receipt.entity} is exactly my scene, affinity ${receipt.affinity.toFixed(2)}.`
              : stance === 'skeptical'
                ? `${receipt.entity} pulls at ${receipt.affinity.toFixed(2)}, not enough to change my routine.`
                : `Not for me — my taste is ${fingerprint.receipts.slice(0, 2).map((r) => r.entity).join(' and ')}.`;
          }

          let groundedIn: Receipt[] = [receipt];
          let probe: string | undefined;

          if (stance !== 'enthusiast') {
            if (/not for me|wouldn'?t|skip|too late|too expensive/i.test(text)) {
              try {
                const alt = await qloo.searchEntities(text.split(/\s+/).slice(0, 3).join(' '));
                if (alt.length) {
                  probe = `agent probed alternatives: ${alt[0].name}`;
                  emit('adaptive_probe', { panelist, probe: alt[0].name });
                }
              } catch { /* best-effort */ }
            }
          }

          const grounded = groundedIn.some((r) => text.toLowerCase().includes(r.entity.toLowerCase().split(' ')[0]));
          statements.push({ panelist, segmentLabel: neighborhood, stance, text, groundedIn, grounded, adaptiveProbe: probe });

          emit('panelist', {
            panelist, stance, text: text.slice(0, 120), grounded,
            receipt: receipt.entity, affinity: receipt.affinity.toFixed(2),
            probe: probe || undefined,
          });
        }

        // ---- 7. verdict ----
        const rate = statements.filter((s) => s.grounded).length / (statements.length || 1);
        const loves = statements.filter((s) => s.stance === 'enthusiast' && s.grounded).length;
        const verdict: string = loves >= 2 ? 'GO' : loves === 1 ? 'PIVOT' : 'NO-GO';
        const gapReceipt = fingerprint.receipts.find((r) => r.affinity > 0.6 && !statements.some((s) => s.groundedIn.some((g) => g.entity === r.entity)));
        emit('verdict', {
          verdict,
          fit: Math.round((fingerprint.receipts.reduce((a, r) => a + r.affinity, 0) / (fingerprint.receipts.length || 1)) * 100) / 100,
          groundingRate: Math.round(rate * 100) / 100,
          gap: gapReceipt ? `${gapReceipt.entity} (affinity ${gapReceipt.affinity.toFixed(2)})` : null,
          loves, rejects: statements.filter((s) => s.stance !== 'enthusiast').map((s) => s.text),
          statements,
        });

        emit('done', {});
      } catch (e) {
        emit('error', { message: e instanceof Error ? e.message : 'unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
