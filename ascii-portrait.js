/* Interactive ASCII portrait
   - heartbeat: a "lub-dub" pulse that ripples outward from the chest
   - hover/touch: characters scatter away from the pointer, glow accent, spring back
   Needs: <canvas id="ascii-portrait"> and ascii-portrait-data.js loaded first. */
(function () {
  const canvas = document.getElementById("ascii-portrait");
  const rows = window.ASCII_PORTRAIT;
  if (!canvas || !rows) return;

  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- tweakables ---- */
  const COLOR      = "#eceef2";   // resting character colour
  const COLOR_HOT  = "#d9993f";   // colour while a character is displaced
  const FONT       = '600 {s}px "Roboto Mono", ui-monospace, monospace';
  const BEAT_EVERY = 1.5;         // seconds between heartbeats
  const BEAT_PUSH  = 0.9;         // how far the pulse nudges characters (in cells)
  const WAVE_SPEED = 0.8;         // pulse travel speed (canvas widths per second)
  const REPEL_R    = 0.14;        // scatter radius (fraction of canvas width)
  const REPEL_F    = 2.6;         // scatter strength
  const SPRING     = 0.055;       // pull back to home
  const DAMPING    = 0.86;        // lower = settles faster
  const RAMP       = " .:-=+*#%@";

  const COLS = Math.max(...rows.map(r => r.length));
  const ROWS = rows.length;
  const CELL_ASPECT = 2.0;

  let W = 0, H = 0, cellW = 0, cellH = 0, dpr = 1;
  let sprites = { cool: {}, hot: {} };
  let parts = [];
  const pointer = { x: -9999, y: -9999, active: false };

  function buildSprites() {
    const pw = Math.ceil(cellW * dpr), ph = Math.ceil(cellH * dpr);
    const fontPx = Math.round(cellH * dpr * 0.78);
    for (const [kind, colour] of [["cool", COLOR], ["hot", COLOR_HOT]]) {
      sprites[kind] = {};
      for (const ch of RAMP.slice(1)) {
        const c = document.createElement("canvas");
        c.width = pw; c.height = ph;
        const g = c.getContext("2d");
        g.font = FONT.replace("{s}", fontPx);
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = colour;
        g.fillText(ch, pw / 2, ph / 2 + ph * 0.04);
        sprites[kind][ch] = c;
      }
    }
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    cellW = cssW / COLS;
    cellH = cellW * CELL_ASPECT;
    W = cssW; H = cellH * ROWS;
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildSprites();

    // keep scattered state across resizes by rebuilding from scratch (cheap)
    parts = [];
    const cx = W / 2, cy = H * 0.95;            // heartbeat origin: chest, bottom-centre
    for (let r = 0; r < ROWS; r++) {
      const line = rows[r];
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === " ") continue;
        const hx = (c + 0.5) * cellW, hy = (r + 0.5) * cellH;
        const dx = hx - cx, dy = hy - cy, d = Math.hypot(dx, dy) || 1;
        const lum = RAMP.indexOf(ch) / (RAMP.length - 1);
        parts.push({ ch, hx, hy, x: hx, y: hy, vx: 0, vy: 0, ux: dx / d, uy: dy / d, d, lum });
      }
    }
  }

  const gauss = (x, m, s) => Math.exp(-(((x - m) / s) ** 2));
  function pulse(t) {                           // lub-dub
    const tm = ((t % BEAT_EVERY) + BEAT_EVERY) % BEAT_EVERY;
    return gauss(tm, 0.0, 0.07) + 0.65 * gauss(tm, 0.22, 0.07);
  }

  function frame(now) {
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    const R = REPEL_R * W;
    const push = BEAT_PUSH * cellW;
    const hotDist = cellW * 1.4;

    for (const p of parts) {
      const beat = reduceMotion ? 0 : pulse(t - p.d / (WAVE_SPEED * W));
      const tx = p.hx + p.ux * beat * push;
      const ty = p.hy + p.uy * beat * push;

      p.vx += (tx - p.x) * SPRING;
      p.vy += (ty - p.y) * SPRING;

      if (pointer.active && !reduceMotion) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1, k = 1 - d / R;
          const f = k * k * REPEL_F;
          p.vx += (dx / d) * f; p.vy += (dy / d) * f;
        }
      }
      p.vx *= DAMPING; p.vy *= DAMPING;
      p.x += p.vx; p.y += p.vy;

      const off = Math.hypot(p.x - p.hx, p.y - p.hy);
      const hot = off > hotDist;
      ctx.globalAlpha = Math.min(1, 0.45 + p.lum * 0.55 + beat * 0.25);
      ctx.drawImage((hot ? sprites.hot : sprites.cool)[p.ch], p.x - cellW / 2, p.y - cellH / 2, cellW, cellH);
    }
    ctx.globalAlpha = 1;
    if (running) raf = requestAnimationFrame(frame);
  }

  /* ---- pointer ---- */
  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
  }
  canvas.addEventListener("pointermove", setPointer);
  canvas.addEventListener("pointerdown", setPointer);
  for (const ev of ["pointerleave", "pointercancel", "pointerup"]) {
    canvas.addEventListener(ev, () => { pointer.active = false; });
  }

  /* ---- run only while visible ---- */
  let running = false, raf = 0;
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) { running = true; raf = requestAnimationFrame(frame); }
    else if (!entry.isIntersecting) { running = false; cancelAnimationFrame(raf); }
  });

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); if (!running) frame(performance.now()); }, 80);
  }).observe(canvas);

  const start = () => { layout(); io.observe(canvas); };
  // wait for Roboto Mono so the sprites use the right glyphs
  if (document.fonts && document.fonts.load) {
    document.fonts.load('600 16px "Roboto Mono"').catch(() => {}).then(start);
  } else {
    start();
  }
})();
