/* =========================================================================
   buildPrefixTree.js
   -------------------------------------------------------------------------
   Viewport culling for the chaos game: find a set of transform prefixes
   whose cells (prefix applied to the attractor's bounding square) cover
   everything visible, and only what's visible.

   This is a best-first subdivision instead of a fixed-depth recursion:
   leaves sit in a priority queue scored by
        probability-mass × how-oversized-the-cell-is
   and the worst leaf is split until every cell is either fully inside the
   viewport (no waste) or small relative to it (bounded waste), or the
   leaf budget runs out. Depth is therefore unbounded (deep zooms keep
   subdividing as far as needed — prefix lengths of 100+ are normal at
   extreme zoom), and the budget is spent exactly where it pays.

   All geometry is float64 (plain arrays); see ifs_math.js.

   Each returned leaf:
     {
       aff       — float64 composite affine of the prefix (outermost first)
       w         — exact probability that the chain's most recent steps
                   spell this prefix (normalized over returned leaves)
       inner     — innermost transform index (-1 for the empty prefix);
                   seeds the shader's reverse-order chain sampling
       color     — composite color of the prefix (stackColors)
       size      — conservative cell diameter (world units)
       R         — chain steps this cell needs (geometry + color floors)
       quad      — cell corners (for the debug overlay)
       depth     — prefix length
     }
   ========================================================================= */

import { aff2Identity, aff2Mul, aff2Apply, aff2OpNorm, stackColors } from "./ifs_math.js";

// ────────────────── geometry helpers (convex quads, f64) ──────────────────
function viewCorners(vb) {
  return [
    [vb.xMin, vb.yMin],
    [vb.xMax, vb.yMin],
    [vb.xMax, vb.yMax],
    [vb.xMin, vb.yMax],
  ];
}

function pointInQuad(p, quad) {
  let sign = 0;
  for (let i = 0; i < 4; ++i) {
    const [x1, y1] = quad[i];
    const [x2, y2] = quad[(i + 1) & 3];
    const cross = (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

function segmentsIntersect(a, b, c, d) {
  function ccw(p, q, r) {
    return (r[1] - p[1]) * (q[0] - p[0]) > (q[1] - p[1]) * (r[0] - p[0]);
  }
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function quadIntersect(quad, vb) {
  const xs = [quad[0][0], quad[1][0], quad[2][0], quad[3][0]];
  const ys = [quad[0][1], quad[1][1], quad[2][1], quad[3][1]];
  if (
    Math.max(...xs) < vb.xMin ||
    Math.min(...xs) > vb.xMax ||
    Math.max(...ys) < vb.yMin ||
    Math.min(...ys) > vb.yMax
  )
    return false;

  const vCorners = viewCorners(vb);
  if (vCorners.some((c) => pointInQuad(c, quad))) return true;
  if (
    quad.some(
      (c) => c[0] >= vb.xMin && c[0] <= vb.xMax && c[1] >= vb.yMin && c[1] <= vb.yMax
    )
  )
    return true;

  for (let i = 0; i < 4; i++) {
    const a = quad[i],
      b = quad[(i + 1) & 3];
    for (let j = 0; j < 4; j++) {
      const c = vCorners[j],
        d = vCorners[(j + 1) & 3];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function quadInside(quad, vb) {
  return quad.every(
    (c) => c[0] >= vb.xMin && c[0] <= vb.xMax && c[1] >= vb.yMin && c[1] <= vb.yMax
  );
}

// ────────────────── tiny binary max-heap on .priority ──────────────────
class MaxHeap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].priority >= a[i].priority) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l].priority > a[m].priority) m = l;
        if (r < a.length && a[r].priority > a[m].priority) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  peek() {
    return this.a[0];
  }
}

// ────────────────── main routine ──────────────────
export function buildPrefixLeaves({
  rootQuad, // invariant square corners (attractorBound().quad)
  viewBox, // {xMin, yMin, xMax, yMax} world space
  affs, // float64 2D affines of the maps
  colors, // per-map RGBA
  kernel, // buildKernel() result (rows of step probabilities)
  leafBudget, // max number of leaves
  pixelWorld, // world-space size of one pixel
  maxLen = 250, // hard prefix-length cap (also bounds f64 underflow)
}) {
  const m = affs.length;
  const rows = kernel.rows;
  const opNorms = affs.map(aff2OpNorm);

  const viewSize = Math.max(viewBox.xMax - viewBox.xMin, viewBox.yMax - viewBox.yMin);

  // Chain steps shrink detail by at most sMax per step. A cell of size s
  // needs R with s * sMax^R <= pixel; R is capped at 64 in the shader, so
  // cells must shrink below insideTarget for the chain to reach pixel
  // scale. Boundary cells additionally shrink to a fraction of the view
  // so the off-screen part of their cells (= wasted points) stays small.
  const sMax = Math.min(Math.max(Math.max(...opNorms, 0.05), 0.05), 0.97);
  const logS = Math.log(sMax);
  const R_HEADROOM = 48; // leave slack below the shader's 64 cap
  const insideTarget = pixelWorld / Math.exp(R_HEADROOM * logS);
  const boundaryTarget = Math.min(viewSize / 8, insideTarget);

  // Color blending converges as Π(1-α); keep enough steps that the
  // truncated tail is under ~0.5% so low-alpha looks don't shift.
  let aMin = 1;
  colors.forEach((c) => (aMin = Math.min(aMin, c[3])));
  const rColor = Math.max(4, Math.min(64, Math.ceil(5.3 / Math.max(aMin, 0.083))));

  const rootSize = Math.max(
    rootQuad[2][0] - rootQuad[0][0],
    rootQuad[2][1] - rootQuad[0][1]
  );

  const root = {
    aff: aff2Identity(),
    w: 1,
    inner: -1,
    color: [0, 0, 0, 0],
    size: rootSize,
    depth: 0,
    quad: rootQuad,
    inside: quadInside(rootQuad, viewBox),
  };
  if (!root.inside && !quadIntersect(rootQuad, viewBox)) return [];

  const target = (n) => (n.inside ? insideTarget : boundaryTarget);
  const oversize = (n) => n.size / target(n);
  const setPriority = (n) => {
    n.priority = n.w * Math.min(oversize(n), 1e30);
  };
  setPriority(root);

  const heap = new MaxHeap();
  heap.push(root);
  const done = [];
  let pops = 0;
  const maxPops = leafBudget * 6;

  while (heap.size > 0 && heap.size + done.length < leafBudget && pops < maxPops) {
    const top = heap.peek();
    if (oversize(top) <= 1) break; // largest remaining cell is fine → all are
    heap.pop();
    pops++;

    if (top.depth >= maxLen) {
      done.push(top);
      continue;
    }

    const stepRow = rows[top.inner + 1];
    for (let j = 0; j < m; j++) {
      const p = stepRow[j];
      if (p <= 0) continue; // not an allowed predecessor / zero measure
      const aff = aff2Mul(top.aff, affs[j]);
      const child = {
        aff,
        w: top.w * p,
        inner: j,
        color: stackColors(colors[j], top.color),
        size: top.size * opNorms[j],
        depth: top.depth + 1,
        quad: null,
        inside: top.inside,
      };
      if (!top.inside) {
        // rootQuad is invariant (T_j(B) ⊆ B), so children of an inside
        // cell are inside automatically; only boundary cells get tested
        child.quad = rootQuad.map(([x, y]) => aff2Apply(aff, x, y));
        if (!quadIntersect(child.quad, viewBox)) continue; // culled
        child.inside = quadInside(child.quad, viewBox);
      }
      setPriority(child);
      heap.push(child);
    }
    // if every child was culled the parent's mass simply drops out;
    // normalization below re-distributes it (same as the old pruning)
  }

  const leaves = done.concat(heap.a);
  if (leaves.length === 0) return [];

  let totalW = 0;
  leaves.forEach((n) => (totalW += n.w));
  if (totalW <= 0) return [];

  for (const n of leaves) {
    n.w /= totalW;
    if (!n.quad) n.quad = rootQuad.map(([x, y]) => aff2Apply(n.aff, x, y));
    // chain steps needed to take this cell down to pixel scale
    const need =
      n.size <= pixelWorld
        ? 0
        : Math.ceil(Math.log(pixelWorld / n.size) / logS);
    n.R = Math.max(rColor, Math.min(64, Math.max(4, need)));
  }

  return leaves;
}

// console debugging
window.buildPrefixLeaves = buildPrefixLeaves;
