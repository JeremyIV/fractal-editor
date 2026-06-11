/* =========================================================================
   ifs_math.js
   -------------------------------------------------------------------------
   Float64 math kernel for the IFS renderer.

   gl-matrix stores everything in Float32Array, which caps zooming around
   1e5 before positions quantize. Everything here works on plain JS arrays
   (= float64), and the renderer only drops to float32 at the very last
   step, when uploading per-prefix matrices that are already expressed
   relative to the viewport (so float32 is plenty).

   A 2D affine transform is a plain array [a, b, tx, c, d, ty]:
       x' = a*x + b*y + tx
       y' = c*x + d*y + ty
   ========================================================================= */

import { getAffineTransform3D } from "./transforms.js";

export function aff2Identity() {
  return [1, 0, 0, 0, 1, 0];
}

// Extract the 2D affine part of a column-major mat4. Valid here because
// every matrix in this app keeps x/y independent of z for z=0 inputs.
export function aff2FromMat4(m) {
  return [m[0], m[4], m[12], m[1], m[5], m[13]];
}

// A ∘ B  (apply B first, then A)
export function aff2Mul(A, B) {
  return [
    A[0] * B[0] + A[1] * B[3],
    A[0] * B[1] + A[1] * B[4],
    A[0] * B[2] + A[1] * B[5] + A[2],
    A[3] * B[0] + A[4] * B[3],
    A[3] * B[1] + A[4] * B[4],
    A[3] * B[2] + A[4] * B[5] + A[5],
  ];
}

export function aff2Apply(A, x, y) {
  return [A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]];
}

// operator ∞-norm of the linear part: |T(x)-T(y)|∞ <= norm * |x-y|∞
export function aff2OpNorm(A) {
  return Math.max(
    Math.abs(A[0]) + Math.abs(A[1]),
    Math.abs(A[3]) + Math.abs(A[4])
  );
}

// The same float32-snapped map matrices the renderer has always used
// (via getAffineTransform3D), held losslessly in float64 from here on.
// Using identical values everywhere keeps the culling geometry and the
// shader perfectly consistent at any zoom.
export function mapAffines(transforms) {
  return transforms.map((t) => aff2FromMat4(getAffineTransform3D(t)));
}

/* ─────────────────────────────────────────────────────────────────────────
   Attractor bound: a square B with T_i(B) ⊆ B for every map, so any
   prefix cell P(B) is guaranteed to contain that prefix's attractor
   piece. Derived from the maps' fixed points and contraction rates
   instead of a hardcoded [-1,1] box, so sprawling fractals cull
   correctly too.
   ──────────────────────────────────────────────────────────────────────── */
export function attractorBound(affs) {
  // fixed point of each map: solve (I - L) p = t
  const fixed = affs.map((A) => {
    const det = (1 - A[0]) * (1 - A[4]) - A[1] * A[3];
    if (Math.abs(det) < 1e-9) return [A[2], A[5]]; // near-identity: fall back
    return [
      ((1 - A[4]) * A[2] + A[1] * A[5]) / det,
      (A[3] * A[2] + (1 - A[0]) * A[5]) / det,
    ];
  });
  let cx = 0,
    cy = 0;
  fixed.forEach(([x, y]) => {
    cx += x / fixed.length;
    cy += y / fixed.length;
  });

  // need r with  |T_i(c)-c|∞ + s_i * r <= r  for all i
  let r = 1e-3;
  affs.forEach((A) => {
    const s = Math.min(aff2OpNorm(A), 0.995);
    const [tx, ty] = aff2Apply(A, cx, cy);
    const d = Math.max(Math.abs(tx - cx), Math.abs(ty - cy));
    r = Math.max(r, d / (1 - s));
  });
  r = Math.min(r * 1.01, 1e4); // tiny margin; cap runaway (expanding maps)

  return {
    cx,
    cy,
    r,
    quad: [
      [cx - r, cy - r],
      [cx + r, cy - r],
      [cx + r, cy + r],
      [cx - r, cy + r],
    ],
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   Sampling kernel. The shader walks the chaos-game chain in reverse time
   order; each step draws a predecessor of the current map, with
   probability proportional to |determinant| among the transition-matrix-
   allowed predecessors (exactly the distribution the old
   getCumulativeMarkovMatrix encoded, including its fall-back to the
   unconditional distribution when a state has no allowed predecessor).

   rows[0]    = unconditional distribution (chain start / empty prefix)
   rows[s+1]  = distribution over predecessors of map s

   The same rows give exact prefix-cell probabilities, so point allocation
   across culling cells matches the chain's own statistics (this is what
   makes luminous brightness seamless across cell boundaries).

   Alias tables (Vose) make each shader step O(1) instead of a CDF scan.
   ──────────────────────────────────────────────────────────────────────── */
function probRow(dets, mask) {
  const m = dets.length;
  let total = 0;
  for (let j = 0; j < m; j++) if (mask[j]) total += dets[j];
  if (total === 0) {
    mask = dets.map(() => true);
    total = dets.reduce((a, b) => a + b, 0);
  }
  if (total === 0) return dets.map(() => 1 / m); // all-degenerate: uniform
  return dets.map((d, j) => (mask[j] ? d / total : 0));
}

function aliasTable(probs) {
  const m = probs.length;
  const prob = new Array(m).fill(1);
  const alias = new Array(m).fill(0).map((_, i) => i);
  const scaled = probs.map((p) => p * m);
  const small = [],
    large = [];
  scaled.forEach((p, i) => (p < 1 ? small : large).push(i));
  while (small.length && large.length) {
    const s = small.pop();
    const l = large.pop();
    prob[s] = scaled[s];
    alias[s] = l;
    scaled[l] += scaled[s] - 1;
    (scaled[l] < 1 ? small : large).push(l);
  }
  return { prob, alias };
}

export function buildKernel(transforms, transition_matrix) {
  const m = transforms.length;
  const dets = transforms.map((t) =>
    Math.abs(t.x_scale * t.y_scale * t.z_scale)
  );

  const rows = [probRow(dets, dets.map(() => true))];
  for (let s = 0; s < m; s++) {
    // predecessors of s: maps j with transition_matrix[j][s]
    rows.push(probRow(dets, dets.map((_, j) => !!transition_matrix[j][s])));
  }

  // pack alias tables for the shader: 11 rows × 10 slots
  // (row r, slot k) → aliasPacked[(r*10+k)*2 .. +1] = [prob, alias]
  const aliasPacked = new Float32Array(11 * 10 * 2);
  for (let r = 0; r < 11; r++) {
    const probs = r <= m ? rows[r] : rows[0];
    const { prob, alias } = aliasTable(probs);
    for (let k = 0; k < 10; k++) {
      const idx = (r * 10 + k) * 2;
      aliasPacked[idx] = k < m ? prob[k] : 1;
      aliasPacked[idx + 1] = k < m ? alias[k] : k;
    }
  }

  return { m, rows, aliasPacked };
}

/* ─────────────────────────────────────────────────────────────────────────
   Similarity-dimension estimate: solve Σ s_i^d = 1 for d. Used to weight
   opaque-mode point allocation by each cell's expected pixel footprint
   (~ size^d), which is what makes coverage converge uniformly.
   ──────────────────────────────────────────────────────────────────────── */
export function similarityDimension(affs) {
  const scales = affs.map((A) =>
    Math.min(Math.max(aff2OpNorm(A), 0.01), 0.99)
  );
  const f = (d) => scales.reduce((acc, s) => acc + Math.pow(s, d), 0) - 1;
  if (f(2) > 0) return 2;
  if (f(0.05) < 0) return 0.05;
  let lo = 0.05,
    hi = 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* Composite c2 over c1 (arrays [r,g,b,a]); same math the renderer always
   used for prefix colors. "Over" is associative, which lets the tree
   build composites incrementally. */
export function stackColors(c1, c2) {
  const [r1, g1, b1, a1] = c1;
  const [r2, g2, b2, a2] = c2;
  const a3 = a2 + a1 * (1 - a2);
  if (a3 === 0) return [0, 0, 0, 0];
  return [
    (r2 * a2 + r1 * a1 * (1 - a2)) / a3,
    (g2 * a2 + g1 * a1 * (1 - a2)) / a3,
    (b2 * a2 + b1 * a1 * (1 - a2)) / a3,
    a3,
  ];
}
