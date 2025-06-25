/* =========================================================================
   buildPrefixTree.js
   -------------------------------------------------------------------------
   Given:
     • transforms        – Array of IFS transform descriptors
                           (same shape as the `transforms` array you already use)
     • transitionMatrix  – Boolean adjacency matrix [m][m] that disables or
                           enables fᵢ→fⱼ transitions (use an all-true matrix
                           if you want the vanilla chaos-game behaviour).
     • viewBox           – Axis-aligned bounding box {xMin, yMin, xMax, yMax}
                           expressed in the *same* world/eye space in which
                           the transforms live.
     • options           – { maxDepth:Int,  // hard recursion limit
                             pixelTol:Float, // world-space size triggering
                                             // terminal nodes  (≈ one pixel)
                             rootBox:{xMin,…} // optional global bounding box;
                                             // default is the convex hull of
                                             // the four corners after applying
                                             // every transform exactly once }
   Returns:
     A tree whose nodes are
        { prefix: Int[],  // sequence of transform indices
          box:    {xMin,…},
          terminal: Boolean,
          children: Node[] }
   ========================================================================= */

//import { mat4, vec4 } from "gl-matrix";
import { getAffineTransform3D } from "./transforms.js";

// ---------- geometry helpers ----------
// ────────────────── geo helpers for convex quads ──────────────────
function transformQuad(mat, basisQuad) {
  // basisQuad is [[x0,y0], … , [x3,y3]] CCW
  return basisQuad.map(([x,y]) => {
    const v = vec4.fromValues(x, y, 0, 1);
    vec4.transformMat4(v, v, mat);
    return [v[0], v[1]];
  });
}

// axis-aligned viewport corners (CCW)
function viewCorners(vb) {
  return [
    [vb.xMin, vb.yMin],
    [vb.xMax, vb.yMin],
    [vb.xMax, vb.yMax],
    [vb.xMin, vb.yMax],
  ];
}

// point inside convex quad (winding)
function pointInQuad(p, quad) {
  let sign = 0;
  for (let i = 0; i < 4; ++i) {
    const [x1,y1] = quad[i];
    const [x2,y2] = quad[(i+1)&3];
    const cross = (x2 - x1)*(p[1] - y1) - (y2 - y1)*(p[0] - x1);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

// segment–segment intersect helper
function segmentsIntersect(a,b,c,d){
  function ccw(p,q,r){return (r[1]-p[1])*(q[0]-p[0])>(q[1]-p[1])*(r[0]-p[0]);}
  return (ccw(a,c,d) !== ccw(b,c,d)) && (ccw(a,b,c) !== ccw(a,b,d));
}

// quad ↔ viewport intersection
function quadIntersect(quad, vb){
  const vCorners = viewCorners(vb);

  // quick reject by AABB of quad
  const xs = quad.map(p=>p[0]); const ys = quad.map(p=>p[1]);
  if (Math.max(...xs) < vb.xMin || Math.min(...xs) > vb.xMax ||
      Math.max(...ys) < vb.yMin || Math.min(...ys) > vb.yMax) return false;

  // 1) any viewport corner inside quad
  if (vCorners.some(c=>pointInQuad(c,quad))) return true;

  // 2) any quad vertex inside viewport
  if (quad.some(c => c[0]>=vb.xMin && c[0]<=vb.xMax &&
                     c[1]>=vb.yMin && c[1]<=vb.yMax)) return true;

  // 3) edge–edge test
  for(let i=0;i<4;i++){
    const a=quad[i], b=quad[(i+1)&3];
    for(let j=0;j<4;j++){
      const c=vCorners[j], d=vCorners[(j+1)&3];
      if (segmentsIntersect(a,b,c,d)) return true;
    }
  }
  return false;
}

// viewport fully contains quad ?
function quadInside(quad, vb){
  return quad.every(c => c[0]>=vb.xMin && c[0]<=vb.xMax &&
                         c[1]>=vb.yMin && c[1]<=vb.yMax);
}

// ---------- main routine ----------
export function buildPrefixTree(
  basisQuad,             // [[x0,y0],...,[x3,y3]]  initial square
  viewBox,
  transforms,
  transitionMatrix,
  maxDepth = 8,
  verbose   = false
){
  const m   = transforms.length;
  const mats= transforms.map(getAffineTransform3D);

  function recurse(prefix,lastIdx,depth){
    // composite matrix (reverse order)
    let M = mat4.create();
    for(let k=prefix.length-1;k>=0;--k){
      mat4.multiply(M, mats[prefix[k]], M);
    }
    const quad = transformQuad(M, basisQuad);

    if (verbose) console.log("prefix",prefix,"quad",quad);

    if (!quadIntersect(quad, viewBox)) return null;      // prune
    const terminal = depth===0 || quadInside(quad,viewBox);

    const node = { prefix, quad, terminal, children: new Array(m).fill(null) };
    if (terminal) return node;

    for(let i=0;i<m;++i){
      if (lastIdx>=0 && !transitionMatrix[lastIdx][i]) continue;
      const child = recurse([...prefix,i], i, depth-1);
      if (child) node.children[i]=child;
    }
    if (node.children.every(c=>c===null)) return null;
    if (node.children.every(c=>c && c.terminal)){
      node.terminal=true; node.children=[];
    }
    return node;
  }
  return recurse([], -1, maxDepth);
}

/**
 * truncatePrefixTree
 * ------------------
 * Mutates `root` so that the total number of terminal prefixes
 * is ≤ maxPrefixes.  Strategy:
 *
 *   • Walk the tree level-by-level (breadth-first).
 *   • Stop at the first depth whose node count would exceed the limit.
 *   • Mark every node on the previous level as terminal and
 *     null-out their children, thereby discarding deeper nodes.
 *
 * This guarantees we always keep the deepest complete level that
 * still fits in the budget.
 *
 * @param {Node|null} root          prefix-tree root (may be null)
 * @param {number}    maxPrefixes   hard upper limit (e.g. 32)
 * @return {Node|null}              same root pointer, possibly trimmed
 */
export function truncatePrefixTree(root, maxPrefixes) {
  if (!root) return null;                     // empty tree stays empty
  if (maxPrefixes < 1)  {                    // degenerate request
    root.terminal = true;
    root.children = Array(root.children.length).fill(null);
    return root;
  }

  let currentLevel = [root];                 // depth 0
  let depth        = 0;

  while (true) {
    // Gather next level ---------------------------------------------------
    const nextLevel = [];
    currentLevel.forEach(node => {
      node.children.forEach(child => { if (child) nextLevel.push(child); });
    });

    if (nextLevel.length === 0) break;       // reached leaves naturally

    // Would the next level exceed the cap?
    if (nextLevel.length > maxPrefixes) {
      // Turn every node of *current* level into a terminal ----------------
      currentLevel.forEach(node => {
        node.terminal = true;
        node.children = Array(node.children.length).fill(null);
      });
      break;                                 // done: now ≤ maxPrefixes
    }

    // Otherwise descend one level and continue ---------------------------
    currentLevel = nextLevel;
    depth++;
  }

  return root;
}



// make life easy in the console
window.buildPrefixTree = buildPrefixTree;
window.truncatePrefixTree = truncatePrefixTree;
