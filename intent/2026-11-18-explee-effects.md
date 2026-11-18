---
status: approved (owner 2026-11-18, form answers: deliverable both, effects 1-8, no integration; one-prompt run)  # draft → approved → planned → building → verified → shipped (PR #n)
---
# explee.org effects: teardown and a working recreation

## Problem
The owner finds the motion on https://explee.org/ worth learning from for our landing pages. Nobody here knows how it is
built, which library (if any) it uses, or what it does on a phone, so it cannot be reused or judged.

## Outcome
A folder `explee/` in this repo with:
1. `explee/TEARDOWN.md`: for each of the 8 effects below, what the user sees (desktop 1440 px and mobile 390 px), how it
   is built (technique, parameters, timings), and the evidence (the shipped chunk or CSS rule and line it was read from,
   read on 2026-11-18). Every claim is an observation from the shipped files or a recording, or is labelled
   `[INFERENCE]`.
2. `explee/index.html` (+ `explee/effects.css`, `explee/effects.js`): a page that recreates all 8 effects with our own
   code and placeholder copy, no dependency:
   1. Hero: Bézier paths converging on the input from both sides, drawn in with a dash, dots moving along them at
      constant speed (arc-length table), fading in and out at the ends; hidden on mobile like the original.
   2. Rotating stat badge (enter/exit keyframes).
   3. Headline that swaps word pairs with a stagger.
   4. Testimonial marquee, endless, several rows on desktop, one-card carousel feel on mobile.
   5. "Pipeline" stack: sticky cards that stack while scrolling, each with a live mini-UI (agent reading, fit-score
      table, an email typing itself, a chat that books a slot, a campaign table).
   6. Numbers that count up when they enter the viewport.
   7. The stepped pixel dissolve at the edges of blocks leaving the viewport.
   8. Pricing card progress bar and the pulsing status dot.
3. `explee/check.mjs`: a check that loads the demo at 1440 px, at 390 px (touch, mobile) and with reduced motion, and
   fails unless each effect is observed doing its job (pixels change, text swaps, element moves, number reaches its
   target, card sticks), with no console error, no failed request, no horizontal overflow, and no running animation
   under `prefers-reduced-motion: reduce`.

Success: `node explee/check.mjs` exits 0; `node scripts/check.mjs` still exits 0; TEARDOWN covers 8/8 effects with
evidence; an independent review passes.

## Constraints
- Public repo: our own code and placeholder copy only. No explee code, copy, logo, avatars or images copied in; the
  teardown quotes parameter values and describes the technique, it does not paste their source.
- dc-landing rules: no dependency or external script (Google Fonts allowed), Baseline Widely available, every animation
  stops or becomes static under `prefers-reduced-motion: reduce`.
- `explee/` is not published: `.vercelignore` re-includes only the site files, and this work does not change it.

## Out of scope
- Putting any effect into the landing page `index.html` (a later intent).
- Deploying anything; merging to `main` (the owner is asked after review, since a merge publishes the source).
- Explee's other pages, product app, analytics and chat widget.
- Pixel-exact parity with explee: the recreation matches technique and feel, not their layout.

## Open questions
None.
