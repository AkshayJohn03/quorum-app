import { NextResponse } from 'next/server';
import { runQuorum } from '@/lib/agent';
import { buildQlooClient } from '@/lib/qloo';
import { buildLLM } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { idea?: string; audience?: string; geo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const idea = (body.idea || '').trim();
  const audience = (body.audience || '').trim();
  const geo = (body.geo || 'Austin, TX').trim();
  if (idea.length < 12) return NextResponse.json({ error: 'describe the idea (min 12 chars)' }, { status: 422 });
  if (idea.length > 2000) return NextResponse.json({ error: 'idea too long (max 2000 chars)' }, { status: 413 });
  if (!audience) return NextResponse.json({ error: 'audience is required' }, { status: 422 });

  try {
    const report = await runQuorum(idea, audience, geo, buildQlooClient(), buildLLM());
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'panel failed' },
      { status: 500 },
    );
  }
}
