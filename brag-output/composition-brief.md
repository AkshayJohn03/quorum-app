# Hyperframes Composition Brief: Quorum

## Objective
Create a short launch-style brag video for Quorum — a focus group in a box (Qloo Agentic Hackathon entry).

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds (15–25s hard range)

## Source Material
- Project root: `D:\aria\Projects\Quorum`
- Primary files read: `app/page.tsx` (3-step founder flow + verdict dashboard), `app/globals.css` (full design system), `README.md`, `app/layout.tsx` (fonts)
- Product name: Quorum
- Tagline / strongest claim: "The lease is three years. The panel, three minutes."
- Key UI or visual moment to recreate: the verdict dashboard — giant serif GO verdict pill, hairline meters (concept–street fit / grounding rate), receipt-cited panel transcript; and the PromptBar-style concept input (white card, rounded-2xl, glowing blue-amber focus ring)
- Copy that must appear verbatim:
  - "The lease is three years."
  - "The panel, three minutes."
  - "a natural wine bar with vinyl listening nights"
  - "Rainey Street, Austin"
  - "Qloo taste graph · 250M entities"
  - "receipt: Austin Street Brewery · brand · 0.91"
  - "GO"
  - "Street lift +2.2 pts — this street amplifies your concept."
  - "Quorum."
  - "quorum-akshay.vercel.app"

## Creative Direction
- Tone preset: `polished`
- Creative direction: "quiet premium product film — editorial serif on bone paper; the product's honesty is the punchline"
- Interpretation: fewer scenes, longer holds, soft crossfades. Type does the acting; no flash, no zoom-slop. Every claim lands as calmly as a receipt. SFX minimal but present.
- Angle: The most expensive guess in hospitality is *right concept, wrong street* — a lease is three years, a real focus group costs $10–40k. Quorum runs one in minutes, and its panelists can't make things up: receipts sit under every sentence. The restraint IS the flex.
- Hook: giant serif "The lease is three years." → italic beat "The panel, three minutes."
- Outro / punchline: lift line → wordmark "Quorum." + "Grounded hypotheses. Real people to call." + quorum-akshay.vercel.app
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Risers/whooshes; anything louder than the bed

## Visual Identity
- Background: #FBFBFA (bone paper)
- Text: #141414 (charcoal ink); muted gray #6B6B6B for receipts/labels
- Accent: #1F6C9F (measured blue); secondary amber #E8B44A
- Verdict palette: GO #28875A on #E4F0E8 · PIVOT #B87914 on #F7EFDE · NO-GO #A32B2B on #F5E4E4
- Hairlines/borders: #EAEAEA; card background: #FFFFFF
- Display font: Instrument Serif (italic for emphasis words)
- Body font: Hanken Grotesk; JetBrains Mono for receipts/tags/labels (all three via Google Fonts)
- Visual references from the project: rounded-2xl prompt card with 1.5px gradient focus ring (blue→amber); mono uppercase micro-labels (0.58rem-style, tracking-wide); hairline-bordered dashboard with 3px fill bars; stance chips colored by stance; breathing pulse dot

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 4s — two serif typographic beats on bone paper ("The lease is three years." → "The panel, three minutes." with the em-dash landing like a gavel); tiny "Quorum." wordmark top-left
2. The concept — 4s — the prompt card recreated; the concept types character by character; three starter chips appear one by one under it; mono tag "Qloo taste graph · 250M entities" inside the card footer
3. The street + convening — 3.5s — "Rainey Street, Austin" types fast; field dims; the breathing pulse dot takes center-frame with two mono agent trace lines ("scanning all 10 Qloo domains…" → "computing the grounding rate…")
4. The panel with receipts — 5.5s — four transcript turns slide in one by one (0.9s apart) and STAY; each turn = name + colored stance chip + one speech line + mono receipt line stamping in just after its speaker ("receipt: Austin Street Brewery · brand · 0.91"); include one skeptic turn ("Convince me this is worth changing my routine for.")
5. Verdict + outro — 3.5s — giant serif GO lands in the green pill; two hairline meters fill (concept–street fit; grounding 100% receipt-cited); lift line fades in; cut to wordmark outro "Quorum." + "Grounded hypotheses. Real people to call." + quorum-akshay.vercel.app

Reading-time floors: hook line 1 = 1.4s settled; every panel speech line ≥ 1.2s settled; receipts ≥ 0.8s settled. Sequential text never snaps closer than 0.9s apart.

## Audio
- Audio role: warm minimal bed with sparse, precise accents — a premium film, not a hype edit
- Audio arc: fade in over 1s → sits low through type/convene/receipts → gentle swell at the verdict → fade out under the wordmark
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady and clean — the polished pick), copied to `brag-output/composition/assets/music/`
- Music treatment: volume 0.22–0.28; fade in 1s, gentle swell near 16.5s (verdict), full fade-out under the outro wordmark
- Music cue guidance: bundled preset at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` — use its strongCues for at most 1–3 locks: the hook's second line, the first receipt stamp, and the GO landing; use beats[] to snap the four panel turns only if spacing stays ≥ 0.9s, otherwise natural timing
- Audio-reactive treatment: subtle; let the pulse dot's glow and the prompt card's focus ring breathe very slightly with RMS. No waveform/equalizer visuals, no text scaling.
- Audio-coupled moments:
  - Scene 2 concept typing — randomized `keyboard/keypress-*.wav` ticks, quiet (0.35–0.5)
  - Scene 4 receipt stamps — `interface/drop_001`-class soft drops, one per receipt, at the stamp moment, sparse (skip if the edit feels busy)
  - Scene 5 GO landing — single low thud (`impact/impactSoft_medium_*` at low volume or `interface/bong_001` very quiet)
- SFX selection guidance: coherent and minimal — key ticks, soft drops, one thud. Prefer low high-frequency-risk files (see `sfx-analysis.md`). Nothing aggressive; silence between stamps is allowed.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` — prefer low HF-risk picks for the repeated receipt stamps
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, volume after the animation exists
- Audio files: copy chosen music + SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI recreation from the source project (the prompt card and/or verdict dashboard).
- Keep all text readable in the final render (honor the reading-time floors above).
- Keep the video within 15–25 seconds.
- Include the planned music/SFX layer (music vol-12 is mandatory; it ships with this brief's assets).
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints; ignore cues that hurt readability, pacing, or story.
- Use only 1–3 strong-cue locks total; mark them `// beat-locked: <t>s`. Sequential reveals snap to beats only when spacing stays readable; mark `// beat-grid: ...` or use natural timing.
- When music is present, extract audio data per the `hyperframes-creative` audio-reactive workflow and wire at least one subtle visual element (pulse dot glow / card ring). If extraction is unavailable, note it and continue — do not block the render.
- Use local assets for audio and any required runtime/media dependencies.
- Run `npx hyperframes check` inside `brag-output/composition/` before render — it is the single gate.
