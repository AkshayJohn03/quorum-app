import { NextResponse } from 'next/server';
import { buildQlooClient } from '@/lib/qloo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const qloo = buildQlooClient();
    const entities = await qloo.searchEntities(q);
    // return only place-like entities (neighborhoods, cities, venues)
    const places = entities.filter((e) =>
      ['place', 'locality', 'neighborhood', 'destination'].includes(e.domain) ||
      e.domain === 'entity',
    );
    return NextResponse.json({
      results: (places.length ? places : entities).slice(0, 6).map((e) => ({
        id: e.id,
        name: e.name,
        domain: e.domain,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'search failed', results: [] },
      { status: 500 },
    );
  }
}
