#!/usr/bin/env node
// explee demo check: serves the repo root, loads /explee/ in Chromium at 1440,
// at 390 (touch, mobile) and with reduced motion, and fails unless every one of
// the eight effects is observed doing its job.
// Usage: node explee/check.mjs   (exit 0 ok, 1 problems, 2 could not run)
// Screenshots land in .check/explee/ (gitignored).
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readdirSync } from 'node:fs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = join(ROOT, '.check', 'explee');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

async function loadPlaywright() {
  try { return (await import('playwright-core')).chromium; } catch {}
  console.error('playwright-core not installed: run `npm install` first');
  process.exit(2);
}

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(base)) return undefined;
  const dirs = readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) { const p = join(base, d, 'chrome-linux64', 'chrome'); if (existsSync(p)) return p; }
  return undefined;
}

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT) || file.includes(`${ROOT}/.git`)) { res.writeHead(403).end(); return; }
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const problems = [];
const passes = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const expect = (cond, where, msg) => { (cond ? passes : problems).push(`${where}: ${msg}`); };

const chromium = await loadPlaywright();
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath(), headless: true });

function wire(page, where) {
  page.setDefaultTimeout(6000);
  page.on('console', m => { if (m.type() === 'error') fail(where, `console error: ${m.text()}`); });
  page.on('pageerror', e => fail(where, `page error: ${e.message}`));
  page.on('requestfailed', r => fail(where, `request failed: ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) fail(where, `HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) fail(where, `external request: ${u}`);
  });
}

const scrollTo = (page, y) => page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
const scrollToId = (page, id) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: y, behavior: 'instant' });
}, id);

// sticky cards report a shifted rect and offsetTop, so add up the flow heights
const scrollToStackCard = (page, index, extra = 120) => page.evaluate(([i, pad]) => {
  const stack = document.getElementById('stack');
  const cards = [...stack.querySelectorAll('[data-stack-card]')];
  let y = stack.getBoundingClientRect().top + window.scrollY;
  for (let k = 0; k < i; k++) {
    y += cards[k].offsetHeight + (Number.parseFloat(getComputedStyle(cards[k]).marginBottom) || 0);
  }
  window.scrollTo({ top: y + pad, behavior: 'instant' });
}, [index, extra]);

const badgeText = page => page.evaluate(() => {
  const pill = [...document.querySelectorAll('#badge .badge-pill')].find(p => {
    const s = getComputedStyle(p);
    return s.visibility !== 'hidden' && Number(s.opacity) > 0.5;
  });
  return pill ? pill.textContent.trim() : '';
});

const headlineText = page => page.evaluate(() => {
  const lines = [...document.querySelectorAll('#cta-swap .word-line')];
  const read = line => {
    const words = [...line.querySelectorAll('.word')];
    const shown = words.filter(w => {
      const s = getComputedStyle(w);
      return s.visibility !== 'hidden' && Number(s.opacity) > 0.5;
    });
    return {
      state: line.dataset.state,
      ratio: words.length ? shown.length / words.length : 0,
      text: shown.map(w => w.textContent.trim()).join(' '),
    };
  };
  const all = lines.map(read);
  const full = all.filter(x => x.ratio === 1);
  const pick = full.find(x => x.state === 'enter') || full.find(x => x.state === 'shown') || full[0];
  if (pick) return pick.text;
  return all.sort((a, b) => b.ratio - a.ratio)[0].text;
});

const canvasInfo = page => page.evaluate(() => [...document.querySelectorAll('[data-flow-canvas]')].map(c => {
  const r = c.getBoundingClientRect();
  if (!c.width || !c.height) return { w: r.width, h: r.height, hash: '0:0' };
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let hash = 0;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) ink++;
    if (i % 388 === 0) hash = (hash * 31 + data[i] + data[i + 1] + data[i + 2] + data[i + 3]) >>> 0;
  }
  return { w: r.width, h: r.height, hash: `${hash}:${ink}` };
}));

async function pollChange(page, read, timeout = 5500, step = 200) {
  const first = await read();
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await page.waitForTimeout(step);
    const next = await read();
    if (next && next !== first) return { first, next, changed: true };
  }
  return { first, next: await read(), changed: false };
}

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/* ---------------------------- desktop ---------------------------- */

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  wire(page, 'desktop');
  await page.goto(`${origin}/explee/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'desktop-fold.png') });

  // 1. hero flow lines
  const frames0 = await canvasInfo(page);
  expect(frames0.length === 2, 'effect 1 hero', 'two flow canvases are mounted');
  expect(frames0.every(c => c.w > 200 && c.h > 300), 'effect 1 hero', 'canvas wrappers are 480×600 beside the input');
  expect(frames0.every(c => !c.hash.endsWith(':0')), 'effect 1 hero', 'both canvases have pixels drawn');
  await page.waitForTimeout(320);
  const frames1 = await canvasInfo(page);
  expect(frames1.some((c, i) => c.hash !== frames0[i].hash), 'effect 1 hero', 'dot pixels change between two frames');
  const speed0 = await page.$eval('#hero-input-row', el => Number(el.dataset.speed));
  await page.hover('#hero-input');
  await page.waitForTimeout(1250);
  const speedHot = await page.$eval('#hero-input-row', el => Number(el.dataset.speed));
  expect(speed0 < 0.5 && speedHot > 3, 'effect 1 hero', `hovering the input ramps dot speed ${speed0} → ${speedHot}`);
  await page.mouse.move(720, 10);
  await page.waitForTimeout(1250);
  const speedBack = await page.$eval('#hero-input-row', el => Number(el.dataset.speed));
  expect(speedBack < 0.6, 'effect 1 hero', `speed settles back after the pointer leaves (${speedBack})`);

  // 2. badge swap
  const badge = await pollChange(page, () => badgeText(page), 5500);
  expect(badge.changed, 'effect 2 badge', `visible pill swaps within 5s (“${badge.first}” → “${badge.next}”)`);

  // 4. testimonial marquee
  await scrollToId(page, '#voices');
  await page.waitForTimeout(600);
  const rowLeft = () => page.evaluate(() => {
    const row = document.querySelector('[data-marquee="desktop"]');
    return row ? row.scrollLeft : -1;
  });
  const rowsLeft = () => page.evaluate(() => [...document.querySelectorAll('[data-marquee="desktop"]')].map(r => r.scrollLeft));
  const left0 = await rowsLeft();
  await page.waitForTimeout(700);
  const left1 = await rowsLeft();
  const d0 = left1[0] - left0[0];
  const d1 = left1[1] - left0[1];
  expect(Math.abs(d0) > 3 && Math.abs(d1) > 3, 'effect 4 marquee', 'two rows drift sideways over 700ms');
  expect(d0 * d1 < 0, 'effect 4 marquee', 'rows 1 and 2 drift in opposite directions');
  await page.hover('[data-marquee="desktop"]');
  await page.waitForTimeout(300);
  const hover0 = await rowLeft();
  await page.waitForTimeout(800);
  const hover1 = await rowLeft();
  expect(Math.abs(hover1 - hover0) < 1.5, 'effect 4 marquee', 'hovering a row stops its drift');
  await page.mouse.move(4, 4);

  // 6. count-up
  const statBefore = await page.evaluate(() => document.querySelector('[data-target="3200"]').textContent.trim());
  expect(!/\d{3}/.test(statBefore), 'effect 6 count-up', `first stat starts below its target (“${statBefore}”)`);
  await scrollToId(page, '#stats');
  await page.waitForTimeout(400);
  const statMid = await page.evaluate(() => document.querySelector('[data-target="3200"]').textContent.trim());
  await page.waitForTimeout(1400);
  const statAfter = await page.evaluate(() => document.querySelector('[data-target="3200"]').textContent.trim());
  const targetHit = await page.evaluate(() => [...document.querySelectorAll('[data-target]')].map(el => {
    const want = Number(el.dataset.target);
    const got = Number(el.textContent.replace(/[^\d.]/g, ''));
    return { want, got, ok: got === want };
  }));
  expect(targetHit.every(x => x.ok), 'effect 6 count-up', `numbers reach their targets (${targetHit.map(x => x.got).join(', ')})`);
  expect(statAfter !== statBefore, 'effect 6 count-up', `the number moved while counting (“${statMid}” → “${statAfter}”)`);
  const tiltA = await page.evaluate(() => getComputedStyle(document.querySelector('.stat-card')).transform);
  const cardBox = await page.evaluate(() => {
    const r = document.querySelector('.stat-card').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(cardBox.x, cardBox.y);
  await page.waitForTimeout(180);
  await page.mouse.move(cardBox.x + 170, cardBox.y - 90);
  await page.waitForTimeout(300);
  const tiltB = await page.evaluate(() => getComputedStyle(document.querySelector('.stat-card')).transform);
  expect(tiltA !== tiltB, 'effect 6 count-up', 'the cards tilt as the pointer moves over them');

  // 5. pipeline stack
  await scrollToStackCard(page, 3);
  await page.waitForTimeout(400);
  const stack = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-stack-card]')];
    const scaleOf = el => {
      const m = getComputedStyle(el).transform;
      if (!m || m === 'none') return 1;
      const parts = m.match(/matrix\(([^)]+)\)/);
      return parts ? Number(parts[1].split(',')[0]) : 1;
    };
    return {
      tops: cards.map(c => c.getBoundingClientRect().top),
      scales: cards.map(scaleOf),
      head: document.querySelector('.pipeline-head').getBoundingClientRect().top,
      headBottom: document.querySelector('.pipeline-head').getBoundingClientRect().bottom,
      listTick: Number(document.querySelector('#agent-list').dataset.tick),
      margin0: document.querySelector('[data-stack-card][data-i="0"]').style.marginBottom,
    };
  });
  expect(Math.abs(stack.tops[3] - (140 + 3 * 15)) <= 2, 'effect 5 stack', `card 4 sticks at top 185px (${Math.round(stack.tops[3])}px)`);
  expect(stack.scales[0] < 0.999 && stack.scales[0] >= 0.8, 'effect 5 stack', `an earlier card shrinks under the pile (scale ${stack.scales[0]})`);
  expect(Math.abs(stack.head - 80) <= 2, 'effect 5 stack', 'the heading is stuck at 80px above the pile');
  expect(stack.headBottom <= stack.tops[0] + 0.5, 'effect 5 stack', `the stuck heading ends above the first card (${Math.round(stack.headBottom)}px ≤ ${Math.round(stack.tops[0])}px)`);
  expect(stack.margin0 !== '', 'effect 5 stack', 'earlier cards carry a measured margin-bottom');
  await page.waitForTimeout(950);
  const listTick2 = await page.evaluate(() => Number(document.querySelector('#agent-list').dataset.tick));
  expect(listTick2 > stack.listTick, 'effect 5 stack', `card 1's list advances (step ${stack.listTick} → ${listTick2})`);
  await page.screenshot({ path: join(OUT, 'desktop-stack.png') });

  // 7. pixel loader and soft edges
  const lit0 = await page.$eval('#loader', el => el.dataset.lit);
  await page.waitForTimeout(420);
  const lit1 = await page.$eval('#loader', el => el.dataset.lit);
  expect(lit0 !== lit1, 'effect 7 loader', `lit pixel steps round the 2×2 grid (${lit0} → ${lit1})`);
  const edges = await page.evaluate(() => {
    const mock = document.querySelector('.mock');
    const header = document.querySelector('.site-header');
    const hs = getComputedStyle(header);
    return {
      mask: getComputedStyle(mock).maskImage || getComputedStyle(mock).webkitMaskImage,
      backdrop: hs.backdropFilter || hs.webkitBackdropFilter,
      bg: hs.backgroundColor,
    };
  });
  expect(/gradient/.test(edges.mask || ''), 'effect 7 loader', 'the illustration fades over its bottom 64px (mask-image)');
  const translucent = /rgba\([^)]*,\s*0?\.\d+\)/.test(edges.bg || '');
  expect(/blur/.test(edges.backdrop || '') || translucent, 'effect 7 loader', `sticky header blurs what scrolls under it (${edges.backdrop || edges.bg})`);

  const pulse = await page.evaluate(() => {
    const dot = document.querySelector('.status-dot');
    return dot.getAnimations().some(a => a.playState === 'running');
  });
  expect(pulse, 'effect 8 pricing', 'the status dot pulse is running');

  // 8. pricing slider
  await scrollToId(page, '#pricing');
  await page.waitForTimeout(250);
  const priceBefore = await page.evaluate(() => ({
    tag: document.querySelector('#price-tag').textContent.trim(),
    emails: document.querySelector('[data-tile="emails"]').textContent.trim(),
    warm: document.querySelector('[data-tile="warm"]').textContent.trim(),
  }));
  await page.$eval('#budget', el => {
    el.value = '70';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  const priceAfter = await page.evaluate(() => ({
    tag: document.querySelector('#price-tag').textContent.trim(),
    emails: document.querySelector('[data-tile="emails"]').textContent.trim(),
    warm: document.querySelector('[data-tile="warm"]').textContent.trim(),
    cpl: document.querySelector('[data-tile="cpl"]').textContent.trim(),
    left: getComputedStyle(document.querySelector('#price-tag')).left,
  }));
  expect(priceAfter.tag === '$70', 'effect 8 pricing', 'the label follows the slider ($70)');
  expect(priceAfter.emails !== priceBefore.emails && priceAfter.warm !== priceBefore.warm,
    'effect 8 pricing', `the tiles recompute (${priceBefore.emails} → ${priceAfter.emails} emails)`);
  expect(Number.parseFloat(priceAfter.left) > 0, 'effect 8 pricing', 'the label is positioned by the slider clamp');
  await page.screenshot({ path: join(OUT, 'desktop-pricing.png') });

  // 3. word-pair headline
  await scrollToId(page, '#cta');
  await page.waitForTimeout(500);
  const words = await pollChange(page, () => headlineText(page), 5600);
  expect(words.changed, 'effect 3 word swap', `the CTA headline swaps within 4s (“${words.first}” → “${words.next}”)`);

  // overflow, also at 320px
  await scrollTo(page, 0);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(OUT, 'desktop-full.png'), fullPage: true });
  const wide = await overflow(page);
  expect(wide <= 1, 'desktop', `no horizontal overflow at 1440 (${wide}px)`);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(400);
  const narrow = await overflow(page);
  expect(narrow <= 1, 'desktop', `no horizontal overflow at 320px (${narrow}px)`);

  await ctx.close();
}

/* ---------------------------- mobile 390 ---------------------------- */

{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  wire(page, 'mobile');
  await page.goto(`${origin}/explee/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'mobile-fold.png') });

  const canvases = await canvasInfo(page);
  expect(canvases.length === 2 && canvases.every(c => c.w === 0), 'effect 1 hero', `flow canvases collapse to zero width at 390 (${canvases.map(c => c.w).join(', ')})`);

  const badge = await pollChange(page, () => badgeText(page), 5500);
  expect(badge.changed, 'effect 2 badge', `badge swaps on mobile (“${badge.first}” → “${badge.next}”)`);

  // 4. one snap row, no drift
  const marquee = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-marquee]')];
    const visible = rows.filter(r => r.getBoundingClientRect().width > 0);
    const row = visible[0];
    return {
      visible: visible.length,
      snap: row ? getComputedStyle(row).scrollSnapType : '',
      card: row ? row.querySelector('.quote-card').getBoundingClientRect().width : 0,
      left: row ? row.scrollLeft : -1,
    };
  });
  expect(marquee.visible === 1, 'effect 4 marquee', 'mobile shows a single marquee row');
  expect(/x/.test(marquee.snap), 'effect 4 marquee', `the mobile row scroll-snaps (${marquee.snap})`);
  expect(Math.abs(marquee.card - (390 - 56)) <= 2, 'effect 4 marquee', `mobile cards are 100vw − 56px wide (${Math.round(marquee.card)}px)`);
  await page.waitForTimeout(1000);
  const marqueeLeft2 = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[data-marquee]')].find(r => r.getBoundingClientRect().width > 0);
    return row ? row.scrollLeft : -1;
  });
  expect(marqueeLeft2 === marquee.left, 'effect 4 marquee', 'the mobile row does not drift on its own');

  // 6. count-up on mobile
  const statBefore = await page.evaluate(() => document.querySelector('[data-target="3200"]').textContent.trim());
  await scrollToId(page, '#stats');
  await page.waitForTimeout(1600);
  const statAfter = await page.evaluate(() => ({
    text: document.querySelector('[data-target="3200"]').textContent.trim(),
    ok: [...document.querySelectorAll('[data-target]')].every(el => Number(el.textContent.replace(/[^\d.]/g, '')) === Number(el.dataset.target)),
  }));
  expect(statBefore !== statAfter.text && statAfter.ok, 'effect 6 count-up', `mobile count reaches its target (“${statBefore}” → “${statAfter.text}”)`);

  // 5. stack at mobile offsets
  await scrollToStackCard(page, 2);
  await page.waitForTimeout(400);
  const stack = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-stack-card]')];
    const m = getComputedStyle(cards[0]).transform;
    const parts = m.match(/matrix\(([^)]+)\)/);
    return {
      top: cards[2].getBoundingClientRect().top,
      scale: parts ? Number(parts[1].split(',')[0]) : 1,
      head: document.querySelector('.pipeline-head').getBoundingClientRect().top,
      headBottom: document.querySelector('.pipeline-head').getBoundingClientRect().bottom,
      firstTop: cards[0].getBoundingClientRect().top,
    };
  });
  expect(Math.abs(stack.top - (196 + 2 * 7)) <= 2, 'effect 5 stack', `mobile card 3 sticks at 210px (${Math.round(stack.top)}px)`);
  expect(stack.scale < 1 && stack.scale >= 0.8, 'effect 5 stack', `mobile pile shrinks earlier cards (scale ${stack.scale})`);
  expect(Math.abs(stack.head - 84) <= 2, 'effect 5 stack', `mobile heading sticks at 84px (${Math.round(stack.head)}px)`);
  expect(stack.headBottom <= stack.firstTop + 0.5, 'effect 5 stack', `mobile heading ends above the first card (${Math.round(stack.headBottom)}px ≤ ${Math.round(stack.firstTop)}px)`);
  await page.screenshot({ path: join(OUT, 'mobile-stack.png') });

  // 7. loader
  const lit0 = await page.$eval('#loader', el => el.dataset.lit);
  await page.waitForTimeout(420);
  const lit1 = await page.$eval('#loader', el => el.dataset.lit);
  expect(lit0 !== lit1, 'effect 7 loader', `loader steps on mobile (${lit0} → ${lit1})`);

  // 8. pricing
  await scrollToId(page, '#pricing');
  await page.waitForTimeout(250);
  const before = await page.$eval('[data-tile="emails"]', el => el.textContent.trim());
  await page.$eval('#budget', el => {
    el.value = '70';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => ({
    tag: document.querySelector('#price-tag').textContent.trim(),
    emails: document.querySelector('[data-tile="emails"]').textContent.trim(),
  }));
  expect(after.tag === '$70' && after.emails !== before, 'effect 8 pricing', `mobile slider updates the label and tiles (${before} → ${after.emails})`);

  // 3. word swap
  await scrollToId(page, '#cta');
  await page.waitForTimeout(500);
  const words = await pollChange(page, () => headlineText(page), 5600);
  expect(words.changed, 'effect 3 word swap', `mobile headline swaps (“${words.first}” → “${words.next}”)`);

  await scrollTo(page, 0);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(OUT, 'mobile-full.png'), fullPage: true });
  const wide = await overflow(page);
  expect(wide <= 1, 'mobile', `no horizontal overflow at 390 (${wide}px)`);

  await ctx.close();
}

/* -------------------------- reduced motion -------------------------- */

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  wire(page, 'reduced-motion');
  await page.goto(`${origin}/explee/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const infinite = await page.evaluate(() => document.getAnimations()
    .filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity)
    .map(a => a.animationName || a.effect?.target?.className || 'animation'));
  expect(infinite.length === 0, 'reduced-motion', `no infinite animation runs (${infinite.join(', ') || 'none'})`);

  const frames0 = await canvasInfo(page);
  expect(frames0.every(c => !c.hash.endsWith(':0')), 'reduced-motion', 'the hero canvas still draws one static frame');
  await page.waitForTimeout(500);
  const frames1 = await canvasInfo(page);
  expect(frames1.every((c, i) => c.hash === frames0[i].hash), 'reduced-motion', 'hero canvas pixels are identical across 500ms');

  const rowsLeft = () => page.evaluate(() => [...document.querySelectorAll('[data-marquee="desktop"]')].map(r => r.scrollLeft));
  const left0 = await rowsLeft();
  await page.waitForTimeout(1000);
  const left1 = await rowsLeft();
  expect(left0.length === 3 && left0.every((v, i) => v === left1[i]), 'reduced-motion', 'marquee rows do not drift');

  const counts = await page.evaluate(() => [...document.querySelectorAll('[data-target]')]
    .map(el => Number(el.textContent.replace(/[^\d.]/g, '')) === Number(el.dataset.target)));
  expect(counts.every(Boolean), 'reduced-motion', 'count-up numbers already show their final value');

  const wordsStart = await headlineText(page);
  const badgeStart = await badgeText(page);
  await page.waitForTimeout(5000);
  const wordsEnd = await headlineText(page);
  const badgeEnd = await badgeText(page);
  expect(wordsStart === wordsEnd, 'reduced-motion', 'the word pair does not swap');
  expect(badgeStart === badgeEnd, 'reduced-motion', 'the badge does not swap');

  await page.screenshot({ path: join(OUT, 'reduced-fold.png') });
  await page.screenshot({ path: join(OUT, 'reduced-full.png'), fullPage: true });

  await ctx.close();
}

await browser.close();
server.close();

const uniq = [...new Set(problems)];
uniq.forEach(p => console.log('FAIL', p));
passes.forEach(p => console.log('PASS', p));
console.log(uniq.length ? `${uniq.length} problem(s), ${passes.length} passed` : `ok — ${passes.length} assertions passed`);
console.log(`screenshots: ${OUT}`);
process.exit(uniq.length ? 1 : 0);
