# Quorum — a focus group in a box

**Describe a concept, pick a street, and watch a grounded panel of that neighborhood react — every reaction cited with real Qloo affinity data, ending in a GO / PIVOT / NO-GO verdict.**

Qloo Agentic Hackathon entry ("Agents, but with taste" — deadline Oct 30, 2026).

---

## 🟢 What this is, in plain words

The most expensive guess in hospitality is *right concept, wrong street* — a lease is 3 years, a focus group costs $10–40k, and most founders get neither. Quorum runs the focus group in minutes:

1. **Describe the concept in your head** — free text, any idea ("a natural wine bar with vinyl listening nights for young families").
2. **Pick the street you're signing for** — "Rainey Street, Austin", "Shoreditch, London", anywhere Qloo knows.
3. The agent **measures the intersection**: your concept's audience signals × the street's place signal, scanned across all 10 Qloo domains (brands, places, artists, movies, TV, podcasts, books, destinations, games, people) over Qloo's 250M-entity taste graph.
4. A **panel of 4 locals reacts through their measured fingerprint** — enthusiasts, a designed skeptic, and (when the data has spread) a rejector — and every sentence **cites its Qloo receipt**: the entity, the domain, the affinity.
5. The **verdict** — GO, PIVOT (toward what the data prefers), or NO-GO — plus the unserved demand gap and the exact real people to interview before signing.

### The fit metric is street lift (not raw affinity)

Qloo's top returned affinities are ceiling-capped — any intersection scores ~0.9, so raw strength can't discriminate a good corner from a bad one. Quorum asks the discriminating question instead: **does adding this street amplify the concept's own measured audience?**

```
intersection scan  = affinities(concept signals + street signal)   → mean A
concept-only scan  = affinities(concept signals alone)             → mean B
street lift        = A − B
```

- **GO** — the street measurably amplifies the concept's audience (lift > +2 pts) and the panel carries ≥2 grounded enthusiasts.
- **PIVOT** — the intersection is strong but the street neither helps nor hurts; the verdict names the domain the data prefers instead.
- **NO-GO** — the street dilutes the concept (lift < −3 pts), the intersection is weak, or a panelist's own measured receipt hard-rejects.

**The honesty clause:** synthetic panels generate hypotheses — they don't predict the future. Every report names the *real* people to interview next. Grounded guessing, honestly labeled.

**Why it can only exist with Qloo:** the panelists' opinions are *derived from* measured cross-domain affinities. Remove Qloo and there are no receipts, no fingerprints, no lift — just an LLM making things up. (That's the competition's own load-bearing test, passed at the root.)

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # offline engine tests (mock Qloo)
```

**Requires `QLOO_API_KEY`** in `.env.local` or your Vercel project env for live data. Without it, the API routes return a clear error (the engine itself is tested offline with mock fixtures).

```bash
# .env.local
QLOO_API_KEY=...            # https://docs.qloo.com — hackathon keys hit hackathon.api.qloo.com
QUORUM_LLM_API_KEY=...      # any OpenAI-compatible endpoint (optional — offline voice is deterministic)
QUORUM_LLM_BASE_URL=...     # optional override
QUORUM_LLM_MODEL=...        # optional override
```

Deploy on Vercel (`next build`) — the live demo is the submission.

## Architecture (deliberately standalone)

```
app/page.tsx                     concept → street → verdict dashboard (3-step founder flow)
app/api/quorum/decision/route.ts POST {concept, neighborhood} → full verdict report
app/api/quorum/stream/route.ts   SSE variant — live agent trace as the run happens
app/api/quorum/places/route.ts   debounced street search against Qloo /v2/search
app/api/quorum/compare/route.ts  grounded vs ungrounded panel side-by-side
lib/qloo.ts                      QlooClient protocol: HttpQloo (live) — 10-domain scan
lib/llm.ts                       LLMClient protocol: kind: 'live' | 'fallback' (minification-proof)
lib/agent.ts                     plan → fingerprint (+street lift) → grounded panel → decision
lib/decision.ts                  fitScore = street lift · verdict ladder · gap + pivot
lib/types.ts                     Receipt · SegmentFingerprint · Claim · PanelStatement · DecisionReport
```

Design decisions:
- **The grounding-rate is the product.** Every panel statement must reference ≥1 fingerprint receipt; ungrounded statements are flagged and the rate is displayed at the top of every report. The metric is computed, displayed, and tested.
- **The panel mix is designed, the opinions are measured.** Enthusiast-only panels are sycophancy: seat 2 is always a skeptic, seat 4 is a rejector whenever the receipt spread warrants one — but every stance speaks strictly through its own Qloo receipt.
- **Street lift is the honest fit.** Absolute affinity can't discriminate (everything caps at ~0.9). Lift can: it separates "this street pulls your people in" from "your concept performs the same anywhere".
- **Standalone:** no internal frameworks — just Next.js, the Qloo client protocol, and one LLM client. Fewer moving parts, faster demo, honest scope.

## The category and our answer

Synthetic-user research is an emerging category ([Synthetic Users](https://www.syntheticusers.com), [NN/g's evaluation](https://www.nngroup.com/articles/synthetic-users)), and the known criticism is that personas are ungrounded LLM stereotypes. Quorum's contribution is the **grounding layer**: measured cross-domain taste fingerprints from [Qloo](https://qloo.devpost.com/), cited on every claim. Patterns borrowed from open-source simulation work: [Stanford generative agents](https://github.com/joonspk-research/generative_agents), [Concordia](https://github.com/google-deepmind/concordia), [OASIS](https://github.com/camel-ai/oasis).

## Qloo Agentic Hackathon

Theme: "Agents, but with taste." Deadline Oct 30, 2026, 11:45pm EDT. Submission: live demo (this app, deployed) + public repo + write-up. License: MIT.

© 2026 Akshay John Xavier
