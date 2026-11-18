status: building (owner approval 2026-11-18, one-prompt run from the intent form)  # draft → planned → building → verified

# Plan: explee.org effects teardown and recreation

Intent: `intent/2026-11-18-explee-effects.md` (approved). Branch: `explee-effects`. No Plane ticket (owner did not name
one); nothing is pushed or merged in this run.

Difficulty: MEDIUM (layout, CSS and JS that never ship to the live page; a revert undoes it). Builder builds, an
independent reviewer reviews.

## Files
1. `explee/TEARDOWN.md`: written first from the shipped files (chunks and CSS fetched 2026-11-18) and recordings at
   1440 and 390 px; it is the spec the builder works from.
2. `explee/index.html`, `explee/effects.css`, `explee/effects.js`: the recreation.
3. `explee/check.mjs`: the behaviour check (reuses the repo's `playwright-core` and Chromium lookup pattern from
   `scripts/check.mjs`).

## Risks
- A check that cannot fail (passes on a blank page): each effect assertion is run once against a copy of the demo with
  that effect's script or CSS removed and must fail (bite test, reported in Result).
- Copied third-party code or content in a public repo: the reviewer diffs `effects.js`/`effects.css` against the
  fetched chunks for verbatim blocks; copy is placeholder.
- Animation keeps running under reduced motion, or the hero canvas burns CPU off-screen: the check asserts
  `document.getAnimations()` has no running infinite animation and the canvas loop stops when out of view or reduced.
- Mobile overflow from the marquee or canvases at 390 px: the check measures `scrollWidth <= innerWidth`.
- The landing page breaks: `node scripts/check.mjs` must still pass (no file outside `explee/` and `intent/` changes).

## Tasks

### T1 (main) Teardown
- allow: `explee/TEARDOWN.md`
- check: `test -s explee/TEARDOWN.md`

### T2 (builder) Recreation and its check
- allow: `explee/index.html` `explee/effects.css` `explee/effects.js` `explee/check.mjs`
- forbid: `index.html` `site.css` `site.js` `.vercelignore`
- check: `node explee/check.mjs`
- check: `node scripts/check.mjs`

## Proof

1. `node explee/check.mjs` exits 0 with every effect asserted at 1440 px and 390 px, and the reduced-motion run passes.
2. Bite test: each effect's assertion fails when that effect is removed from a scratch copy (8/8 fail as expected).
3. `node scripts/check.mjs` exits 0 (landing page unchanged).
4. `explee/TEARDOWN.md` covers 8/8 effects, each with desktop and mobile behaviour and a source reference.
5. Side-by-side screenshots explee vs recreation at 1440 and 390 px in `.check/explee/` (owner visual check: not run
   unless the owner does it).
6. Independent reviewer PASS against the intent and this plan.

## Result

1. PASS, `node explee/check.mjs` exit 0 (run by the main session with `set -o pipefail`): 52 assertions, desktop
   1440×900, mobile 390×844 (touch, DPR 2) and desktop reduced motion; no overflow at 1440/390/320, no external or
   failed request, no console error.
2. PASS, run by the builder on scratch copies in `/tmp` (deleted after): removing each `init*()` call made the check
   exit 1 on that effect's assertion, 8/8 (flow: canvases have pixels; badge: swaps within 5 s; word swap: swaps
   within 4 s; marquee: rows drift; stack: earlier card scale 1; count-up: starts below target; loader: 0 → 0;
   pricing: label follows slider). Tilt alone: removing its listener fails 1 assertion.
3. PASS, `node scripts/check.mjs` exit 0.
4. PASS, 8/8 sections in `explee/TEARDOWN.md`, each with desktop and mobile behaviour and chunk/CSS line references,
   plus a mobile summary table.
5. PASS (files): `.check/explee/side-1440-hero.png`, `side-1440-stack.png`, `side-390-hero.png` (explee left, ours
   right). Main session compared them: the stacked heading was cut by the pile and headings were too heavy; the
   builder fixed both and added a "heading ends above the first card" assertion at both widths. Owner visual check:
   not run.
