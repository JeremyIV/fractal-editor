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
function boxesIntersect(a, b) {
  return !(a.xMax < b.xMin || a.xMin > b.xMax ||
           a.yMax < b.yMin || a.yMin > b.yMax);
}
function boxInside(inner, outer) {
  return inner.xMin >= outer.xMin && inner.xMax <= outer.xMax &&
         inner.yMin >= outer.yMin && inner.yMax <= outer.yMax;
}
function transformBox(matrix, baseBox) {
  const corners = [
    vec4.fromValues(baseBox.xMin, baseBox.yMin, 0, 1),
    vec4.fromValues(baseBox.xMin, baseBox.yMax, 0, 1),
    vec4.fromValues(baseBox.xMax, baseBox.yMin, 0, 1),
    vec4.fromValues(baseBox.xMax, baseBox.yMax, 0, 1)
  ].map(v => vec4.transformMat4(vec4.create(), v, matrix));

  const xs = corners.map(p => p[0]);
  const ys = corners.map(p => p[1]);
  return {
    xMin: Math.min(...xs), xMax: Math.max(...xs),
    yMin: Math.min(...ys), yMax: Math.max(...ys)
  };
}

// ---------- main routine ----------
export function buildPrefixTree(
  rootBox,
  viewBox,
  transforms,
  transitionMatrix,
  maxDepth = 8,
  verbose  = false
) {
  const m        = transforms.length;
  const matrices = transforms.map(getAffineTransform3D);

  // --------------------------------------------------- recursive worker
  function recurse(prefix, lastIdx, depth) {
    // ── (1) compute this node's bounding box by applying
    //        the matrices in *reverse* prefix order
    let composite = mat4.create();     // identity
    for (let k = prefix.length - 1; k >= 0; --k) {
      mat4.multiply(composite, matrices[prefix[k]], composite);
    }
    const boundingBox = transformBox(composite, rootBox);

    if (verbose) {
      console.log("Testing prefix", prefix, "\nbox:", boundingBox);
    }

    // ── (2) prune if completely outside viewport
    if (!boxesIntersect(boundingBox, viewBox)) {
      if (verbose) console.log("  » no intersection – culled");
      return null;
    }

    // ── (3) decide termination
    const terminal = depth === 0 || boxInside(boundingBox, viewBox);

    const node = {
      prefix,
      box      : boundingBox,
      terminal,
      children : new Array(m).fill(null)
    };
    if (terminal) {
      if (verbose) console.log("  » terminal");
      return node;
    }

    // ── (4) recurse over allowed children
    for (let i = 0; i < m; ++i) {
      if (lastIdx >= 0 && !transitionMatrix[lastIdx][i]) continue; // Markov rule
      const child = recurse([...prefix, i], i, depth - 1);
      if (child) node.children[i] = child;
    }

    // If no child survived, cull this node as well
    if (node.children.every(c => c === null)) {
      if (verbose) console.log(prefix, "  » all children culled");
      return null;
    }
    // alternatively, if all children are terminal, we can simplify by just calling this prefix terminal
    if (node.children.every(c => (c !== null) && c.terminal)) {
      if (verbose) console.log(prefix, "  » all children terminal!");
      node.terminal = true;
      node.children = [];
    }

    return node;
  }

  // kick off with empty prefix
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
