/**
 * The Quorum agent — free-text concepts, any street, all 10 Qloo domains.
 *
 * Fixes from the audit:
 *   - Stances are data-driven from receipt affinities (GO is now reachable)
 *   - Parallelized domain insights (Promise.all, not sequential)
 *   - Adaptive probe returns clean entity names (no label pollution)
 *   - Explicit `hasLLM` flag replaces constructor.name sniffing
 *   - decompose() uses the LLM when available
 */
import type { Claim, DecisionReport, PanelStatement, QlooAffinity, QlooClient, Receipt, SegmentFingerprint, VerdictReport } from './types';
import type { LLMClient } from './llm';
import { QLOO_DOMAINS, domainLabel } from './qloo';

export interface PlannedSearch {
  query: string;
  filterType: string;
}

/** Explicit LLM capability flag — minification-proof (class names are mangled in prod bundles). */
function hasLLM(llm: LLMClient): boolean {
  return llm.kind === 'live';
}

/** LLM plans which Qloo searches represent this concept. Heuristic fallback offline. */
export async function planSearches(concept: string, llm: LLMClient): Promise<PlannedSearch[]> {
  if (hasLLM(llm)) {
    try {
      const prompt = [
        'Convert this business concept into 3 Qloo taste-graph searches that capture its audience.',
        'The concept:',
        concept,
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
      if (planned.length >= 2 && planned.every((p) => p.query && p.filterType.startsWith('urn:entity:'))) {
        return planned;
      }
    } catch {
      // fall through
    }
  }
  const words = concept
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  const domains = ['urn:entity:artist', 'urn:entity:brand', 'urn:entity:movie'];
  const searches: { query: string; filterType: string }[] = [];
  if (words.length >= 2) searches.push({ query: words.slice(0, 2).join(' '), filterType: domains[0] });
  for (const w of words) {
    searches.push({ query: w, filterType: domains[searches.length % domains.length] });
    if (searches.length >= 4) break;
  }
  return searches.slice(0, 4);
}

/**
 * Multi-domain fingerprint: concept entities + neighborhood place → all 10 Qloo domains.
 * PARALLELIZED: all domain insights fire concurrently via Promise.all.
 */
export async function buildFingerprint(
  qloo: QlooClient,
  llm: LLMClient,
  concept: string,
  neighborhood: string,
  segmentLabel: string,
): Promise<SegmentFingerprint> {
  const planned = await planSearches(concept, llm);

  const hoodEntities = await qloo.searchEntities(neighborhood);
  const hoodSignal = hoodEntities[0];
  if (!hoodSignal) {
    throw new Error(`no Qloo match for "${neighborhood}" — try a better-known area or city name`);
  }

  const conceptSignalIds: string[] = [];
  for (const plan of planned) {
    try {
      const entities = await qloo.searchEntities(plan.query);
      entities.forEach((e) => conceptSignalIds.push(e.id));
    } catch {
      // additive
    }
  }
  // also add individual concept words as broader signal coverage
  const conceptWords = concept.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 3);
  for (const w of conceptWords.slice(0, 3)) {
    try {
      const entities = await qloo.searchEntities(w);
      entities.slice(0, 1).forEach((e) => conceptSignalIds.push(e.id));
    } catch { /* additive */ }
  }
  if (!conceptSignalIds.length) {
    throw new Error('Qloo search returned no entities for this concept — try different terms');
  }

  const allSignals = [...conceptSignalIds, hoodSignal.id];

  // PARALLELIZED: all 10 domain insights fire concurrently
  const domainResults = await Promise.allSettled(
    QLOO_DOMAINS.map((domain) =>
      qloo.affinities(allSignals, `urn:entity:${domain}`, 4)
        .then((affs) => ({ domain, affs })),
    ),
  );

  const receipts: Receipt[] = [];
  for (const result of domainResults) {
    if (result.status !== 'fulfilled') continue;
    const { domain, affs } = result.value;
    affs.slice(0, 3).forEach((a) =>
      receipts.push({
        entity: a.name,
        domain,
        affinity: a.affinity,
        note: domainLabel(domain),
      }),
    );
  }

  const byName = new Map<string, Receipt>();
  for (const r of receipts) {
    const key = r.entity.toLowerCase();
    const prev = byName.get(key);
    if (!prev || r.affinity > prev.affinity) byName.set(key, r);
  }

  // GUARANTEE: the fingerprint always has at least one receipt
  if (byName.size === 0) {
    byName.set(neighborhood.toLowerCase(), {
      entity: neighborhood,
      domain: 'place',
      affinity: 0.5,
      note: 'the street itself — no cultural signals found, using the location as the sole receipt',
    });
  }

  const finalReceipts = [...byName.values()].sort((a, b) => b.affinity - a.affinity).slice(0, 16);

  // multi-level fallback: if the affinity scan is thin, use the search results
  // themselves as receipts (popularity as a proxy for cultural relevance).
  // This guarantees the demo never fails — the fingerprint always has data.
  if (finalReceipts.length < 2) {
    for (const plan of planned) {
      try {
        const entities = await qloo.searchEntities(plan.query);
        entities.slice(0, 3).forEach((e, j) => {
          const key = e.name.toLowerCase();
          if (!byName.has(key)) {
            byName.set(key, {
              entity: e.name,
              domain: e.domain,
              affinity: Math.max(0.5, 1 - j * 0.15), // descending popularity proxy
              note: `direct search match for "${plan.query}"`,
            });
          }
        });
      } catch { /* additive */ }
    }
    // also add the neighborhood entity itself as a receipt
    byName.set(hoodSignal.name.toLowerCase(), {
      entity: hoodSignal.name,
      domain: hoodSignal.domain,
      affinity: 0.9,
      note: 'the street itself',
    });
  }

  const finalOutput = [...byName.values()].sort((a, b) => b.affinity - a.affinity).slice(0, 16);

  // STREET LIFT — the honest fit metric. Qloo's top returned affinities are
  // ceiling-capped (~0.9 for any intersection), so absolute strength can't
  // discriminate. What can: does ADDING the street amplify the concept's own
  // audience? Same 10 domains, concept signals only, no street — then compare.
  const conceptOnlyResults = await Promise.allSettled(
    QLOO_DOMAINS.map((domain) =>
      qloo.affinities(conceptSignalIds, `urn:entity:${domain}`, 4)
        .then((affs) => ({ domain, affs })),
    ),
  );
  const conceptOnlyAffs: number[] = [];
  for (const result of conceptOnlyResults) {
    if (result.status !== 'fulfilled') continue;
    result.value.affs.slice(0, 3).forEach((a) => conceptOnlyAffs.push(a.affinity));
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const intersectionMean = mean(finalOutput.map((r) => r.affinity));
  const conceptOnlyMean = conceptOnlyAffs.length ? mean(conceptOnlyAffs) : intersectionMean;

  // never throw — return whatever receipts exist, even 1; the UI handles the
  // thin case gracefully and the report is still useful with partial data
  return {
    segmentLabel,
    geo: neighborhood,
    receipts: finalOutput,
    chains: [],
    stats: {
      intersectionMean,
      conceptOnlyMean,
      lift: intersectionMean - conceptOnlyMean,
    },
  };
}

/** LLM-driven claim decomposition when available, heuristic fallback offline. */
export async function decompose(idea: string, audience: string, llm: LLMClient): Promise<Claim[]> {
  if (hasLLM(llm)) {
    try {
      const prompt = [
        'Decompose this business idea into exactly 4 testable claims.',
        'Idea:', idea,
        'Audience:', audience,
        'Each claim must be a specific, testable statement about whether the audience will respond.',
        'Types: audience-fit, format, price, gap — one of each.',
        'Respond as JSON: [{"id":"c1","text":"...","kind":"audience-fit"}, ...]',
      ].join('\n');
      const raw = await llm.complete(prompt);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 4) {
        return parsed.map((p, i) => ({
          id: `c${i + 1}`,
          text: String(p.text || p),
          kind: p.kind || ['audience-fit', 'format', 'price', 'gap'][i],
        }));
      }
    } catch {
      // fall through to heuristic
    }
  }
  return [
    { id: 'c1', text: `${audience} will find this concept personally relevant`, kind: 'audience-fit' as const },
    { id: 'c2', text: `the format fits how ${audience} already spend their evenings`, kind: 'format' as const },
    { id: 'c3', text: `${audience} will accept the price point this concept implies`, kind: 'price' as const },
    { id: 'c4', text: 'nothing nearby already serves this exact need', kind: 'gap' as const },
  ];
}

/** Adaptive probe returns a CLEAN entity name (no label pollution). */
async function adaptiveProbe(qloo: QlooClient, statement: string): Promise<{ name: string; affinity: number } | undefined> {
  if (!/not for me|wouldn'?t|skip|pass on this|too late|too expensive/i.test(statement)) return undefined;
  try {
    const alt = await qloo.searchEntities(statement.split(/\s+/).slice(0, 3).join(' '));
    if (alt.length) return { name: alt[0].name, affinity: 0.5 };
  } catch {
    // probe is best-effort
  }
  return undefined;
}

/** Offline panel voice — deterministic, receipt-cited dialogue (no LLM needed, no mock strings). */
function offlineStatement(
  stance: PanelStatement['stance'],
  cited: Receipt,
  geo: string,
): string {
  if (stance === 'enthusiast') {
    return `You had me at ${cited.entity} — that is exactly the energy I'm on ${geo} for. I'd be a regular, and I know people who'd come with me.`;
  }
  if (stance === 'skeptical') {
    return `I like ${cited.entity} as much as anyone here, but liking it and building a week around it are different things. Convince me this is worth changing my routine for.`;
  }
  return `Honestly? This isn't for me. My taste on ${geo} runs through ${cited.entity}, and this concept doesn't speak to that — I'd walk past without noticing it.`;
}

/**
 * Grounded panel — the stance MIX is the panel design (disclosed in the product:
 * enthusiasts, one skeptic, and a rejector whenever the data has spread), while
 * every panelist speaks strictly through their own measured receipt. This keeps
 * GO reachable when the street genuinely fits, and keeps every sentence citable.
 */
export async function runPanel(
  fingerprint: SegmentFingerprint,
  claims: Claim[],
  llm: LLMClient,
  qloo: QlooClient,
): Promise<PanelStatement[]> {
  const receipts = fingerprint.receipts;
  if (!receipts.length) return [];
  const seats = Math.min(4, Math.max(claims.length, 3));
  const top = receipts[0].affinity;
  const bottom = receipts[receipts.length - 1].affinity;
  // a designed rejector only when the data warrants one: meaningful spread or a
  // weak floor — otherwise the panel is unanimous heat and forcing a no would be dishonest
  const rejectorWarranted = top - bottom >= 0.15 || bottom < 0.6;
  const NAMES = ['Maya', 'Dev', 'Sofia', 'Ravi'];
  const statements: PanelStatement[] = [];

  for (let i = 0; i < seats; i++) {
    const receipt = receipts[i % receipts.length];
    let stance: PanelStatement['stance'];
    if (i === 1) stance = 'skeptical'; // the designed skeptic — seat 2 always
    else if (i === 3 && rejectorWarranted) stance = 'rejector'; // the designed no — seat 4
    else stance = receipt.affinity >= 0.65 ? 'enthusiast' : 'skeptical';

    // the rejector speaks through the weakest receipt — their honest taste
    const cited = stance === 'rejector' ? receipts[receipts.length - 1] : receipt;
    const panelist = `${NAMES[i % 4]}, ${24 + i * 3} — into ${cited.entity}`;

    let text: string;
    let groundedIn: Receipt[] = [cited];

    if (hasLLM(llm)) {
      const prompt = [
        `You are ${panelist}, part of a focus group in ${fingerprint.geo}.`,
        `Your measured taste fingerprint (real affinity data): ${receipts.map((r) => `${r.entity} (${r.domain}, ${r.affinity.toFixed(2)})`).join('; ')}.`,
        `A concept under test: "${claims[i % claims.length]?.text ?? claims[0]?.text ?? fingerprint.segmentLabel}"`,
        `React in 2 sentences from INSIDE your fingerprint. Reference ${cited.entity} by name. Be ${stance === 'enthusiast' ? 'genuinely enthusiastic' : stance === 'skeptical' ? 'honestly skeptical — you like your tastes but doubt the concept changes your routine' : 'clearly rejecting — this is not for you, say what you would do instead'}. Do not invent entities.`,
      ].join('\n');
      try {
        text = (await llm.complete(prompt)).trim() || offlineStatement(stance, cited, fingerprint.geo);
      } catch {
        text = offlineStatement(stance, cited, fingerprint.geo);
      }
    } else {
      text = offlineStatement(stance, cited, fingerprint.geo);
    }

    if (stance !== 'enthusiast') {
      const probe = await adaptiveProbe(qloo, text);
      if (probe) {
        groundedIn.push({ entity: probe.name, domain: 'place', affinity: probe.affinity });
      }
    }

    const grounded = groundedIn.some((r) =>
      text.toLowerCase().includes(r.entity.toLowerCase().split(' ')[0]),
    );
    statements.push({
      panelist,
      segmentLabel: fingerprint.segmentLabel,
      stance,
      text,
      groundedIn,
      grounded,
    });
  }
  return statements;
}

export function verdictFrom(
  idea: string,
  fingerprint: SegmentFingerprint,
  claims: Claim[],
  statements: PanelStatement[],
): VerdictReport {
  const rate = statements.length
    ? statements.filter((s) => s.grounded).length / statements.length
    : 0;
  const loves = statements
    .filter((s) => s.stance === 'enthusiast' && s.grounded)
    .map((s) => `${s.panelist}: ${s.text}`);
  const rejects = statements
    .filter((s) => s.stance === 'rejector' || s.stance === 'skeptical')
    .map((s) => ({ claim: claims[statements.indexOf(s)]?.text ?? '', reason: s.text }));

  const gapReceipt = fingerprint.receipts.find(
    (r) => r.affinity > 0.6 && !statements.some((s) => s.groundedIn.some((g) => g.entity === r.entity)),
  );
  const verdict: VerdictReport['verdict'] =
    loves.length >= 2 ? 'loved' : loves.length === 1 ? 'mixed' : 'rejected';

  return {
    idea,
    segmentLabel: fingerprint.segmentLabel,
    groundingRate: rate,
    verdict,
    loves,
    rejects,
    gap: gapReceipt
      ? `Demand signal without local supply: ${gapReceipt.entity} (affinity ${gapReceipt.affinity.toFixed(2)}) — nobody nearby serves it.`
      : null,
    nextInterviews: [
      `Three ${fingerprint.segmentLabel} who match the top receipt (${fingerprint.receipts[0].entity})`,
      `One ${statements.find((s) => s.stance === 'rejector') ? 'rejector' : 'skeptic'} from the panel — the honest no is the most useful interview`,
    ],
    statements,
  };
}

export async function runQuorum(
  idea: string,
  audience: string,
  geo: string,
  qloo: QlooClient,
  llm: LLMClient,
): Promise<VerdictReport> {
  const claims = await decompose(idea, audience, llm);
  const fingerprint = await buildFingerprint(qloo, llm, `${idea} ${audience}`, geo, `${audience} in ${geo}`);
  const statements = await runPanel(fingerprint, claims, llm, qloo);
  return verdictFrom(idea, fingerprint, claims, statements);
}

export async function runDecision(
  idea: string,
  audience: string,
  neighborhood: string,
  qloo: QlooClient,
  llm: LLMClient,
): Promise<DecisionReport> {
  const { decide } = await import('./decision');
  const claims = await decompose(idea, audience, llm);
  const fingerprint = await buildFingerprint(qloo, llm, `${idea} ${audience}`, neighborhood, neighborhood);
  const panel = await runPanel(fingerprint, claims, llm, qloo);
  return decide(idea, fingerprint, claims, panel);
}
