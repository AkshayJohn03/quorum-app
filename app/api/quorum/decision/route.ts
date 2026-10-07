import { NextResponse } from 'next/server';
import { runDecision } from '@/lib/agent';
import { buildQlooClient } from '@/lib/qloo';
import { buildLLM } from '@/lib/llm';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60; // within Vercel Hobby 60s limit

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const rl = rateLimit(`decision:${ip}`, { max: 6, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate limited — try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterS) } },
    );
  }

  let body: { concept?: string; audience?: string; neighborhood?: string; debug?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const concept = (body.concept || '').trim();
  const audience = (body.audience || 'locals who match this concept').trim();
  const neighborhood = (body.neighborhood || '').trim();
  const debug = !!body.debug;
  if (concept.length < 12) return NextResponse.json({ error: 'describe the concept (min 12 chars)' }, { status: 422 });
  if (concept.length > 400) return NextResponse.json({ error: 'concept too long (max 400 chars)' }, { status: 413 });
  if (!neighborhood) return NextResponse.json({ error: 'street / neighborhood is required' }, { status: 422 });

  const qloo = buildQlooClient();
  const llm = buildLLM();
  try {
    const report = await runDecision(concept, audience, neighborhood, qloo, llm);
    if (!debug) return NextResponse.json(report);
    // debug mode: per-call evidence for diagnosis (no secrets in traces)
    const qlooCalls = qloo.drainTrace();
    return NextResponse.json({
      report,
      diagnostics: {
        llmMode: llm.kind,
        qlooCalls,
        callCount: qlooCalls.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'decision failed';
    // don't leak infrastructure details to the client
    const safe = /QLOO_API_KEY|env/i.test(msg) ? 'Qloo API configuration error' : msg;
    const trace = debug ? { qlooCalls: qloo.drainTrace(), llmMode: llm.kind } : undefined;
    return NextResponse.json({ error: safe, ...(trace ? { diagnostics: trace } : {}) }, { status: 500 });
  }
}
