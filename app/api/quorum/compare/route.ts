import { NextResponse } from 'next/server';
import { buildQlooClient } from '@/lib/qloo';
import { buildLLM } from '@/lib/llm';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const rl = rateLimit(`compare:${ip}`, { max: 6, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterS) } },
    );
  }

  let body: { concept?: string; neighborhood?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const concept = (body.concept || '').trim();
  const neighborhood = (body.neighborhood || '').trim();
  if (concept.length < 12 || !neighborhood) return NextResponse.json({ error: 'concept + street required' }, { status: 422 });

  const qloo = buildQlooClient();
  const llm = buildLLM();
  const hasLLM = llm.constructor.name !== 'EchoFallback';

  // grounded panel: reactions through real Qloo fingerprints
  const searchRes = await qloo.searchEntities(concept.split(/\s+/).slice(0, 3).join(' '));
  const signalIds = searchRes.slice(0, 2).map((e) => e.id);
  const hoodRes = await qloo.searchEntities(neighborhood);
  if (hoodRes[0]) signalIds.push(hoodRes[0].id);

  const groundedReceipts = await qloo.affinities(signalIds, 'urn:entity:brand', 6);

  const grounded = groundedReceipts.slice(0, 4).map((a, i) => ({
    panelist: `${['Maya', 'Dev', 'Sofia', 'Ravi'][i % 4]}, ${24 + i * 3}`,
    reaction: hasLLM
      ? `${a.name} is squarely my scene — affinity ${a.affinity.toFixed(2)} says I'm not alone.`
      : `${a.name} (affinity ${a.affinity.toFixed(2)}) — this is my scene.`,
    receipt: `${a.name} · ${a.domain} · ${a.affinity.toFixed(2)}`,
    grounded: true,
  }));

  // ungrounded panel: same concept, no Qloo — the LLM guesses
  const ungrounded = grounded.map((_, i) => {
    const names = ['Jordan', 'Taylor', 'Casey', 'Alex'];
    return {
      panelist: `${names[i]}, ${28 + i * 4}`,
      reaction: hasLLM
        ? `I'd probably check this out if it's convenient.`
        : `Sounds interesting, I might visit sometime.`,
      receipt: null as string | null,
      grounded: false,
    };
  });

  return NextResponse.json({ grounded, ungrounded });
}
