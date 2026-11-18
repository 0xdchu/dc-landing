---
status: verified (owner approved 2026-11-18, form answers: deliverable both, effects 1-8, no integration; one-prompt run; push + PR, no merge)  # draft → approved → planned → building → verified → shipped (PR #n)
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
      constant speed (arc-length table), fading in and out at the ends, speeding up while the pointer is over the
      input; paused off-screen; hidden on mobile like the original.
   2. Rotating stat badge (blur + slide enter/exit keyframes).
   3. Headline that swaps word pairs with a per-word stagger (shipped in explee's code for its closing CTA; not
      rendered on the homepage on 2026-11-18).
   4. Testimonial marquee: three rows drifting in alternate directions, endless, pausing on hover, draggable, edge
      fade; one swipe row with scroll snap on mobile.
   5. "Pipeline" stack: sticky cards that stack while scrolling, earlier cards shrinking; the first card's mini-UI is
      live (an agent checking a list one item at a time), the others are static mock UIs, as on explee.
   6. Numbers that count up when they enter the viewport, on cards that tilt toward the pointer.
   7. Pixel loader (2×2 squares lighting in a loop) and soft edges (mask fades, blurred sticky header).
   8. Pricing slider whose label follows the thumb and whose numbers update, and the pulsing status dot.

   Correction (2026-11-18, before any build): the first draft named a "stepped pixel dissolve" (item 7) and an email
   that types itself (item 5). The shipped code and a still-frame check show neither: the steps were video compression
   in the contact sheet, and the email card is static. Items 5 and 7 now follow the evidence; the owner approved 7 of
   the 8 as first described.
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
- No fake live numbers (dc-landing rule): explee's "N hot leads for M companies" badge is computed in the browser
  from the clock (a base number plus a weekday/weekend hourly curve), not read from data. The teardown documents
  that; the recreation shows fixed sample numbers marked as samples and does not simulate a growing count.

## Out of scope
- Putting any effect into the landing page `index.html` (a later intent).
- Deploying anything; merging to `main` (the owner is asked after review, since a merge publishes the source).
- Explee's other pages, product app, analytics and chat widget.
- Pixel-exact parity with explee: the recreation matches technique and feel, not their layout.

## Open questions
None.
