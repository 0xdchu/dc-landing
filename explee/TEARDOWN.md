# explee.org homepage effects: teardown

Read on 2026-11-18 from https://explee.org/ (Next.js, Turbopack build). Method: the HTML and every `/_next/static/chunks/*`
file it loads were fetched and pretty-printed with `prettier@3`; line numbers below refer to that pretty output. The
page was recorded in headless Chromium at 1440×900 and 390×844 (touch, DPR 2), still frames were checked, and runtime
state was read with `document.getAnimations()`, a `MutationObserver` and computed styles.

Labels: **Observed** = seen in a recording or measured in the running page; **Code** = read in the shipped files;
**[INFERENCE]** = a reading that neither proves.

## Stack in one paragraph

No animation library and no WebGL on the homepage: every effect is a hand-written React hook doing one of three things,
(a) a Canvas 2D loop on `requestAnimationFrame`, (b) toggling a `data-state` attribute that a CSS `@keyframes` rule
picks up, or (c) writing `transform`/`scrollLeft` from a rAF loop that an `IntersectionObserver` starts and stops.
Framer Motion is in the bundle only for its `motionValue` + `animate()` tween (the hero speed ramp, effect 1). Most
loops pause when off-screen; several honour `prefers-reduced-motion`, not all (noted per effect).

The page itself scrolls inside a full-height `div.theme-light.landing-light` (scrollHeight 5162 px at 1440), not the
window, so every observer that needs the scroll root walks up to the first `overflow-y: auto|scroll` ancestor.

| # | Effect | Technique | Chunk |
|---|---|---|---|
| 1 | Hero flow lines | Canvas 2D, cubic Bézier + arc-length table | `3ikuf0_z45it6.js` (module 58502), mounted in `2svj17guso37m.js` |
| 2 | Stat badge swap | `data-state` + CSS keyframes, 4 s interval | `2svj17guso37m.js` (713206), CSS `3oko9p8r2vq2o.css` |
| 3 | Word-pair headline | Same as 2, per-word delay | `3ikuf0_z45it6.js` (231565), CSS module `_hYpyG_*` |
| 4 | Testimonial rows | rAF writes `scrollLeft`, tripled content, wrap-around | `2svj17guso37m.js` (580623) |
| 5 | Pipeline stack | `position: sticky` stack + rAF `scale()` | `2svj17guso37m.js` (901603, 129800) |
| 6 | Count-up + tilt | rAF ease-out count, mousemove 3D tilt | `2svj17guso37m.js` (684414) |
| 7 | Pixel loader, soft edges | 150 ms step loop; CSS `mask-image`; `backdrop-filter` | `2svj17guso37m.js` (129800), CSS |
| 8 | Pricing slider, pulse | Radix slider, `clamp()` label; CSS keyframes | `3ikuf0_z45it6.js` (984220), CSS |

---

## 1. Hero flow lines converging on the input

**Observed (1440).** Two canvases sit left and right of the website input (each 480×600 at 1440). Eight faint curves
per side fan out from the page edge and narrow into the input's edge; small square dots (green and grey) slide along
them towards the input, fading in at the start and out at the end. The curves draw themselves in once on load.
Moving the pointer over the input makes the dots rush (about 24× faster) and settle back when it leaves.

**Observed (390).** Both canvases measure 0×0: the effect is gone on phones.

**Code.**
- Component props: virtual drawing size `width 400 × height 500`, `preserveAspectRatio "xMaxYMid meet"` (the canvas is
  scaled like an SVG viewBox), `config`, `speedRef`, `paused` (`3ikuf0` lines 349–357, 495–519).
- Defaults (lines 258–271): `numPaths 8, dotsPerPath 3, dotSize 1.5, dotPrimaryColor #10b981, dotSecondaryColor
  rgba(0,0,0,.18), primaryDotRatio .25, pathColor rgba(0,0,0,.24), startSpread 1, finishSpread .04, curvature .5,
  speed .5, curveType "s-curve"`. The hero overrides `speed .2`, and on narrow screens `numPaths 4, dotsPerPath 2`
  (`2svj17` lines 940–955).
- Paths (lines 296–341): path *i* of *n* gets a normalised position `c = (i − (n−1)/2) / ((n−1)/2)` in −1…1. Its start
  y is `h/2 + h/2 · c · startSpread` (full height), its end y `h/2 + h/2 · c · finishSpread` (4 % of the height, i.e.
  nearly one point). Start x = 0, end x = width. "s-curve" puts both control points at the start and end y, pulled
  `width · curvature` horizontally, so each path is a smooth S from wide to narrow. Two other shapes exist
  (`inner-curve`, `outer-curve`) that bow the controls towards or away from the centre line.
- Constant-speed motion (lines 283–295, 575–591): each Bézier is cut into 64 segments (65 samples, t = 0…1) whose
  cumulative, normalised lengths form a table;
  a dot's linear progress `u` is mapped through a binary search of that table to the Bézier `t`, so dots move at even
  speed along the curve instead of bunching where the curve is tight.
- Dots (lines 402–434): per path, `dotsPerPath` dots with a seeded pseudo-random start offset and start delay
  (`frac(sin(x)·10⁴)`, seed fixed per mount). Loop duration per dot is `3 + |c|` seconds of virtual time, so outer
  paths run slower. Virtual time advances by `dt · speed`; alpha ramps 0→1 over the first 5 % and 1→0 over the last
  5 % of each loop, and a 300 ms fade-in at mount. Primary (green) dots are drawn after the grey ones so they sit on top.
  Dots are `fillRect` squares 3 px wide, not circles.
- Line draw-in (lines 524–546): each path starts after a random 0–0.5 s delay and draws over 1.2 s with an ease-out
  cubic, using `setLineDash([progress · length, length])`; paths are stroked at alpha 0.16.
- The right canvas is the same component inside a wrapper with `rotate-180` (`2svj17` lines 1242–1256); the left one
  sits at `right: 100%` of the input row. Each wrapper is `calc(50vw − 240px)` wide (half the 480 px input) and
  `× 500/400` tall, which is why it collapses to zero below 480 px of viewport.
- Speed ramp (lines 956–964, 1221–1229): `onMouseEnter` of the input box tweens a Framer `motionValue` from 0.2 to
  4.8 (`24 × speed`) over 1 s `easeInOut`; `onMouseLeave` tweens back. The canvas loop reads the value through a ref
  each frame, so no re-render happens.
- Pausing: an `IntersectionObserver` (rootMargin 100 px) on the input row sets `paused`, which stops scheduling rAF
  (lines 923–931). Canvas resolution follows `devicePixelRatio` and a `ResizeObserver`.
- Not handled: `prefers-reduced-motion` is not checked by this component (the dots keep moving).

## 2. Rotating stat badge

**Observed.** Above the headline a pill alternates between "$9 median cost per lead" and "208,265 hot leads for 18,145
companies": the old pill blurs, fades and slides up 40 px while the new one comes up from 40 px below, unblurring.
Same on mobile.

**Code.** Two `span.stat-badge` stacked in one grid cell (`grid-area: 1/1`) so they overlap without absolute
positioning (CSS lines 98–148). Keys change on every swap, so React remounts both spans and the CSS animation replays:
`stat-badge-exit` and `stat-badge-enter`, 0.5 s `ease`, `filter: blur(4px)`, `opacity`, `translate: 0 ±40px`.
Start after 600 ms, swap every 4 s (`2svj17` lines 1372–1383). Before the first swap `data-animate="false"` shows the
exit badge still and hides the enter one, so nothing moves on first paint.

**The "live" count is not data.** `2svj17` lines 1289–1358: the lead and company numbers are computed in the browser
from `Date.now()`: a base (76,371 leads, 7,171 companies) plus a curve that starts 2026-09-01 19:00 UTC, runs for 90
days, adds 2,145 leads per weekday and 622 per weekend day, spread over the hours by a fixed 24-value weight table, and
is recomputed every second. When the number rises the figure turns green for 2 s. Every visitor sees the same
"live" ticking number regardless of real usage. Our recreation must not copy this (dc-landing rule: no made-up number
shown as fact).

## 3. Word-pair headline swap

**Observed.** Not rendered on the homepage on 2026-11-18 (no `_hYpyG_root` element after scrolling to the end).

**Code.** Component in `3ikuf0` lines 665–773, used by the closing CTA `LazyCTAWithFlow` (lines 777–934) with
`"You’ve heard it all before" ↔ "This one really works"`, interval 3 s, stagger 0.09 s. Two sentence rows overlap in
one grid cell; each word is an inline-block span with `--delay: index × stagger`. Exit: blur/fade/slide up 40 px,
0.42 s, delayed by `--delay`. Enter: same in reverse, delayed by `0.52 s + --delay` so the new words start after the
old ones leave (CSS lines 1257–1322). The CTA under it carries a vertical version of effect 1 (16 paths, `inner-curve`,
rotated −90°, fading into the background) whose speed also ramps ×24 on button hover. [INFERENCE] It is the closing
section of another landing variant; this homepage variant (`landing: "test2"`) hides several sections with a script
(`SlackMockupLanding`, lines 1444–1541).

## 4. Testimonial rows

**Observed (1440).** Three full-bleed rows of cards (each 240 px tall) drift sideways, rows 1 and 3 one way, row 2 the
other; the edges fade out. Hovering a row stops it; the mouse can drag it; it never runs out.
**Observed (390).** One row, one card per screen (`100vw − 56px`), swiped by hand with snap; no drift.

**Code** (`2svj17` lines 1763–1934, CSS 1017–1041, 1167–1197).
- Content is the row's items repeated to at least 6, then tripled. On mount `scrollLeft` is set into the middle copy.
  A scroll listener wraps: if `scrollLeft` drifts before the middle copy it jumps forward by one copy width, after it
  jumps back. The jump is invisible because the copies are identical.
- Motion is `scrollLeft += ±0.04 · dt` (40 px/s) in a rAF loop, sign alternating by row index. It skips the step when
  the row is off-screen (IntersectionObserver), while dragging, while a touch is down, or while hovered (on hover-able
  devices). Because it moves `scrollLeft` rather than a transform, the native scroll, wheel and trackpad keep working.
- Drag: `pointerdown` (mouse only) captures the pointer; `pointermove` subtracts the delta from `scrollLeft`.
- Edge fade: `mask-image: linear-gradient(90deg, transparent 0, #000 60px calc(100% − 60px), transparent 100%)`.
- Mobile: a separate row with `scroll-snap-type: x mandatory`, cards `scroll-snap-align: center`, initially scrolled
  to centre the second card. The desktop rows are `hidden md:block`.
- Not handled: no reduced-motion check on the drift.

## 5. "We run the entire pipeline" stack

**Observed.** A heading and six cards (text left, mock UI right). Scrolling, each card sticks 15 px lower than the one
before, so they pile up like a deck; cards underneath shrink a little as each new card slides over them, and the
heading sticks above the pile until the last card arrives. Mobile does the same, one column, smaller offsets. Only the
first card's mock UI moves: "agent is studying competitors…" with a list whose rows appear one by one with a spinner
then a check; the email, people, chat and campaign cards are static (a `MutationObserver` saw no text change in them
over 3 s at four scroll positions).

**Code** (`2svj17` lines 1936–2113, CSS 557–611).
- Each card wrapper is `position: sticky; top: baseTop + i · cardOffset; z-index: i + 1`, with `baseTop 140,
  cardOffset 15, scaleStep 0.04, headerTop 80` (mobile: `196, 7, 0.03, 84`).
- Scale: every frame (while the stack is within 200 px of the viewport), for each card *i* it computes how far each
  later card *j* has travelled over it, `p_j = 1 − clamp((top_j − stickyTop_j) / height_j, 0, 1)`, and sets
  `transform: scale(max(0.8, 1 − Σ p_j · scaleStep))` with `transform-origin: top` and a 0.12 s transition to smooth
  it. Styles are written only when the string changes.
- Bottom alignment: a `ResizeObserver` gives every card but the last a `margin-bottom` so that all cards stop sticking
  at the same moment as the last one, and moves the sticky heading's container so the heading leaves with the pile.
- Card 1 animation (lines 224–316): six items, one revealed every 800 ms (opacity 0→1, `translateX(−8px)`→0, 300 ms
  transition), the current one with a spinning loader, done ones with a check; after the last, wait 3 s and restart.
  It runs whether or not the card is visible.
- Card 6 status column uses a 6 px dot with `status-pulse` (effect 8).

## 6. Count-up numbers on tilting cards

**Observed.** "Three things nobody else has": three cards whose numbers (80M+, 97 %, $1) count up from 0 when the row
comes into view; moving the pointer anywhere tilts the cards up to 8° towards it (measured `perspective(900px)
rotateX(8deg) rotateY(1.9…8deg)`). On mobile the cards stack and only the count runs.

**Code** (`2svj17` lines 22–193).
- Two observers on the grid: "near" (rootMargin 400 px below, root = the scrolling div) resets the shown value to 0
  ahead of time, so the user never sees the final value flash first; "inView" (threshold 0.4) starts the count once.
- Count: 900 ms, `round((1 − (1 − t)³) · value)` per rAF frame (ease-out cubic). Under reduced motion it shows the
  final value at once.
- Tilt: one `mousemove` listener per card on `window`; rotation is proportional to the pointer's offset from the card
  centre over half the viewport, clamped to ±8°; `transition-transform 300ms ease-out` smooths it. No reduced-motion
  or touch check (touch devices simply never fire it).

## 7. Pixel loader and soft edges

**Observed.** (a) Next to "agent is studying competitors…" a 12 px square of four 5 px pixels lights one green pixel
at a time, going round clockwise. (b) The mock UIs fade out at their bottom edge instead of being cut; the testimonial
rows fade at both sides. (c) Content scrolling under the sticky 80 px header is blurred and washed out.

A first look at a compressed contact sheet suggested a "stepped pixel dissolve" on card edges; still frames at full
resolution show plain edges. The steps were video compression. A `PixelRipple` component exists in the bundle as a lazy
import but was not loaded on this page.

**Code.**
- Loader (`2svj17` lines 201–222): a 2×2 CSS grid; a 150 ms `setInterval` steps an index through the order
  `[0, 1, 3, 2]` (top-left, top-right, bottom-right, bottom-left), the lit cell gets the brand colour, the others 20 %
  grey; `transition: none` keeps it crisp, like a pixel-art spinner.
- Bottom fade: `.use-case-card--bleed .use-case-illustration { mask-image: linear-gradient(#000 0 calc(100% − 64px),
  transparent 100%) }` (CSS 605–611). Side fade: the testimonial row mask in effect 4.
- Header: `sticky top-0`, with an absolutely placed layer `bg-background/80 backdrop-blur-sm` under the nav.

## 8. Pricing slider and status pulse

**Observed.** "Pay as you go": a slider from $0 to $100 (starts at $30); the dollar label rides above the thumb and the
four tiles (emails, warm leads, meetings, cost per lead) update as it moves. In the campaign card a small green dot
next to "Scaling"/"Working" breathes.

**Code.**
- Slider (`3ikuf0` lines 94–229): Radix slider, `step 1`. Label `left: clamp(16px, calc((100% − 16px) · v/100 + 8px),
  calc(100% − 36px))` so it tracks the thumb but never leaves the card. Tiles derive from `v / emailPrice` with fixed
  low/high rates for warm leads (0.002–0.008 per email) and meetings (0.0009–0.0018), shown as `~a–b`. The thumb's hit
  area is widened with a `::before` at `inset: −14px`.
- Pulse: `.status-pulse { animation: 2s ease-in-out infinite status-pulse }`, opacity 1 → 0.4 → 1 (CSS 322–324,
  1248–1256). No reduced-motion override.

---

## What to take, what to skip

- Take: the arc-length table for even dot speed; the `data-state` + keyframes swap pattern (no animation library);
  marquee via `scrollLeft` (keeps native scrolling and drag); sticky stack with computed scale and the bottom-align
  margins; observers that pause every loop off-screen; the "near" observer that resets a counter before it is seen.
- Fix when reusing: honour `prefers-reduced-motion` everywhere (flow canvas, marquee drift, pulse, loader, card-1 list,
  tilt); pause the card-1 timer off-screen; keep the flow canvas on small screens only if it fits (explee drops it).
- Skip: the clock-driven "live" lead counter (a made-up number shown as fact).

## Mobile summary (390 px)

| Effect | Mobile behaviour |
|---|---|
| 1 Flow lines | Removed: canvases 0×0 (width `50vw − 240px` ≤ 0) |
| 2 Badge | Same |
| 3 Word swap | Not on the homepage |
| 4 Testimonials | One snap row swiped by hand, no drift, no edge mask |
| 5 Stack | Same, `top 196 + 7i`, scale step 0.03 |
| 6 Count-up | Count runs; tilt never fires without a mouse |
| 7 Loader, edges | Same; side mask removed with the drift rows |
| 8 Slider, pulse | Same, single column tiles |
