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

/** The Qloo entity domains scanned for insights — used to sweep the taste graph.
 * video_game is excluded: the hackathon insights endpoint rejects
 * urn:entity:video_game as a filter.type with HTTP 400, deterministically
 * (18/18 live runs, identical signal sets succeed for all sibling domains). */
export const QLOO_DOMAINS = [
  'brand',
  'place',
  'artist',
  'movie',
  'tv_show',
  'podcast',
  'book',
  'destination',
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

/** Per-call evidence: one entry per HTTP call the client makes. */
export interface QlooCallTrace {
  call: string; // 'search' | 'insights'
  summary: string; // query, or filterType + signal count
  status: number; // HTTP status (200 even when the body carries errors[])
  results: number; // entities returned (0 on failure)
  ms: number;
  error?: string; // thrown message — HTTP failure OR body-level errors[]
  retries?: number; // 429 retry count when > 0
}

export class HttpQloo implements QlooClient {
  private traces: QlooCallTrace[] = [];
  // CONFIRMED CAUSE (live trace, 2026-10-07): parallel bursts trip Qloo's
  // per-key 429 rate limit within ~2s — 27/32 calls failed and
  // Promise.allSettled swallowed them. Every call therefore takes a numbered
  // slot with a minimum gap, and 429s retry honoring Retry-After.
  private nextSlotAt = 0;
  private static readonly MIN_GAP_MS = 320;

  constructor(
    private apiKey: string,
    private baseUrl = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com',
  ) {}

  /** Evidence collected this invocation — read once at the end of a run. */
  drainTrace(): QlooCallTrace[] {
    const t = this.traces;
    this.traces = [];
    return t;
  }

  private async get(path: string, params: Record<string, string>, summary: string, call: string): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const started = Date.now();
    let status = 0;
    let raw: { errors?: unknown[]; results?: unknown } = {};
    let error: string | undefined;
    let retries = 0;
    try {
      for (;;) {
        // take a spaced slot before every attempt (parallel callers serialize here)
        const now = Date.now();
        if (now < this.nextSlotAt) await new Promise((r) => setTimeout(r, this.nextSlotAt - now));
        this.nextSlotAt = Date.now() + HttpQloo.MIN_GAP_MS;

        const res = await fetch(url, { headers: { 'X-Api-Key': this.apiKey } });
        status = res.status;
        if (res.status === 429 && retries < 2) {
          retries++;
          const ra = Number(res.headers.get('retry-after'));
          const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 8000) : 1200 * retries;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        raw = (await res.json()) as typeof raw;
        if (!res.ok) throw new Error(`Qloo ${path} failed: ${res.status}`);
        if (raw.errors?.length) throw new Error(String((raw.errors as { message?: string }[])[0]?.message ?? 'body errors[]'));
        return raw;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      const ms = Date.now() - started;
      const results = Array.isArray(raw.results) ? raw.results.length : (raw as { results?: { entities?: unknown[] } })?.results?.entities?.length ?? 0;
      this.traces.push({ call, summary, status, results, ms, error, retries: retries || undefined });
      if (error) console.error(`[quorum] ${call} FAILED (${status}, ${ms}ms, ${retries} retries) ${summary}: ${error}`);
    }
  }

  async searchEntities(query: string): Promise<QlooEntityRef[]> {
    const raw = (await this.get('/v2/search', { query, take: '4' }, `query="${query}"`, 'search')) as {
      results?: { entity_id?: string; name?: string; subtype?: string }[];
    };
    return (raw.results ?? [])
      .filter((r) => r.entity_id && r.name)
      .map((r) => ({ id: r.entity_id!, name: r.name!, domain: DOMAIN_OF(r.subtype) }));
  }

  async affinities(signalIds: string[], filterType: string, take = 6): Promise<QlooAffinity[]> {
    const params: Record<string, string> = { 'filter.type': filterType, take: String(take) };
    signalIds.forEach((id, i) => (params[`signal.interests.entities[${i}]`] = id));
    const summary = `${filterType.replace('urn:entity:', '')} × ${signalIds.length} signals`;
    const raw = (await this.get('/v2/insights', params, summary, 'insights')) as {
      results?: { entities?: { name?: string; subtype?: string; query?: { affinity?: number } }[] };
    };
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
export function buildQlooClient(): HttpQloo {
  const key = process.env.QLOO_API_KEY;
  if (!key) {
    throw new Error('QLOO_API_KEY is not set — add it to .env.local (local) or the host environment (deployed).');
  }
  return new HttpQloo(key, process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com');
}

