/**
 * The verdict layer for free-text concepts.
 *
 * The receipts are already concept-derived (the agent planned the Qloo
 * searches from the user's words), so the decision reads the STRENGTH of the
 * intersection: high affinity + panel enthusiasm = GO; weak intersection =
 * PIVOT toward whatever the data prefers; direct clashes + rejection = NO-GO.
 */
import type { Claim, DecisionReport, PanelStatement, Receipt, SegmentFingerprint } from './types';

export function decide(
  idea: string,
  fingerprint: SegmentFingerprint,
  claims: Claim[],
  panel: PanelStatement[],
): DecisionReport {
  const receipts = fingerprint.receipts;
  const enthusiasts = panel.filter((s) => s.stance === 'enthusiast');
  const rejectors = panel.filter((s) => s.stance === 'rejector');
  const grounded = panel.filter((s) => s.grounded).length;
  const groundingRate = panel.length ? grounded / panel.length : 0;

  // a HARD no is a rejector whose own measured receipt is weak — the data itself
  // rejects. A contrarian (rejector whose taste receipts are strong) is friction,
  // surfaced in conflicts, but doesn't block a genuinely hot intersection.
  const hardNo = rejectors.some((s) => (s.groundedIn[0]?.affinity ?? 1) < 0.55);

  // FIT = STREET LIFT, not raw affinity. Qloo's top returned affinities are
  // ceiling-capped for any intersection, so the discriminating question is:
  // does adding this street AMPLIFY the concept's own measured audience?
  // lift > 0 → the street pulls the concept's people in; lift < 0 → dilutes.
  const stats = fingerprint.stats;
  const intersectionMean = stats?.intersectionMean
    ?? (receipts.length ? receipts.reduce((a, r) => a + r.affinity, 0) / receipts.length : 0);
  const conceptOnlyMean = stats?.conceptOnlyMean ?? intersectionMean;
  const lift = intersectionMean - conceptOnlyMean;
  // calibrate: 0 lift → 50; +0.1 lift (a real amplification) → 80; −0.1 → 20
  const fitScore = Math.round(Math.min(0.98, Math.max(0.05, 0.5 + lift * 3)) * 100) / 100;

  // verdict ladder — the street must measurably help the concept
  let verdict: DecisionReport['verdict'];
  if (hardNo || intersectionMean < 0.35 || lift < -0.03) {
    verdict = 'NO-GO';
  } else if (lift > 0.02 && enthusiasts.length >= 2) {
    verdict = 'GO';
  } else {
    verdict = 'PIVOT';
  }

  const liftPct = Math.round(lift * 1000) / 10;
  const liftText = lift > 0.005
    ? `Street lift +${liftPct} pts: adding ${fingerprint.geo} to the concept's audience RAISES measured affinity (${(conceptOnlyMean * 100).toFixed(0)} → ${(intersectionMean * 100).toFixed(0)}) — this street amplifies the concept.`
    : lift < -0.005
      ? `Street lift ${liftPct} pts: adding ${fingerprint.geo} DILUTES the concept's audience (${(conceptOnlyMean * 100).toFixed(0)} → ${(intersectionMean * 100).toFixed(0)}) — the intersection is weaker than the concept alone.`
      : `Street lift ≈ 0: ${fingerprint.geo} neither amplifies nor dilutes this concept's audience — the concept would perform the same anywhere.`;

  // pivot: the strongest receipt domain becomes the recommended direction
  const strongest = receipts[0];
  const pivot: DecisionReport['pivot'] =
    verdict === 'GO'
      ? null
      : strongest
        ? {
            concept: `lean the concept toward ${strongest.domain}: ${strongest.entity}`,
            why: `The strongest measured signal in this intersection is ${strongest.entity} (affinity ${strongest.affinity.toFixed(2)}, ${strongest.domain}) — the panel's energy is there.`,
            receipts: [strongest],
          }
        : null;

  const reasons = [
    { text: liftText, receipts: [] as Receipt[] },
    ...receipts.slice(0, 2).map((r) => ({
      text: `Measured resonance: this audience over-indexes on ${r.entity} (${r.domain}, affinity ${r.affinity.toFixed(2)})${r.note ? ` — found via "${r.note}"` : ''}.`,
      receipts: [r],
    })),
  ];
  const conflicts = rejectors.map((s) => ({
    text: `Panel rejection (${s.panelist}): ${s.text}`,
    receipts: s.groundedIn,
  }));

  const gapReceipt = receipts.find(
    (r) => r.affinity > 0.6 && !panel.some((s) => s.groundedIn.some((g) => g.entity === r.entity)),
  );

  return {
    idea,
    concept: `an audience-tested version of: ${idea}`,
    neighborhood: fingerprint.segmentLabel,
    verdict,
    fitScore,
    groundingRate: Math.round(groundingRate * 100) / 100,
    reasons,
    conflicts,
    pivot,
    gap: gapReceipt
      ? `Unserved demand: this intersection over-indexes on ${gapReceipt.entity} (affinity ${gapReceipt.affinity.toFixed(2)}) with nothing in the plan addressing it — that is the gap to study first.`
      : null,
    panel,
    nextInterviews: [
      `Three people from the strongest measured segment — they over-index on ${receipts[0]?.entity ?? 'the core signal'} at ${receipts[0]?.affinity.toFixed(2) ?? 'n/a'}`,
      rejectors.length
        ? `One ${rejectors[0].stance} panelist profile — the honest no tells you what to change`
        : 'One skeptic outside the panel — actively find the no before the lease is signed',
    ],
    segmentLabel: fingerprint.segmentLabel,
  };
}
