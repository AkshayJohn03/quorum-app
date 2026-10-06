# Quorum — a focus group in a box

**Describe an idea, pick an audience, and watch a grounded panel react — every reaction cited with real Qloo affinity data.**

Qloo Agentic Hackathon entry ("Agents, but with taste" — deadline Oct 30, 2026).

---

## 🟢 What this is, in plain words

Before you spend weeks (or lakhs) building something, show it to your customers. Real focus groups cost $10–40k. Quorum runs one in minutes:

1. **You describe an idea** ("a listening bar — vinyl, high-end coffee, no talking past 8pm") and pick an audience ("Austin record collectors, 25–34").
2. The agent **builds that audience as a measured fingerprint** from Qloo's cross-domain taste graph — 250M entities spanning music, film, dining, brands, places.
3. A panel of 4+ participants **reacts through their real fingerprint** — enthusiasm, skepticism, outright rejection — and every single reaction **cites its Qloo receipt**: the entity, the domain, the affinity score.
4. The **verdict report** tells you who loves it, who rejects it and why, the demand-supply gap ("this audience over-indexes on late-night vinyl culture — nothing nearby serves it"), and **the exact people to talk to next**.

**The honesty clause:** synthetic panels generate hypotheses — they don't predict the future. The report ends by telling you which *real* people to interview next. Grounded guessing, honestly labeled.

**Why it can only exist with Qloo:** the panelists' opinions are *derived from* measured cross-domain affinities. Remove Qloo and there are no receipts, no fingerprints, no panel — just an LLM making things up. (That's the competition's own load-bearing test, passed at the root.)

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
QUORUM_LLM_API_KEY=...      # any OpenAI-compatible endpoint
QUORUM_LLM_BASE_URL=...     # optional override
QUORUM_LLM_MODEL=...        # optional override
```

Deploy on Vercel (`next build`) — the live demo is the submission.

## Architecture (deliberately standalone)

```
app/page.tsx                 form → live panel transcript → verdict report
app/api/quorum/run/route.ts  POST {idea, audience, geo} → full run (60s cap)
lib/qloo.ts                  QlooClient protocol: MockQloo (fixtures) + HttpQloo (live)
lib/llm.ts                   LLMClient protocol: OpenAI-compatible + deterministic fallback
lib/agent.ts                 decompose → fingerprint → grounded panel → adaptive probe → verdict
lib/types.ts                 Receipt · SegmentFingerprint · Claim · PanelStatement · VerdictReport
```

Design decisions:
- **The grounding-rate is the product.** Every panel statement must reference ≥1 fingerprint receipt; statements that fail the check are flagged `ungrounded` and reduce the score shown at the top. The metric is computed, displayed, and tested.
- **The panel includes rejections on purpose.** Enthusiast-only panels are sycophancy. Quorum always convenes skeptics and at least one rejector — the honest no is the most useful output.
- **Adaptive probing:** when a panelist pushes back, the agent runs a follow-up Qloo query ("probed alternatives: …") — the moment in the demo where it's visibly an agent, not a form.
- **Standalone:** no internal frameworks — just Next.js, the Qloo client protocol, and one LLM client. Fewer moving parts, faster demo, honest scope.

## The category and our answer

Synthetic-user research is an emerging category ([Synthetic Users](https://www.syntheticusers.com), [NN/g's evaluation](https://www.nngroup.com/articles/synthetic-users)), and the known criticism is that personas are ungrounded LLM stereotypes. Quorum's contribution is the **grounding layer**: measured cross-domain taste fingerprints from [Qloo](https://qloo.devpost.com/), cited on every claim. Patterns borrowed from open-source simulation work: [Stanford generative agents](https://github.com/joonspk-research/generative_agents), [Concordia](https://github.com/google-deepmind/concordia), [OASIS](https://github.com/camel-ai/oasis).

## Qloo Agentic Hackathon

Theme: "Agents, but with taste." Deadline Oct 30, 2026, 11:45pm EDT. Submission: live demo (this app, deployed) + public repo + write-up. License: MIT.

© 2026 Akshay John Xavier
