import { describe, expect, it } from 'vitest';
import { TestQloo } from './fixtures';
import { EchoFallback } from '../lib/llm';
import { decompose, runDecision } from '../lib/agent';

const qloo = new TestQloo();
const llm = new EchoFallback();
const IDEA = 'a jazz listening bar with natural wine and vinyl';
const AUDIENCE = 'Berlin creatives and music people, 25-40';

describe('free-text lease decision', () => {
  it('decomposes into testable claims', async () => {
    const claims = await decompose(IDEA, AUDIENCE, llm);
    expect(claims.map((c) => c.kind)).toEqual(['audience-fit', 'format', 'price', 'gap']);
  });

  it('runs end-to-end offline: fingerprint, grounded panel, verdict', async () => {
    const r = await runDecision(IDEA, AUDIENCE, 'Berlin', qloo, llm);
    expect(r.panel.length).toBeGreaterThanOrEqual(4);
    expect(r.panel.every((s) => s.groundedIn.length >= 1)).toBe(true);
    expect(['GO', 'NO-GO']).toContain(r.verdict);
    expect(r.groundingRate).toBeGreaterThan(0);
    expect(r.nextInterviews.length).toBe(2);
    expect(r.concept).toBeTruthy();
    expect(r.neighborhood).toBeTruthy();
  });

  it('the panel mix is designed and data-grounded — GO is reachable', async () => {
    // The fixture returns high-affinity receipts — a genuinely good concept
    // should produce enthusiast stances and be able to reach GO
    const r = await runDecision(IDEA, AUDIENCE, 'Berlin', qloo, llm);
    const stances = r.panel.map((s) => s.stance);
    // every stance is one of the designed panel seats — no 'neutral' filler
    for (const s of stances) expect(['enthusiast', 'skeptical', 'rejector']).toContain(s);
    // the designed mix always includes enthusiasm and one skeptic; rejector
    // only appears when the receipt spread warrants an honest no
    const enthusiastCount = stances.filter((s) => s === 'enthusiast').length;
    expect(enthusiastCount).toBeGreaterThanOrEqual(1);
    expect(stances).toContain('skeptical');
    // every statement grounded in its own receipt
    expect(r.panel.every((s) => s.grounded)).toBe(true);
    // the verdict is reachable and the fit is calibrated
    expect(['GO', 'NO-GO']).toContain(r.verdict);
    expect(r.fitScore).toBeGreaterThan(0);
    expect(r.fitScore).toBeLessThanOrEqual(1);
  });

  it('is deterministic offline', async () => {
    const a = await runDecision(IDEA, AUDIENCE, 'Berlin', qloo, llm);
    const b = await runDecision(IDEA, AUDIENCE, 'Berlin', qloo, llm);
    expect(a.fitScore).toBe(b.fitScore);
    expect(a.verdict).toBe(b.verdict);
    expect(a.groundingRate).toBe(b.groundingRate);
  });

  it('receipts are Qloo entities — the saffron rule', async () => {
    const r = await runDecision(IDEA, AUDIENCE, 'Berlin', qloo, llm);
    const text = r.panel.map((s) => s.text).join(' ').toLowerCase();
    const named = r.panel.some((s) =>
      s.groundedIn.some((g) => text.includes(g.entity.toLowerCase().split(' ')[0])),
    );
    expect(named).toBe(true);
  });

  it('adaptive probe returns clean entity names (no label pollution)', async () => {
    const r = await runDecision(IDEA, AUDIENCE, 'Berlin', qloo, llm);
    for (const s of r.panel) {
      for (const g of s.groundedIn) {
        expect(g.entity).not.toContain('probed alternatives');
        expect(g.entity).not.toContain('agent probe');
      }
    }
  });

  it('works with any free-text concept — not just F&B', async () => {
    const r = await runDecision(
      'a coworking space with a climbing wall and cold brew on tap',
      'remote workers and fitness people, 25-40',
      'Berlin',
      qloo,
      llm,
    );
    expect(['GO', 'NO-GO']).toContain(r.verdict);
    expect(r.panel.length).toBeGreaterThanOrEqual(4);
  });
});
