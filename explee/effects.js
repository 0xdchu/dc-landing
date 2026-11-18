/* Fernway motion demo.
   Eight effects, one init function each, all hand-written for this repo:
   no library, no network request. Every loop pauses off-screen and every
   animation is static (or absent) under prefers-reduced-motion: reduce. */

'use strict';

(() => {
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceQuery.matches;
  const hoverCapable = window.matchMedia('(hover: hover)');

  /* ------------------------------------------------------------------ */
  /* 1. Hero flow lines: cubic Bézier paths, arc-length LUT, square dots */
  /* ------------------------------------------------------------------ */

  function initFlow() {
    const row = document.getElementById('hero-input-row');
    if (!row) return;
    const input = document.getElementById('hero-input');
    const canvases = Array.from(row.querySelectorAll('[data-flow-canvas]'));
    if (!canvases.length) return;

    // the demo has no backend: keep the page (and the hero speed ramp) in place
    input.addEventListener('submit', event => event.preventDefault());

    const VW = 400;
    const VH = 500;
    const BASE = 0.2;
    const HOT = 4.8;
    const RAMP = 1000;
    const CURVATURE = 0.5;
    const START_SPREAD = 1;
    const FINISH_SPREAD = 0.04;
    const PRIMARY_RATIO = 0.25;

    let paths = [];
    let pathCount = 0;

    let speed = BASE;
    let rampFrom = BASE;
    let rampTo = BASE;
    let rampStart = 0;
    let ramping = false;

    const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const rand = (i, k, n) => {
      const x = Math.sin((i + 1) * 91.7 + k * 57.3 + n * 13.1) * 43758.5453;
      return x - Math.floor(x);
    };

    function buildPaths(n) {
      const out = [];
      const dotsPerPath = n > 4 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const c = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
        const startY = VH / 2 + (VH / 2) * c * START_SPREAD;
        const endY = VH / 2 + (VH / 2) * c * FINISH_SPREAD;
        const p0 = { x: 0, y: startY };
        const p1 = { x: VW * CURVATURE, y: startY };
        const p2 = { x: VW - VW * CURVATURE, y: endY };
        const p3 = { x: VW, y: endY };

        const pts = [];
        const lut = [];
        let total = 0;
        for (let s = 0; s <= 64; s++) {
          const t = s / 64;
          const mt = 1 - t;
          const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
          const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
          if (s > 0) total += Math.hypot(x - pts[s - 1].x, y - pts[s - 1].y);
          pts.push({ x, y });
          lut.push(total);
        }

        const dots = [];
        for (let k = 0; k < dotsPerPath; k++) {
          const dur = (3 + Math.abs(c)) * 1000;
          dots.push({
            dur,
            offset: rand(i, k, 1) * dur,
            primary: rand(i, k, 2) < PRIMARY_RATIO,
          });
        }

        out.push({ pts, lut, total, dots, drawDelay: rand(i, 0, 3) * 500 });
      }
      return out;
    }

    pathCount = window.innerWidth >= 768 ? 8 : 4;
    paths = buildPaths(pathCount);

    function pointAt(path, u) {
      const target = Math.min(1, Math.max(0, u)) * path.total;
      const lut = path.lut;
      let lo = 0;
      let hi = lut.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (lut[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const idx = Math.max(1, lo);
      const a = lut[idx - 1];
      const b = lut[idx];
      const f = b === a ? 0 : (target - a) / (b - a);
      const p = path.pts[idx - 1];
      const q = path.pts[idx];
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    }

    const states = canvases.map(canvas => ({
      canvas,
      ctx: canvas.getContext('2d'),
      w: 0,
      h: 0,
      dpr: 1,
      mountAt: 0,
      painted: false,
    }));

    function applySize(state) {
      const rect = state.canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 10 || h < 10) {
        state.w = w;
        state.h = h;
        return false;
      }
      if (state.w === w && state.h === h && state.dpr === dpr) return true;
      state.w = w;
      state.h = h;
      state.dpr = dpr;
      state.canvas.width = Math.round(w * dpr);
      state.canvas.height = Math.round(h * dpr);
      return true;
    }

    function paint(state, virtualMs, elapsed, mount) {
      if (state.w < 10 || state.h < 10) return;
      const ctx = state.ctx;
      const canvas = state.canvas;
      const dpr = state.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const scale = Math.min(state.w / VW, state.h / VH);
      const ox = state.w - VW * scale; // xMax: lines end flush with the input
      const oy = (state.h - VH * scale) / 2; // yMid
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

      canvas.style.opacity = String(mount);

      for (const path of paths) {
        const p = Math.min(1, Math.max(0, (elapsed - path.drawDelay) / 1200));
        const eased = 1 - Math.pow(1 - p, 3);
        ctx.globalAlpha = 0.16 * mount;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)';
        ctx.lineWidth = 1;
        ctx.setLineDash([Math.max(0.01, eased * path.total), path.total + 1]);
        ctx.beginPath();
        ctx.moveTo(path.pts[0].x, path.pts[0].y);
        for (let s = 1; s < path.pts.length; s++) ctx.lineTo(path.pts[s].x, path.pts[s].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // grey dots first, green primaries last so they sit on top
      for (const primary of [false, true]) {
        for (const path of paths) {
          for (const dot of path.dots) {
            if (dot.primary !== primary) continue;
            const t = ((((virtualMs + dot.offset) % dot.dur) + dot.dur) % dot.dur) / dot.dur;
            const fade = Math.min(1, t / 0.05, (1 - t) / 0.05);
            if (fade <= 0) continue;
            const pt = pointAt(path, t);
            ctx.globalAlpha = fade * mount;
            ctx.fillStyle = primary ? '#10b981' : 'rgba(0, 0, 0, 0.18)';
            ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);
          }
        }
      }
      ctx.globalAlpha = 1;
      state.painted = true;
    }

    function paintStatic() {
      states.forEach(state => {
        applySize(state);
        if (state.w < 10 || state.h < 10) return;
        paint(state, 0, 5000, 1);
        state.canvas.style.opacity = '1';
      });
    }

    let raf = 0;
    let running = false;
    let visible = true;
    let last = 0;
    let virtualMs = 0;

    function frame(now) {
      const dt = Math.min(64, last ? now - last : 16);
      last = now;

      if (ramping) {
        const t = Math.min(1, (now - rampStart) / RAMP);
        speed = rampFrom + (rampTo - rampFrom) * easeInOut(t);
        if (t >= 1) {
          ramping = false;
          speed = rampTo;
        }
        row.dataset.speed = speed.toFixed(2);
      }

      virtualMs += dt * speed;

      for (const state of states) {
        if (!state.mountAt) state.mountAt = now;
        const elapsed = now - state.mountAt;
        paint(state, virtualMs, elapsed, Math.min(1, elapsed / 300));
      }

      if (running) raf = requestAnimationFrame(frame);
    }

    function ensureLoop() {
      const active = visible && !reduced() && states.some(state => state.w > 10);
      if (active && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!active && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    }

    const ro = new ResizeObserver(() => {
      states.forEach(applySize);
      if (!running) {
        if (reduced()) paintStatic();
      }
      ensureLoop();
    });
    states.forEach(state => ro.observe(state.canvas));

    const io = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      ensureLoop();
    }, { rootMargin: '100px' });
    io.observe(row);

    const startRamp = target => {
      if (reduced()) return;
      rampFrom = speed;
      rampTo = target;
      rampStart = performance.now();
      ramping = true;
      ensureLoop();
    };
    input.addEventListener('pointerenter', () => startRamp(HOT));
    input.addEventListener('pointerleave', () => startRamp(BASE));

    window.addEventListener('resize', () => {
      const next = window.innerWidth >= 768 ? 8 : 4;
      if (next !== pathCount) {
        pathCount = next;
        paths = buildPaths(pathCount);
      }
      if (!running && reduced()) paintStatic();
    });

    reduceQuery.addEventListener('change', () => {
      ramping = false;
      speed = BASE;
      row.dataset.speed = BASE.toFixed(2);
      if (reduced()) {
        running = false;
        cancelAnimationFrame(raf);
        paintStatic();
      } else {
        ensureLoop();
      }
    });

    // first size pass, then either a static frame or the loop
    requestAnimationFrame(() => {
      states.forEach(applySize);
      if (reduced()) paintStatic();
      ensureLoop();
    });
  }

  /* ---------------------------------------------------- */
  /* 2. Rotating stat badge: data-state + CSS keyframes   */
  /* ---------------------------------------------------- */

  function initBadge() {
    const badge = document.getElementById('badge');
    if (!badge) return;
    const pills = Array.from(badge.querySelectorAll('.badge-pill'));
    if (pills.length < 2) return;

    let current = 0;
    let visible = true;

    const io = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
    }, { rootMargin: '60px' });
    io.observe(badge);

    if (reduced()) return;

    const swap = () => {
      if (!visible) return;
      const next = (current + 1) % pills.length;
      pills[current].dataset.state = 'exit';
      pills[next].dataset.state = 'enter';
      current = next;
    };

    window.setTimeout(() => {
      swap();
      window.setInterval(swap, 4000);
    }, 600);
  }

  /* --------------------------------------------------------- */
  /* 3. Word-pair headline: per-word stagger on the CTA titles  */
  /* --------------------------------------------------------- */

  function initWordSwap() {
    const swap = document.getElementById('cta-swap');
    if (!swap) return;
    const lines = Array.from(swap.querySelectorAll('.word-line'));
    if (lines.length < 2) return;

    lines.forEach(line => {
      Array.from(line.querySelectorAll('.word')).forEach((word, i) => {
        word.style.setProperty('--d', String(i));
      });
    });

    if (reduced()) return;

    let current = 0;
    let visible = true;
    const io = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
    }, { rootMargin: '60px' });
    io.observe(swap);

    window.setInterval(() => {
      if (!visible) return;
      const next = (current + 1) % lines.length;
      lines[current].dataset.state = 'exit';
      lines[next].dataset.state = 'enter';
      current = next;
    }, 3000);
  }

  /* ------------------------------------------------------------ */
  /* 4. Testimonial marquee: scrollLeft drift, tripled, draggable */
  /* ------------------------------------------------------------ */

  function initMarquee() {
    const rows = Array.from(document.querySelectorAll('[data-marquee]'));
    if (!rows.length) return;

    rows.forEach(row => {
      const drift = row.dataset.marquee === 'desktop';
      let copyWidth = 0;
      let raf = 0;
      let running = false;
      let visible = true;
      let hovering = false;
      let dragging = false;
      let last = 0;
      let travelled = 0;

      if (drift) {
        const originals = Array.from(row.children);
        for (let c = 0; c < 2; c++) {
          originals.forEach(card => row.append(card.cloneNode(true)));
        }

        const measure = () => {
          copyWidth = row.scrollWidth / 3;
          if (copyWidth > 0 && row.scrollLeft < 1) row.scrollLeft = copyWidth;
        };
        requestAnimationFrame(measure);
        window.addEventListener('resize', measure);

        row.addEventListener('scroll', () => {
          if (!copyWidth) return;
          if (row.scrollLeft < copyWidth * 0.75) row.scrollLeft += copyWidth;
          else if (row.scrollLeft > copyWidth * 2.25) row.scrollLeft -= copyWidth;
        }, { passive: true });

        if (hoverCapable.matches && !reduced()) {
          row.addEventListener('pointerenter', () => { hovering = true; });
          row.addEventListener('pointerleave', () => { hovering = false; });
        }

        row.addEventListener('pointerdown', event => {
          if (event.pointerType !== 'mouse') return;
          dragging = true;
          row.classList.add('is-dragging');
          row.setPointerCapture?.(event.pointerId);
          const startX = event.clientX;
          const startLeft = row.scrollLeft;
          const move = e => { row.scrollLeft = startLeft - (e.clientX - startX); };
          const up = () => {
            dragging = false;
            row.classList.remove('is-dragging');
            row.removeEventListener('pointermove', move);
            row.removeEventListener('pointerup', up);
            row.removeEventListener('pointercancel', up);
          };
          row.addEventListener('pointermove', move);
          row.addEventListener('pointerup', up);
          row.addEventListener('pointercancel', up);
        });

        row.addEventListener('touchstart', () => { dragging = true; }, { passive: true });
        row.addEventListener('touchend', () => { dragging = false; }, { passive: true });
        row.addEventListener('touchcancel', () => { dragging = false; }, { passive: true });

        const io = new IntersectionObserver(entries => {
          visible = entries[0].isIntersecting;
          sync();
        }, { rootMargin: '100px' });
        io.observe(row);

        const tick = now => {
          const dt = Math.min(64, last ? now - last : 16);
          last = now;
          if (visible && !hovering && !dragging && !reduced()) {
            const dir = row.dataset.dir === '1' ? 1 : -1;
            row.scrollLeft += dir * 0.04 * dt;
            travelled += dir * 0.04 * dt;
            row.dataset.drift = travelled.toFixed(1);
          }
          raf = running ? requestAnimationFrame(tick) : 0;
        };

        const sync = () => {
          const active = visible && !reduced();
          if (active && !running) {
            running = true;
            last = 0;
            raf = requestAnimationFrame(tick);
          } else if (!active && running) {
            running = false;
            cancelAnimationFrame(raf);
          }
        };

        // rows drift from paint; the observer pauses them off-screen
        sync();
        if (reduced()) row.dataset.drift = '0';
      }

      // on touch screens the single row is native scroll-snap, no drift
      row.dataset.ready = 'true';
    });
  }

  /* ------------------------------------------------------------- */
  /* 5. Pipeline stack: sticky cards, scaled pile, live first card */
  /* ------------------------------------------------------------- */

  function initStack() {
    const stack = document.getElementById('stack');
    if (!stack) return;
    const cards = Array.from(stack.querySelectorAll('[data-stack-card]'));
    if (!cards.length) return;

    const isMobile = () => window.innerWidth < 768;
    const baseTop = () => (isMobile() ? 196 : 140);
    const step = () => (isMobile() ? 7 : 15);
    const scaleStep = () => (isMobile() ? 0.03 : 0.04);
    const stickyTop = i => baseTop() + i * step();

    let raf = 0;
    let running = false;
    let near = true;

    function frame() {
      for (let i = 0; i < cards.length; i++) {
        let progress = 0;
        for (let j = i + 1; j < cards.length; j++) {
          const rect = cards[j].getBoundingClientRect();
          const height = cards[j].offsetHeight || 1;
          const p = 1 - Math.min(1, Math.max(0, (rect.top - stickyTop(j)) / height));
          progress += p;
        }
        const scale = Math.max(0.8, 1 - progress * scaleStep());
        const value = scale.toFixed(3);
        if (cards[i].dataset.scale !== value) {
          cards[i].dataset.scale = value;
          cards[i].style.transform = `scale(${value})`;
        }
      }
      raf = running ? requestAnimationFrame(frame) : 0;
    }

    const sync = () => {
      const active = near && !reduced();
      if (active && !running) {
        running = true;
        raf = requestAnimationFrame(frame);
      } else if (!active && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const io = new IntersectionObserver(entries => {
      near = entries[0].isIntersecting;
      sync();
    }, { rootMargin: '200px 0px' });
    io.observe(stack);

    // give every card but the last enough margin to travel with the pile
    function alignPile() {
      const n = cards.length;
      const last = cards[n - 1];
      for (let i = 0; i < n - 1; i++) {
        const want = Math.max(
          16,
          (stickyTop(n - 1) + last.offsetHeight) - (stickyTop(i) + cards[i].offsetHeight),
        );
        if (cards[i].dataset.mb !== String(want)) {
          cards[i].dataset.mb = String(want);
          cards[i].style.marginBottom = `${want}px`;
        }
      }
    }

    window.addEventListener('resize', alignPile);
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(alignPile);
      cards.forEach(card => ro.observe(card));
    }
    requestAnimationFrame(alignPile);

    /* card 1: list revealed one item at a time, spinner then check */
    const list = document.getElementById('agent-list');
    if (!list) return;
    const rows = Array.from(list.querySelectorAll('.agent-row'));
    let revealed = 0;
    let ticks = 0;
    let timer = 0;
    let listVisible = true;

    function render() {
      rows.forEach((row, i) => {
        const state = i < revealed ? 'done' : i === revealed ? 'current' : 'pending';
        if (row.dataset.state !== state) row.dataset.state = state;
      });
      list.dataset.step = String(revealed);
      list.dataset.tick = String(ticks);
    }

    function schedule(ms) {
      window.clearTimeout(timer);
      if (reduced()) return;
      timer = window.setTimeout(advance, ms);
    }

    function advance() {
      if (!listVisible) return;
      if (revealed >= rows.length) {
        revealed = 0;
        render();
        schedule(800);
        return;
      }
      revealed += 1;
      ticks += 1;
      render();
      schedule(revealed >= rows.length ? 3000 : 800);
    }

    render();

    if (reduced()) {
      revealed = rows.length;
      render();
    } else {
      const listIO = new IntersectionObserver(entries => {
        listVisible = entries[0].isIntersecting;
        if (listVisible && revealed < rows.length) schedule(800);
      }, { rootMargin: '0px' });
      listIO.observe(list);
      schedule(800);
    }

    sync();
  }

  /* -------------------------------------------------------- */
  /* 6. Count-up on tilting stat cards                        */
  /* -------------------------------------------------------- */

  function initCountUp() {
    const section = document.getElementById('stats');
    if (!section) return;
    const numbers = Array.from(section.querySelectorAll('[data-target]'));
    if (!numbers.length) return;

    const items = numbers.map(el => ({
      el,
      target: Number(el.dataset.target) || 0,
      prefix: el.dataset.prefix || '',
      suffix: el.dataset.suffix || '',
    }));

    const format = value => Math.round(value).toLocaleString('en-US');
    const show = (item, value) => {
      item.el.textContent = item.prefix + format(value) + item.suffix;
    };

    let started = false;

    function run() {
      const duration = 900;
      const t0 = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        items.forEach(item => show(item, item.target * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    if (reduced()) {
      items.forEach(item => show(item, item.target));
    } else {
      items.forEach(item => show(item, 0));

      // reset ahead of time so the final value never flashes before the count
      const near = new IntersectionObserver(entries => {
        if (started) return;
        entries.forEach(entry => { if (entry.isIntersecting) items.forEach(item => show(item, 0)); });
      }, { rootMargin: '0px 0px 400px 0px' });
      near.observe(section);

      const inView = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !started) {
            started = true;
            run();
          }
        });
      }, { threshold: 0.4 });
      inView.observe(section);

      if (hoverCapable.matches && window.matchMedia('(pointer: fine)').matches) {
        const cards = Array.from(section.querySelectorAll('.stat-card'));
        window.addEventListener('mousemove', event => {
          cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const dx = (event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
            const dy = (event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
            const ry = Math.max(-8, Math.min(8, dx * 8));
            const rx = Math.max(-8, Math.min(8, -dy * 8));
            card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
          });
        }, { passive: true });
      }
    }
  }

  /* -------------------------------------------- */
  /* 7. Pixel loader: 2x2 squares, 150 ms steps   */
  /* -------------------------------------------- */

  function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) return;
    const cells = Array.from(loader.querySelectorAll('span'));
    if (cells.length !== 4) return;

    const order = [0, 1, 3, 2];
    let step = 0;
    let timer = 0;
    let visible = true;

    const draw = () => {
      const lit = order[step % order.length];
      cells.forEach((cell, i) => {
        cell.dataset.on = String(i === lit);
      });
      loader.dataset.lit = String(lit);
    };

    draw();

    const io = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
    }, { rootMargin: '50px' });
    io.observe(loader);

    if (reduced()) return;

    timer = window.setInterval(() => {
      if (!visible) return;
      step += 1;
      draw();
    }, 150);
  }

  /* ----------------------------------------------- */
  /* 8. Pricing slider: label follows the thumb      */
  /* ----------------------------------------------- */

  function initPricing() {
    const input = document.getElementById('budget');
    if (!input) return;
    const card = input.closest('.price-card');
    const tag = document.getElementById('price-tag');
    const tiles = {
      emails: document.querySelector('[data-tile="emails"]'),
      warm: document.querySelector('[data-tile="warm"]'),
      meetings: document.querySelector('[data-tile="meetings"]'),
      cpl: document.querySelector('[data-tile="cpl"]'),
    };
    if (!card || !tag || !tiles.emails) return;

    const EMAIL_PRICE = 0.04;
    const WARM = [0.002, 0.008];
    const MEET = [0.0009, 0.0018];

    const num = value => {
      if (value <= 0) return '0';
      if (value >= 10) return String(Math.round(value));
      return value.toFixed(1).replace(/\.0$/, '');
    };

    function update() {
      const v = Number(input.value) || 0;
      card.style.setProperty('--v', String(v));
      tag.textContent = `$${v}`;

      const emails = Math.round(v / EMAIL_PRICE);
      const warmLow = emails * WARM[0];
      const warmHigh = emails * WARM[1];
      const meetLow = emails * MEET[0];
      const meetHigh = emails * MEET[1];

      tiles.emails.textContent = emails.toLocaleString('en-US');
      tiles.warm.textContent = emails ? `~${num(warmLow)}–${num(warmHigh)}` : '0';
      tiles.meetings.textContent = emails ? `~${num(meetLow)}–${num(meetHigh)}` : '0';

      const midWarm = (warmLow + warmHigh) / 2;
      tiles.cpl.textContent = midWarm > 0 ? `~$${num(v / midWarm)}` : '—';
    }

    input.addEventListener('input', update);
    update();
  }

  /* boot: one line per effect so each can be removed for the bite test */
  initFlow();
  initBadge();
  initWordSwap();
  initMarquee();
  initStack();
  initCountUp();
  initLoader();
  initPricing();
})();
