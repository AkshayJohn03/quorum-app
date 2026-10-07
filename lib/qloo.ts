/**
 * Qloo tool layer — live-only. Verified against hackathon.api.qloo.com.
 *
 * The mock client lives ONLY in test fixtures (tests/fixtures.ts) — the
 * runtime requires QLOO_API_KEY and fails with a clear message if missing.
 *
 *   GET /v2/search?query=X    -> { results: [{ entity_id, name, subtype }] }
 *   GET /v2/insights?         -> { results: { entities: [{ name, subtype, query: { affinity } }] } }
 *     signal.interests.entities[i]=<bare uuid>
 *     filter.type=urn:entity:<domain>
 *
 * All 10 Qloo entity domains are supported for insights filtering.
 */

/** The 10 Qloo entity domains — used to scan the full taste graph. */
export const QLOO_DOMAINS = [
  'brand',
  'place',
  'artist',
  'movie',
  'tv_show',
  'podcast',
  'book',
  'destination',
  'video_game',
  'person',
] as const;

export type QlooDomain = (typeof QLOO_DOMAINS)[number];

export function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    brand: 'Brands', place: 'Venues & Places', artist: 'Music & Artists',
    movie: 'Movies', tv_show: 'TV Shows', podcast: 'Podcasts',
    book: 'Books', destination: 'Destinations', video_game: 'Games',
    person: 'People & Personalities',
  };
  return labels[domain] || domain;
}

import type { QlooAffinity, QlooClient, QlooEntityRef } from './types';
export type { QlooAffinity, QlooClient, QlooEntityRef };

const DOMAIN_OF = (subtype?: string) => (subtype || '').replace('urn:entity:', '') || 'entity';

export class HttpQloo implements QlooClient {
  constructor(
    private apiKey: string,
    private baseUrl = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com',
  ) {}

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { headers: { 'X-Api-Key': this.apiKey } });
    if (!res.ok) throw new Error(`Qloo ${path} failed: ${res.status}`);
    return res.json();
  }

  async searchEntities(query: string): Promise<QlooEntityRef[]> {
    const raw = (await this.get('/v2/search', { query, take: '4' })) as {
      results?: { entity_id?: string; name?: string; subtype?: string }[];
    };
    return (raw.results ?? [])
      .filter((r) => r.entity_id && r.name)
      .map((r) => ({ id: r.entity_id!, name: r.name!, domain: DOMAIN_OF(r.subtype) }));
  }

  async affinities(signalIds: string[], filterType: string, take = 6): Promise<QlooAffinity[]> {
    const params: Record<string, string> = { 'filter.type': filterType, take: String(take) };
    signalIds.forEach((id, i) => (params[`signal.interests.entities[${i}]`] = id));
    const raw = (await this.get('/v2/insights', params)) as {
      errors?: { message: string }[];
      results?: { entities?: { name?: string; subtype?: string; query?: { affinity?: number } }[] };
    };
    if (raw.errors?.length) throw new Error(raw.errors[0].message);
    return (raw.results?.entities ?? [])
      .map((r) => ({
        name: r.name ?? '',
        domain: DOMAIN_OF(r.subtype),
        affinity: r.query?.affinity ?? 0,
      }))
      .filter((a) => a.name);
  }
}

/** Runtime factory — requires QLOO_API_KEY (set in .env.local or the host env). */
export function buildQlooClient(): QlooClient {
  const key = process.env.QLOO_API_KEY;
  if (!key) {
    throw new Error('QLOO_API_KEY is not set — add it to .env.local (local) or the host environment (deployed).');
  }
  return new HttpQloo(key, process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com');
}

