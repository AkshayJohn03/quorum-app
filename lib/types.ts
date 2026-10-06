/** Shared types for the Quorum engine. */

/** A Qloo entity reference with its measured affinity to the segment. */
export interface Receipt {
  entity: string;
  domain: string; // music | dining | film | fashion | brands | places
  affinity: number; // 0..1 over-index score from Qloo insights
  note?: string;
}

/** The measured fingerprint of the target audience. */
export interface SegmentFingerprint {
  segmentLabel: string; // e.g. "Austin record collectors, 25–34"
  geo: string;
  receipts: Receipt[];
  /** cross-domain chains: loving A predicts B (entity → entity, with score) */
  chains: { from: string; to: string; affinity: number }[];
  /** street-lift measurement: does adding the street amplify the concept's audience? */
  stats?: {
    intersectionMean: number; // mean affinity, concept signals + street
    conceptOnlyMean: number;  // mean affinity, concept signals alone
    lift: number;             // intersectionMean - conceptOnlyMean
  };
}

/** One testable claim decomposed from the user's idea. */
export interface Claim {
  id: string;
  text: string; // e.g. "students will pay ₹250 for a listening bar"
  kind: 'audience-fit' | 'price' | 'format' | 'gap';
}

/** One panelist's turn, grounded in receipts. */
export interface PanelStatement {
  panelist: string; // archetype name, e.g. "Maya, 27 — record collector"
  segmentLabel: string;
  stance: 'enthusiast' | 'skeptical' | 'rejector' | 'neutral';
  text: string;
  /** receipts this statement is grounded in (must be ≥1 to count as grounded) */
  groundedIn: Receipt[];
  grounded: boolean;
  /** set when the agent ran an adaptive follow-up Qloo query on this turn */
  adaptiveProbe?: string;
}

export interface QlooEntityRef {
  id: string;
  name: string;
  domain: string;
}

export interface QlooAffinity {
  name: string;
  domain: string;
  affinity: number;
}

export interface QlooClient {
  searchEntities(query: string): Promise<QlooEntityRef[]>;
  affinities(signalIds: string[], filterType: string, take?: number): Promise<QlooAffinity[]>;
}

export interface VerdictReport {
  idea: string;
  segmentLabel: string;
  groundingRate: number; // 0..1 — % of statements with ≥1 receipt
  verdict: 'loved' | 'mixed' | 'rejected';
  loves: string[]; // claims that resonated, with reason
  rejects: { claim: string; reason: string }[];
  gap: string | null; // demand-supply gap the panel surfaced
  nextInterviews: string[]; // the real people to talk to next
  statements: PanelStatement[];
}

/** A pre-defined F&B concept founders can pick. */
export interface ConceptPreset {
  id: string;
  label: string;
  priceBand: string;
  tags: string[];      // matched against neighborhood receipts
  conflicts: string[]; // neighborhood signals that directly clash
}

/** The go/no-go decision report for a concept at a neighborhood. */
export interface DecisionReport {
  idea: string;
  concept: string;
  neighborhood: string;
  verdict: 'GO' | 'PIVOT' | 'NO-GO';
  fitScore: number;          // 0..1
  groundingRate: number;     // 0..1 — % of panel statements with Qloo receipts
  reasons: { text: string; receipts: Receipt[] }[];
  conflicts: { text: string; receipts: Receipt[] }[];
  pivot: { concept: string; why: string; receipts: Receipt[] } | null;
  gap: string | null;
  panel: PanelStatement[];
  nextInterviews: string[];
  segmentLabel: string;
}
