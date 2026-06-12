// Random fractal generator: samples transform sets + transition matrices,
// scores candidates with a quick CPU chaos-game simulation, and keeps
// resampling until one looks structurally interesting (not a featureless
// blob, not sparse dust, not collapsed to a line).
import { transforms, transition_matrix } from "./transforms.js";
import { recreateHandles, setView } from "./gui/handles.js";
import { reRenderTransformForms } from "./gui/transforms_form.js";
import { refreshTransitionMatrixUI } from "./gui/transition_matrix.js";
import { commitHistory } from "./history.js";
import { setCurrentFractal } from "./database.js";

function rand(a = 0, b = 1) {
  return a + Math.random() * (b - a);
}

function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/* ── sampling ──────────────────────────────────────────────────────── */

// Control-point positions: spread out, not clustered. Rejection-sample
// with a minimum pairwise distance that relaxes if space runs out.
function sampleOrigins(n) {
  const origins = [];
  let minDist = 0.55;
  while (origins.length < n) {
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const x = rand(-0.85, 0.85);
      const y = rand(-0.85, 0.85);
      if (origins.every(([ox, oy]) => Math.hypot(x - ox, y - oy) >= minDist)) {
        origins.push([x, y]);
        placed = true;
      }
    }
    if (!placed) minDist *= 0.8;
  }
  return origins;
}

// Per-map (x_scale, y_scale): pick a target similarity dimension d and
// solve Σ sᵢ^d = 1 for the linear scales (sᵢ = (wᵢ/Σw)^(1/d)). Dimension
// is what separates connected lace (d → 2) from disconnected dust
// (d → 1), so sampling it directly keeps results in the sweet spot.
// Classic fractals: Koch 1.26, gasket 1.58, carpet 1.89.
function sampleScales(n) {
  const d = rand(1.25, 1.9);
  const weights = Array.from({ length: n }, () => Math.exp(gauss() * 0.6));
  const wSum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => {
    const s = clamp(Math.pow(w / wSum, 1 / d), 0.12, 0.92);
    const aniso = gauss() * 0.18;
    let sx = clamp(s * Math.exp(aniso), 0.1, 0.92);
    let sy = clamp(s * Math.exp(-aniso), 0.1, 0.92);
    if (Math.random() < 0.15) sx = -sx;
    if (Math.random() < 0.15) sy = -sy;
    return [sx, sy];
  });
}

// Per-fractal rotation character: aligned (mostly 0), crystalline
// (snapped to symmetric angles), or freeform.
function sampleRotations(n) {
  const style = Math.random();
  return Array.from({ length: n }, () => {
    if (style < 0.3) return Math.random() < 0.6 ? 0 : pick([90, -90, 180]);
    if (style < 0.6) return pick([0, 45, -45, 60, -60, 90, -90, 120, -120, 180]);
    return rand(-180, 180);
  });
}

// Contrasting palette: evenly spaced hues with jitter, vivid, with a
// shared base alpha so the composite reads coherently.
function sampleColors(n) {
  const h0 = rand(0, 360);
  const direction = Math.random() < 0.5 ? 1 : -1;
  const baseAlpha = rand(0.45, 0.85);
  return Array.from({ length: n }, (_, i) => {
    const h = h0 + direction * (i * 360) / n + gauss() * 14;
    const [r, g, b] = hslToRgb(h, rand(0.85, 1), rand(0.5, 0.62));
    const a = clamp(baseAlpha + gauss() * 0.08, 0.3, 0.95);
    return [round3(r), round3(g), round3(b), round3(a)];
  });
}

// Boolean transition matrix: often fully open (the classic look), else
// knock out a random fraction of edges. Repair so every map has at least
// one successor and one predecessor — otherwise maps silently vanish.
function sampleTransitionMatrix(n) {
  const tm = Array.from({ length: n }, () => Array(n).fill(true));
  if (Math.random() < 0.4) return tm;
  const knockout = rand(0.15, 0.5);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (Math.random() < knockout) tm[i][j] = false;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!tm[i].some(Boolean)) tm[i][Math.floor(rand(0, n))] = true;
  }
  for (let j = 0; j < n; j++) {
    if (!tm.some((row) => row[j])) tm[Math.floor(rand(0, n))][j] = true;
  }
  return tm;
}

function sampleCandidate() {
  const n = 3 + Math.floor(rand(0, 4)); // 3..6 maps
  const origins = sampleOrigins(n);
  const scales = sampleScales(n);
  const rotations = sampleRotations(n);
  const colors = sampleColors(n);
  const newTransforms = origins.map(([x, y], i) => ({
    origin: [round3(x), round3(y), 0],
    degrees_rotation: round3(rotations[i]),
    rotation_axis: [0, 0, 1],
    x_scale: round3(scales[i][0]),
    y_scale: round3(scales[i][1]),
    z_scale: 1,
    color: colors[i],
  }));
  return { transforms: newTransforms, tm: sampleTransitionMatrix(n) };
}

/* ── quality scoring via a quick CPU chaos game ────────────────────── */

function affineOf(t) {
  const th = (t.degrees_rotation * Math.PI) / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const a = cos * t.x_scale, b = -sin * t.y_scale;
  const c = sin * t.x_scale, d = cos * t.y_scale;
  const [ox, oy] = t.origin;
  return { a, b, c, d, tx: ox - (a * ox + b * oy), ty: oy - (c * ox + d * oy) };
}

// Forward chaos game matching the renderer's sampling semantics:
// next map ∝ |det| among transition-allowed successors of the current map.
function simulate(tfs, tm, nPoints = 8000) {
  const n = tfs.length;
  const affs = tfs.map(affineOf);
  const dets = tfs.map((t) => Math.abs(t.x_scale * t.y_scale));
  const cumRows = tm.map((row) => {
    let total = 0;
    for (let j = 0; j < n; j++) if (row[j]) total += dets[j];
    const mask = total > 0 ? row : row.map(() => true);
    if (total === 0) total = dets.reduce((a, b) => a + b, 0) || n;
    let cum = 0;
    return dets.map((d, j) => (cum += mask[j] ? (total ? d / total : 1 / n) : 0));
  });

  const xs = new Float64Array(nPoints);
  const ys = new Float64Array(nPoints);
  let x = 0, y = 0, state = Math.floor(rand(0, n));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = -50; i < nPoints; i++) {
    const r = Math.random();
    const cum = cumRows[state];
    let next = 0;
    while (next < n - 1 && r > cum[next]) next++;
    const f = affs[next];
    const nx = f.a * x + f.b * y + f.tx;
    const ny = f.c * x + f.d * y + f.ty;
    x = nx; y = ny; state = next;
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 100 || Math.abs(y) > 100) {
      return { exploded: true };
    }
    if (i >= 0) {
      xs[i] = x; ys[i] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Grid occupancy over the bounding box at two resolutions. The
  // coarse/fine occupancy ratio is a box-counting dimension estimate:
  // scattered dust → d near 0–1, space-filling blobs → d near 2.
  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const grid = (G) => {
    const cells = new Uint8Array(G * G);
    for (let i = 0; i < nPoints; i++) {
      const cx = Math.min(G - 1, Math.floor(((xs[i] - minX) / w) * G));
      const cy = Math.min(G - 1, Math.floor(((ys[i] - minY) / h) * G));
      cells[cy * G + cx] = 1;
    }
    return cells;
  };
  const count = (cells) => {
    let occupied = 0;
    for (let i = 0; i < cells.length; i++) occupied += cells[i];
    return occupied;
  };

  // Cohesion: fraction of occupied cells in the largest 4-connected
  // component. One lacy shape → ~1; scattered islet dust → ~0.
  const G = 48;
  const cells48 = grid(G);
  const occupied48 = count(cells48);
  let largest = 0;
  const stack = [];
  for (let start = 0; start < cells48.length; start++) {
    if (cells48[start] !== 1) continue;
    let size = 0;
    stack.push(start);
    cells48[start] = 2;
    while (stack.length) {
      const at = stack.pop();
      size++;
      const cx = at % G, cy = (at / G) | 0;
      if (cx > 0 && cells48[at - 1] === 1) { cells48[at - 1] = 2; stack.push(at - 1); }
      if (cx < G - 1 && cells48[at + 1] === 1) { cells48[at + 1] = 2; stack.push(at + 1); }
      if (cy > 0 && cells48[at - G] === 1) { cells48[at - G] = 2; stack.push(at - G); }
      if (cy < G - 1 && cells48[at + G] === 1) { cells48[at + G] = 2; stack.push(at + G); }
    }
    if (size > largest) largest = size;
  }

  return {
    exploded: false,
    minX, maxX, minY, maxY,
    fill: occupied48 / (G * G),
    dim: Math.log2(count(grid(32)) / count(grid(16))),
    cohesion: occupied48 ? largest / occupied48 : 0,
  };
}

function scoreCandidate(sim) {
  if (sim.exploded) return { ok: false, score: -Infinity };
  const w = sim.maxX - sim.minX;
  const h = sim.maxY - sim.minY;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (!isFinite(long) || long < 0.2) return { ok: false, score: -Infinity };
  if (short / long < 0.08) return { ok: false, score: -2 }; // line-like
  // Sweet spot: dimension ~1.2–1.9 (below = dust/wisps, 2 + high fill =
  // featureless blob), with enough holes in the bbox to show structure
  const ok =
    sim.dim >= 1.25 &&
    sim.dim <= 1.92 &&
    sim.fill >= 0.12 &&
    sim.fill <= 0.5 &&
    sim.cohesion >= 0.25;
  const score =
    -Math.abs(Math.log(sim.fill / 0.22)) -
    1.5 * Math.abs(sim.dim - 1.55) +
    sim.cohesion;
  return { ok, score };
}

/* ── entry point ───────────────────────────────────────────────────── */

function generateRandomFractal() {
  let best = null;
  let bestScore = -Infinity;
  for (let tries = 0; tries < 60; tries++) {
    const cand = sampleCandidate();
    const sim = simulate(cand.transforms, cand.tm);
    const { ok, score } = scoreCandidate(sim);
    if (score > bestScore) {
      bestScore = score;
      best = { cand, sim };
    }
    if (ok) {
      best = { cand, sim };
      break;
    }
  }

  const { cand, sim } = best;
  transforms.length = 0;
  transforms.push(...cand.transforms);
  transition_matrix.length = 0;
  cand.tm.forEach((row) => transition_matrix.push([...row]));
  setCurrentFractal(null);

  recreateHandles();
  reRenderTransformForms();
  refreshTransitionMatrixUI();

  // Fit the view to the attractor (every origin is its map's fixed point,
  // so control points are inside the simulated bounds too)
  if (!sim.exploded) {
    const cx = (sim.minX + sim.maxX) / 2;
    const cy = (sim.minY + sim.maxY) / 2;
    const half = Math.max(sim.maxX - sim.minX, sim.maxY - sim.minY) / 2;
    setView(clamp(0.85 / Math.max(half, 1e-3), 0.05, 4), cx, cy);
  } else {
    setView(1, 0, 0);
  }
  commitHistory();
}

window.generateRandomFractal = generateRandomFractal;
// console/test helper for tuning the generator's acceptance criteria
window.__randomFractalDebug = { sampleCandidate, simulate, scoreCandidate };

export { generateRandomFractal };
