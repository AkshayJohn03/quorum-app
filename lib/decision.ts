/**
 * The verdict layer for free-text concepts.
 *
 * The receipts are already concept-derived (the agent planned the Qloo
 * searches from the user's words), so the decision reads the STRENGTH of the
 * intersection: high affinity + panel enthusiasm = GO; weak intersection =
 * PIVOT toward whatever the data prefers; direct clashes + rejection = NO-GO.
 */
import type { Claim, DecisionReport, PanelStatement, SegmentFingerprint } from './types';

export function decide(
  idea: string,
  fingerprint: SegmentFingerprint,
  claims: Claim[],
  panel: PanelStatement[],
): DecisionReport {
  const receipts = fingerprint.receipts;
  const fitScore = receipts.length
    ? Math.round((receipts.reduce((acc, r) => acc + r.affinity, 0) / receipts.length) * 100) / 100
    : 0;

  const enthusiasts = panel.filter((s) => s.stance === 'enthusiast');
  const rejectors = panel.filter((s) => s.stance === 'rejector');
  const grounded = panel.filter((s) => s.grounded).length;
  const groundingRate = panel.length ? grounded / panel.length : 0;

  // verdict ladder — fit is measured, rejection is honest
  let verdict: DecisionReport['verdict'];
  if (rejectors.length >= 2 || fitScore < 0.35) {
    verdict = 'NO-GO';
  } else if (enthusiasts.length >= 2 && fitScore >= 0.6 && rejectors.length === 0) {
    verdict = 'GO';
  } else {
    verdict = 'PIVOT';
  }

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

  const reasons = receipts.slice(0, 3).map((r) => ({
    text: `Measured resonance: this audience over-indexes on ${r.entity} (${r.domain}, affinity ${r.affinity.toFixed(2)})${r.note ? ` — found via "${r.note}"` : ''}.`,
    receipts: [r],
  }));
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
