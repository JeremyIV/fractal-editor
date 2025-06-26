import { transforms, perspective, getAffineTransform3D } from "./transforms.js";
import { vertexShaderSource, fragmentShaderSource } from "./shaders.js";
import { buildPrefixTree, truncatePrefixTree } from "./buildPrefixTree.js";

let MAX_POINTS = 1_000_000;
let QUICK_MAX_POINTS = 100_000;
const MAX_PFX = 32;                       // keep small for WebGL uniform limits

let POINT_SIZE = 1.0
let QUICK_POINT_SIZE = Math.sqrt(MAX_POINTS / QUICK_MAX_POINTS)

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2", { depth: true, preserveDrawingBuffer: true });
const SPHERE_RADIUS = 0.005;
const QUICK_SPHERE_RADIUS = Math.sqrt(
  (SPHERE_RADIUS * SPHERE_RADIUS * MAX_POINTS) / QUICK_MAX_POINTS
);
// World-space box that certainly encloses the entire attractor.
// Pick tighter numbers if you know them.
const ROOT_BOX = { xMin: -1, yMin: -1, xMax: 1, yMax: 1 };
const ROOT_QUAD = [
  [ROOT_BOX.xMin, ROOT_BOX.yMin],
  [ROOT_BOX.xMax, ROOT_BOX.yMin],
  [ROOT_BOX.xMax, ROOT_BOX.yMax],
  [ROOT_BOX.xMin, ROOT_BOX.yMax],
];

if (!gl) {
  alert("WebGL 2.0 not supported");
  throw new Error("WebGL 2.0 not supported");
}

// OPAQUE FRAGMENTS
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.clearDepth(1.0); // Clear everything

gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque

/////////////////////////
// WEBGL INITIALIZATION
/////////////////////////
// ──────────────────────────────────
//  Bounding-box line shaders
// ──────────────────────────────────
const bboxVertexShaderSource = `#version 300 es
precision mediump float;
in vec2 aPosition;
uniform mat4 uProjectionMatrix;
void main () {
    gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
}`;
const bboxFragmentShaderSource = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 fragColor;
void main () { fragColor = uColor; }`;
// ───── bbox programme + VBOs ─────
const bboxProg = createProgram(
  gl,
  createShader(gl, gl.VERTEX_SHADER,   bboxVertexShaderSource),
  createShader(gl, gl.FRAGMENT_SHADER, bboxFragmentShaderSource)
);
const bboxPosLoc   = gl.getAttribLocation(bboxProg, "aPosition");
const bboxProjLoc  = gl.getUniformLocation(bboxProg, "uProjectionMatrix");
const bboxColorLoc = gl.getUniformLocation(bboxProg, "uColor");

// one buffer for the view window, one for the prefix tree
const viewBoxVBO   = gl.createBuffer();
let   viewBoxVerts = 0;

const treeBoxVBO   = gl.createBuffer();
let   treeBoxVerts = 0;
// ───── overlay toggle state ─────
let overlayEnabled = false;  // off by default
let currentViewBox = null;   // {xMin,yMin,xMax,yMax} - auto-calculated

// console helpers for overlay toggle
function toggleOverlay() { overlayEnabled = !overlayEnabled; }
function enableOverlay() { overlayEnabled = true; }
function disableOverlay() { overlayEnabled = false; }
window.toggleOverlay = toggleOverlay;
window.enableOverlay = enableOverlay;
window.disableOverlay = disableOverlay;

// helper to compute current viewBox from projection matrix
function computeViewBox(projMatrix) {
  const inv = mat4.invert(mat4.create(), projMatrix);
  const ndcCorners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const worldCorners = ndcCorners.map(([x, y]) => {
    const v = vec4.transformMat4(vec4.create(), vec4.fromValues(x, y, 0, 1), inv);
    return [v[0] / v[3], v[1] / v[3]];
  });
  const xs = worldCorners.map(p => p[0]);
  const ys = worldCorners.map(p => p[1]);
  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys)
  };
}


const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(
  gl,
  gl.FRAGMENT_SHADER,
  fragmentShaderSource
);
const program = createProgram(gl, vertexShader, fragmentShader);

const positionBuffer = gl.createBuffer();
const indexBuffer = gl.createBuffer();

let bufferedNumPoints = 0;

let projectionMatrix = mat4.create();

// VAO will be created after program is ready
let vao = null;

// Progressive rendering state
let isProgressiveMode = false;
let currentPassCount = 0;
let progressiveAnimationId = null;



// Helper to safely set uniforms
function setUniform1f(name, value) {
  const loc = gl.getUniformLocation(program, name);
  if (loc !== null) {
    gl.uniform1f(loc, value);
  }
}

function drawScene(quick, first_pass) {
  // Cancel any existing progressive rendering
  if (progressiveAnimationId !== null) {
    cancelAnimationFrame(progressiveAnimationId);
    progressiveAnimationId = null;
  }

  // Determine rendering mode
  if (quick === true) {
    // Quick mode: single render with quick settings
    isProgressiveMode = false;
    currentPassCount = 0;
    renderSinglePass(true, true);
  } else if (first_pass === false) {
    // Explicit non-clearing single render
    isProgressiveMode = false;
    renderSinglePass(false, false);
  } else {
    // Progressive mode: start continuous rendering
    isProgressiveMode = true;
    currentPassCount = 0;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    startProgressiveRendering();
  }
}

function startProgressiveRendering() {
  function animate() {
    renderSinglePass(false, false);
    currentPassCount++;
    
    if (isProgressiveMode) {
      progressiveAnimationId = requestAnimationFrame(animate);
    }
  }
  
  animate();
}

window.tree = null;

function refreshTransformMatrices() {
  for (let i = 0; i < transforms.length; ++i) {
    transforms[i]._matrix = getAffineTransform3D(transforms[i]);
  }
}
window.currentViewBox = null;
// Function that always runs - handles prefix tree generation and uniform upload
function updatePrefixTree(projMatrix) {
  // auto-calculate viewBox from projection matrix
  currentViewBox = computeViewBox(projMatrix);
  window.currentViewBox = currentViewBox;

  // build prefix tree for frustum culling (always happens)
  const tree = buildPrefixTree(
    ROOT_QUAD,                // full-fractal box
    currentViewBox,          // viewport box
    transforms,
    transition_matrix,
    5                       // maxDepth
  );
  truncatePrefixTree(tree, MAX_PFX)
  window.tree = tree;

  if (!tree) {
    // viewport misses the fractal: upload one "identity" prefix
    gl.useProgram(program);
    gl.uniform1i  (gl.getUniformLocation(program,"uNumPrefixes"), 1);
    gl.uniform1fv(gl.getUniformLocation(program,"uPrefixCDF"),   [1.0]);

    const I = mat4.create();                         // identity mat4
    const arr = new Float32Array(16);  // 4×4 → 16
    arr.set(I);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(program,"uPrefixMatrices"),
      false,
      arr
    );
    return tree;
  }

  // gather terminal prefixes
  const terminals = [];
  (function collect(node) {
    if (node.terminal) { terminals.push(node); return; }
    node.children.forEach(c => { if (c) collect(c); });
  })(tree);

  // safety guard
  const use = terminals.slice(0, MAX_PFX);

  // build composite matrices (reverse-order product)
  refreshTransformMatrices();
  function compositeMatrix(prefix) {
    let M = mat4.create();                  // identity
    for (let k = prefix.length - 1; k >= 0; --k) {
      mat4.multiply(M, transforms[prefix[k]]._matrix, M);
    }
    return M;
  }
  const mats = use.map(n => compositeMatrix(n.prefix));

  // optional importance weights (prod |det| is common)
  const weights = use.map(n => {
    let w = 1.0;
    n.prefix.forEach(i => {
      const t = transforms[i];
      w *= Math.abs(t.x_scale * t.y_scale * t.z_scale);
    });
    return w;
  });
  const totalW = weights.reduce((a,b)=>a+b,0);
  const cdf    = weights.map((w,i)=>weights.slice(0,i+1).reduce((a,b)=>a+b,0)/totalW);

  // upload uniforms
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program,"uNumPrefixes"), use.length);
  gl.uniform1fv(gl.getUniformLocation(program,"uPrefixCDF"), cdf);
  const pfxMatLoc = gl.getUniformLocation(program, "uPrefixMatrices[0]");

  const flat = new Float32Array(mats.length * 16);   // 16 = 4×4
  for (let i = 0; i < mats.length; ++i) {
    flat.set(mats[i], i * 16);      // copy each mat4
  }
  gl.uniformMatrix4fv(pfxMatLoc, false, flat);
  
  return tree;
}

// Function that only runs when overlay is enabled - handles visual overlay buffers
function rebuildOverlayBuffers(tree) {
  if (!overlayEnabled || !currentViewBox) {
    viewBoxVerts = treeBoxVerts = 0;
    return;
  }

  // ── (a) rebuild view-window VBO (yellow) ──
  const b = currentViewBox;
  const viewVertices = new Float32Array([
    b.xMin, b.yMin,  b.xMax, b.yMin,  // bottom
    b.xMax, b.yMin,  b.xMax, b.yMax,  // right
    b.xMax, b.yMax,  b.xMin, b.yMax,  // top
    b.xMin, b.yMax,  b.xMin, b.yMin   // left
  ]);
  viewBoxVerts = 8; // 8 coords = 4 independent segments
  gl.bindBuffer(gl.ARRAY_BUFFER, viewBoxVBO);
  gl.bufferData(gl.ARRAY_BUFFER, viewVertices, gl.STATIC_DRAW);

  // ── (b) rebuild prefix-tree VBO (cyan) ──
  if (!tree) {
    treeBoxVerts = 0;   // clear overlay VBO so it draws nothing
    gl.bindBuffer(gl.ARRAY_BUFFER, treeBoxVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(), gl.STATIC_DRAW);
    return;
  }

  const verts = [];
  (function collect(node) {
  const q = node.quad;      // [[x0,y0]..]
  verts.push(
    q[0][0],q[0][1], q[1][0],q[1][1],
    q[1][0],q[1][1], q[2][0],q[2][1],
    q[2][0],q[2][1], q[3][0],q[3][1],
    q[3][0],q[3][1], q[0][0],q[0][1]
  );
    node.children.forEach(child => { if (child) collect(child); });
  })(tree);

  treeBoxVerts = verts.length / 2;
  gl.bindBuffer(gl.ARRAY_BUFFER, treeBoxVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function renderSinglePass(quick, shouldClear) {

  if (shouldClear) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  gl.useProgram(program);
  
  // Create VAO if needed
  if (!vao) {
    vao = gl.createVertexArray();
  }

  // PROJECTION MATRIX
  const aspectRatio = canvas.width / canvas.height;

  if (canvas.width > canvas.height) {
    mat4.ortho(projectionMatrix, -aspectRatio, aspectRatio, -1, 1, -1, 1);
  } else {
    mat4.ortho(
      projectionMatrix,
      -1,
      1,
      -1 / aspectRatio,
      1 / aspectRatio,
      -1,
      1
    );
  }
  mat4.multiply(projectionMatrix, projectionMatrix, perspective);

  // always update prefix tree for frustum culling
  const tree = updatePrefixTree(projectionMatrix);
  
  // only rebuild overlay buffers if overlay is enabled
  rebuildOverlayBuffers(tree);

  // Set the projection matrix uniform
  const uProjectionMatrixLoc = gl.getUniformLocation(
    program,
    "uProjectionMatrix"
  );
  gl.uniformMatrix4fv(uProjectionMatrixLoc, false, projectionMatrix);

  // POINT AND INDEX BUFFERS
  const num_points = quick ? QUICK_MAX_POINTS : MAX_POINTS;
  const point_size = quick ? QUICK_POINT_SIZE : POINT_SIZE;
  const sphere_radius = quick ? QUICK_SPHERE_RADIUS : SPHERE_RADIUS;
  const recursion_level = quick ? 20 : 50;
  
  // If the number of points has changed, update the buffer
  if (num_points != bufferedNumPoints) {
    const vertexData = [];
    const indexData = [];
    for (let i = 0; i < num_points; i++) {
      // Just use a single position for each point (0,0) since they'll be transformed anyway
      vertexData.push(0.0, 0.0);
      indexData.push(i);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(vertexData),
      gl.STATIC_DRAW
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(indexData), gl.STATIC_DRAW);

    bufferedNumPoints = num_points;
    
    // Set up VAO when buffers change
    gl.bindVertexArray(vao);
    
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    if (positionLocation >= 0) {
      gl.enableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    const indexLocation = gl.getAttribLocation(program, "aIndex");
    if (indexLocation >= 0) {
      gl.enableVertexAttribArray(indexLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
      gl.vertexAttribPointer(indexLocation, 1, gl.FLOAT, false, 0, 0);
    }
    
    gl.bindVertexArray(null);
  }
  
  const numTransforms = transforms.length;

  // Set the uNumTransforms uniform
  setUniform1f("uNumTransforms", numTransforms);

  // Identity matrix
  const I = {
    origin: [0, 0, 0],
    degrees_rotation: 0,
    rotation_axis: [0, 0, 1],
    x_scale: 1,
    y_scale: 1,
    z_scale: 1,
    color: [1, 1, 1, 1],
  };

  let determinants = [];

  for (let i = 0; i < transforms.length; i++) {
    let t = transforms[i];
    let determinant = t.x_scale * t.y_scale * t.z_scale;
    determinants.push(determinant);
  }

  let cumulative_markov_matrix = getCumulativeMarkovMatrix(
    determinants,
    transition_matrix
  );

  const cumulativeMarkovMatrixLoc = gl.getUniformLocation(
    program,
    `uCumulativeMarkovMatrix`
  );
  gl.uniform1fv(cumulativeMarkovMatrixLoc, cumulative_markov_matrix);

  let flattenedTransforms = [];
  let flattenedColors = [];

  for (let i = 0; i < 10; i++) {
    const transform = i < numTransforms ? transforms[i] : I;
    const affine = getAffineTransform3D(transform);

    flattenedTransforms = flattenedTransforms.concat(Array.from(affine));
    flattenedColors = flattenedColors.concat(transform.color);
  }

  const transformLoc = gl.getUniformLocation(program, `uTransforms`);
  const colorLoc = gl.getUniformLocation(program, `uColors`);
  gl.uniformMatrix4fv(transformLoc, false, flattenedTransforms);
  gl.uniform4fv(colorLoc, flattenedColors);

  setUniform1f("uN", num_points);
  setUniform1f("uR", recursion_level);
  setUniform1f("uSphereRadius", sphere_radius);
  
  // Set the pass count uniform for randomization
  setUniform1f("uPassCount", currentPassCount);
  setUniform1f("uPointSize", point_size);


  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Bind the VAO and draw
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.POINTS, 0, num_points); // Draw N points as simple points
  // ───── draw debug overlays (if enabled and any) ─────
  if (overlayEnabled && (viewBoxVerts + treeBoxVerts) > 0) {
    gl.useProgram(bboxProg);
    gl.uniformMatrix4fv(bboxProjLoc, false, projectionMatrix);
    gl.disable(gl.DEPTH_TEST);   // paint on top

    // (a) tree boxes  — cyan
    if (treeBoxVerts > 0) {
      gl.uniform4fv(bboxColorLoc, [0.0, 1.0, 1.0, 0.8]); // cyan, 80 %
      gl.bindBuffer(gl.ARRAY_BUFFER, treeBoxVBO);
      gl.enableVertexAttribArray(bboxPosLoc);
      gl.vertexAttribPointer(bboxPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, treeBoxVerts);
    }

    // (b) view window — yellow
    if (viewBoxVerts > 0) {
      gl.uniform4fv(bboxColorLoc, [1.0, 1.0, 0.0, 1.0]); // solid yellow
      gl.bindBuffer(gl.ARRAY_BUFFER, viewBoxVBO);
      gl.enableVertexAttribArray(bboxPosLoc);
      gl.vertexAttribPointer(bboxPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, viewBoxVerts);
    }

    gl.disableVertexAttribArray(bboxPosLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.enable(gl.DEPTH_TEST);    // restore
  }

  gl.bindVertexArray(null);
}

function resizeCanvas() {
  const guiWidth = document.getElementById("transform-gui").offsetWidth;
  canvas.width = window.innerWidth - guiWidth;
  canvas.height = window.innerHeight;

  gl.viewport(0, 0, canvas.width, canvas.height);

  // Stop progressive rendering on resize and do a single clear render
  isProgressiveMode = false;
  if (progressiveAnimationId !== null) {
    cancelAnimationFrame(progressiveAnimationId);
    progressiveAnimationId = null;
  }
  
  // Single render after resize
  currentPassCount = 0;
  renderSinglePass(false, true);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas(); // Call it once to set initial size

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export { drawScene, projectionMatrix, resizeCanvas };