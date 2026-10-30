/* Floating code-cubes
   A fixed, click-through canvas behind the page. Small wireframe cubes with code
   symbols on their faces drift around, lean toward the cursor / last touch,
   and spin faster while the page scrolls.
   Needs:  <canvas id="cubes" aria-hidden="true"></canvas>
   Theme via CSS:  --cube-rgb: 201, 139, 60;   (r, g, b) */
(function () {
  const canvas = document.getElementById("cubes");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- tweakables ---- */
  const COUNT_DESKTOP = 14;
  const COUNT_MOBILE  = 7;
  const SIZE_MIN = 11, SIZE_MAX = 30;      // half-width of a cube in px (far -> near)
  const FOCAL    = 600;                    // perspective strength
  const GLYPHS   = ["</>", "{ }", "=>", "[ ]", "&&", "//", "( )", ";", "#", "!=", "$_", "0x"];
  const FONT     = '700 {s}px "Roboto Mono", ui-monospace, monospace';

  let W = 0, H = 0, dpr = 1, rgb = "201,139,60";
  const pointer = { x: 0, y: 0 };
  let scrollBoost = 0, lastScrollY = window.scrollY;

  function readTheme() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--cube-rgb").trim();
    if (v) rgb = v.replace(/\s+/g, "");
  }

  /* seeded RNG so the layout is the same every load */
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ---- geometry ---- */
  const VERTS = [];
  for (let i = 0; i < 8; i++) VERTS.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1]);
  const EDGES = [];
  for (let i = 0; i < 8; i++) for (let b = 1; b <= 4; b <<= 1) if (!(i & b)) EDGES.push([i, i | b]);
  // faces: axis a, sign s. u,v chosen so u x v = -normal  (text reads un-mirrored from outside)
  const FACES = [];
  for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    const e = (i) => { const o = [0, 0, 0]; o[i] = 1; return o; };
    FACES.push({ n: e(a).map(x => x * s), u: s > 0 ? e(c) : e(b), v: s > 0 ? e(b) : e(c) });
  }

  function rotate(m, p) {
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
  }
  function matrix(rx, ry, rz) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    return [
      cy * cz, -cy * sz, sy,
      sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy,
      -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy
    ];
  }

  /* ---- cubes ---- */
  let cubes = [];
  function build() {
    const rand = rng(20261030);
    const n = W < 700 ? COUNT_MOBILE : COUNT_DESKTOP;
    cubes = [];
    for (let i = 0; i < n; i++) {
      const depth = rand();                              // 0 far .. 1 near
      cubes.push({
        depth,
        size: SIZE_MIN + (SIZE_MAX - SIZE_MIN) * depth,
        hx: 0.06 + rand() * 0.88, hy: 0.08 + rand() * 0.84,       // home, as viewport fractions
        driftA: 14 + rand() * 30, driftS: 0.12 + rand() * 0.2, phase: rand() * 6.28,
        pull: 0.10 + rand() * 0.36,                      // how strongly it leans to the cursor
        orbit: 50 + rand() * 150, orbitSpeed: (rand() - 0.5) * 0.5, orbitPhase: rand() * 6.28,
        x: rand() * W, y: rand() * H, vx: 0, vy: 0,
        rx: rand() * 6.28, ry: rand() * 6.28, rz: rand() * 6.28,
        wx: (rand() - 0.5) * 0.5, wy: (rand() - 0.5) * 0.6, wz: (rand() - 0.5) * 0.3,
        glyphs: Array.from({ length: 6 }, () => GLYPHS[(rand() * GLYPHS.length) | 0])
      });
    }
    cubes.sort((a, b) => a.depth - b.depth);             // draw far ones first
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!pointer.x) { pointer.x = W * 0.72; pointer.y = H * 0.38; }
    const wasCount = cubes.length;
    if (!wasCount || (W < 700 ? COUNT_MOBILE : COUNT_DESKTOP) !== wasCount) build();
  }

  /* ---- drawing ---- */
  function drawCube(c) {
    const m = matrix(c.rx, c.ry, c.rz);
    const s = c.size;
    const alpha = 0.22 + 0.5 * c.depth;
    const proj = (p) => { const r = rotate(m, p); const k = FOCAL / (FOCAL + r[2] * s); return [c.x + r[0] * s * k, c.y + r[1] * s * k, r[2]]; };

    const pv = VERTS.map(proj);

    // faint front-face fill + glyph
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const C = F.n;
      const P  = proj([C[0] - F.u[0] - F.v[0], C[1] - F.u[1] - F.v[1], C[2] - F.u[2] - F.v[2]]);
      const PU = proj([C[0] + F.u[0] - F.v[0], C[1] + F.u[1] - F.v[1], C[2] + F.u[2] - F.v[2]]);
      const PV = proj([C[0] - F.u[0] + F.v[0], C[1] - F.u[1] + F.v[1], C[2] - F.u[2] + F.v[2]]);
      const ux = PU[0] - P[0], uy = PU[1] - P[1], vx = PV[0] - P[0], vy = PV[1] - P[1];
      if (ux * vy - uy * vx <= 0) continue;               // back face
      const facing = Math.min(1, (ux * vy - uy * vx) / (4 * s * s));   // 0 edge-on .. 1 square-on
      ctx.fillStyle = `rgba(${rgb},${0.05 * facing + 0.015})`;
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]); ctx.lineTo(PU[0], PU[1]); ctx.lineTo(PU[0] + vx, PU[1] + vy); ctx.lineTo(PV[0], PV[1]); ctx.closePath();
      ctx.fill();

      if (s > 13 && facing > 0.25) {                      // glyphs only where they'd be legible
        ctx.save();
        ctx.setTransform(dpr * ux / 100, dpr * uy / 100, dpr * vx / 100, dpr * vy / 100, dpr * P[0], dpr * P[1]);
        ctx.font = FONT.replace("{s}", c.glyphs[f].length > 2 ? 34 : 52);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(${rgb},${alpha * 0.85 * facing})`;
        ctx.fillText(c.glyphs[f], 50, 52);
        ctx.restore();
      }
    }

    // wireframe
    ctx.strokeStyle = `rgba(${rgb},${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [a, b] of EDGES) { ctx.moveTo(pv[a][0], pv[a][1]); ctx.lineTo(pv[b][0], pv[b][1]); }
    ctx.stroke();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    scrollBoost *= 0.92;

    if (!reduceMotion) {                                   // soft separation so cubes don't stack
      for (let i = 0; i < cubes.length; i++) for (let j = i + 1; j < cubes.length; j++) {
        const a = cubes[i], b = cubes[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const min = (a.size + b.size) * 1.7;
        if (d < min) { const f = (min - d) / min * 0.35; a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f; }
      }
    }
    for (const c of cubes) {
      if (!reduceMotion) {
        const hx = c.hx * W + Math.cos(t * c.driftS + c.phase) * c.driftA;
        const hy = c.hy * H + Math.sin(t * c.driftS * 1.3 + c.phase) * c.driftA;
        const ang = t * c.orbitSpeed + c.orbitPhase;
        const tx = hx + (pointer.x - hx) * c.pull + Math.cos(ang) * c.orbit * c.pull;
        const ty = hy + (pointer.y - hy) * c.pull + Math.sin(ang) * c.orbit * c.pull;
        const k = 0.004 + 0.008 * c.depth;                 // near cubes react quicker
        c.vx = (c.vx + (tx - c.x) * k) * 0.9; c.vy = (c.vy + (ty - c.y) * k) * 0.9;
        c.x += c.vx; c.y += c.vy;
        const spin = 1 + scrollBoost * 6;
        c.rx += c.wx * dt * spin; c.ry += c.wy * dt * spin; c.rz += c.wz * dt * spin;
      }
      drawCube(c);
    }
    if (!reduceMotion) raf = requestAnimationFrame(frame);
  }

  /* ---- input ---- */
  window.addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  window.addEventListener("pointerdown", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  window.addEventListener("scroll", () => {
    const y = window.scrollY; scrollBoost = Math.min(0.5, scrollBoost + Math.abs(y - lastScrollY) * 0.004); lastScrollY = y;
  }, { passive: true });
  window.addEventListener("resize", resize);
  window.addEventListener("themechange", readTheme);

  let raf = 0;
  readTheme(); resize();
  const go = () => { last = performance.now(); raf = requestAnimationFrame(frame); };
  if (document.fonts && document.fonts.load) document.fonts.load('700 16px "Roboto Mono"').catch(() => {}).then(go); else go();
})();
