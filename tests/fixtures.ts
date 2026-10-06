/** Test-only Qloo mock: deterministic fixtures matching the real API shapes. */
import type { QlooAffinity, QlooClient, QlooEntityRef } from '../lib/qloo';

const SEARCH_DB: Record<string, { id: string; name: string; domain: string }[]> = {
  jazz: [
    { id: 'jazz-001', name: 'Blue Note', domain: 'place' },
    { id: 'jazz-002', name: 'Kamasi Washington', domain: 'artist' },
  ],
  'natural wine': [
    { id: 'wine-001', name: 'DiWine Natural Wine Bar', domain: 'place' },
    { id: 'wine-002', name: 'Grape Witches', domain: 'brand' },
  ],
  berlin: [
    { id: 'berlin-001', name: 'Berlin', domain: 'place' },
  ],
  'east austin': [
    { id: 'eaustin-001', name: 'East Austin', domain: 'place' },
  ],
};

const AFFINITY_DB: Record<string, { name: string; domain: string; affinity: number }[]> = {
  'jazz-001|wine-002|berlin-001': [
    { name: 'Atrium Tower', domain: 'place', affinity: 0.91 },
    { name: 'Natural Wine Co', domain: 'brand', affinity: 0.87 },
    { name: 'Kamasi Washington', domain: 'artist', affinity: 0.84 },
    { name: 'Berlin Coffee Roasters', domain: 'brand', affinity: 0.79 },
  ],
};

export class TestQloo implements QlooClient {
  async searchEntities(query: string): Promise<QlooEntityRef[]> {
    const q = query.toLowerCase();
    for (const [key, entries] of Object.entries(SEARCH_DB)) {
      if (q.includes(key)) return entries.map((e) => ({ id: e.id, name: e.name, domain: e.domain }));
    }
    // return the first fixture that has any data
    for (const entries of Object.values(SEARCH_DB)) {
      if (entries.length) return entries.map((e) => ({ id: e.id, name: e.name, domain: e.domain }));
    }
    return [];
  }

  async affinities(signalIds: string[], filterType: string, take = 6): Promise<QlooAffinity[]> {
    const key = signalIds.join('|');
    // try exact match first, then any combo
    for (const [k, affs] of Object.entries(AFFINITY_DB)) {
      if (signalIds.some((id) => k.includes(id))) {
        return affs.slice(0, take);
      }
    }
    return [
      { name: 'Test Venue', domain: 'place', affinity: 0.85 },
      { name: 'Test Brand', domain: 'brand', affinity: 0.78 },
      { name: 'Test Artist', domain: 'artist', affinity: 0.72 },
    ].slice(0, take);
  }
}

export { SEARCH_DB, AFFINITY_DB };
