/**
 * The verdict layer for free-text concepts.
 *
 * The receipts are already concept-derived (the agent planned the Qloo
 * searches from the user's words), so the decision reads the STRENGTH of the
 * intersection: high affinity + panel enthusiasm = GO; weak intersection =
 * NO-GO when the data is weak, thin, or hard-rejects (two-rung ladder per live audit).
 */
import type { Claim, DecisionReport, PanelStatement, Receipt, SegmentFingerprint } from './types';

export function decide(
  idea: string,
  fingerprint: SegmentFingerprint,
  claims: Claim[],
  panel: PanelStatement[],
  llmMode: 'live' | 'fallback' = 'fallback',
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

  // FIT has two regimes. When both scans returned real affinity data, fit is
  // STREET LIFT: does adding this street amplify the concept's own audience?
  // When the scan was thin (fallback receipts, no differential measurable),
  // fit reads the measured intersection strength directly — and says so.
  //
  // Lift-regime scale is calibrated from the 18-run live audit (2026-10-07):
  // measured lift spans about -1.2 to +2.3 affinity points, so the score is
  // 0.65 (street compatible) + lift in points × 0.14 + a small strength bonus.
  // Amplification of +2.3pts lands ~0.98; dilution of -1.5pts lands ~0.44.
  const stats = fingerprint.stats;
  const liftKnown = !!stats;
  const intersectionMean = stats?.intersectionMean
    ?? (receipts.length ? receipts.reduce((a, r) => a + r.affinity, 0) / receipts.length : 0);
  const conceptOnlyMean = stats?.conceptOnlyMean ?? intersectionMean;
  const lift = intersectionMean - conceptOnlyMean;
  const liftPts = lift * 100; // lift expressed in affinity points
  const clamp = (x: number) => Math.min(0.98, Math.max(0.05, x));
  const fitScore = liftKnown
    ? Math.round(clamp(0.65 + liftPts * 0.14 + (intersectionMean - 0.85) * 0.8) * 100) / 100
    : Math.round(clamp(intersectionMean) * 100) / 100;

  // verdict ladder — two rungs, both honestly reachable (26-run live audit:
  // Qloo's top-N intersection affinities are structurally positive-biased, so
  // a PIVOT band never fires and was dropped per review). GO requires full
  // differential data, healthy fit, and a grounded enthusiastic panel.
  // Everything else is NO-GO: a hard no, weak intersection, or evidence too
  // thin to measure — Quorum does not bless a pairing it couldn't measure.
  // The strongest-domain suggestion still ships on every NO-GO (see `pivot`).
  let verdict: DecisionReport['verdict'];
  if (!liftKnown) {
    verdict = 'NO-GO';
  } else {
    verdict = !hardNo && fitScore >= 0.62 && enthusiasts.length >= 2 ? 'GO' : 'NO-GO';
  }

  const liftPct = Math.round(lift * 1000) / 10;
  const liftReason = !liftKnown
    ? { text: `Street lift not measurable for this pairing — the differential scan was too thin, so the verdict reads the measured intersection strength directly (mean affinity ${(intersectionMean * 100).toFixed(0)}/100).`, receipts: [] as Receipt[] }
    : lift > 0.005
      ? { text: `Street lift +${liftPct} pts: adding ${fingerprint.geo} to the concept's audience RAISES measured affinity (${(conceptOnlyMean * 100).toFixed(0)} → ${(intersectionMean * 100).toFixed(0)}) — this street amplifies the concept.`, receipts: [] as Receipt[] }
      : lift < -0.005
        ? { text: `Street lift ${liftPct} pts: adding ${fingerprint.geo} DILUTES the concept's audience (${(conceptOnlyMean * 100).toFixed(0)} → ${(intersectionMean * 100).toFixed(0)}) — the intersection is weaker than the concept alone.`, receipts: [] as Receipt[] }
        : { text: `Street lift ≈ 0: ${fingerprint.geo} neither amplifies nor dilutes this concept's audience — the street is compatible with the concept.`, receipts: [] as Receipt[] };

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
    liftReason,
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
    fitRegime: liftKnown ? 'lift' : 'strength',
    llmMode,
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
