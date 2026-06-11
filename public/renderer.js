import { transforms, transition_matrix, perspective } from "./transforms.js";
import { vertexShaderSource, fragmentShaderSource } from "./shaders.js";
import { buildPrefixLeaves } from "./buildPrefixTree.js";
import {
  mapAffines,
  attractorBound,
  buildKernel,
  similarityDimension,
} from "./ifs_math.js";

// touch devices start with a smaller point budget so interaction stays
// smooth; progressive rendering then adapts to the actual GPU (below)
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;
const MIN_PASS_POINTS = 96_000;
const MAX_PASS_POINTS = 4_194_304; // 2^22: keeps (id,pass) seed packing unique
let passPoints = IS_TOUCH ? 300_000 : 1_000_000;
let luminousPassPoints = passPoints; // frozen per progressive run so the
// running-mean normalization stays exact
const QUICK_MAX_POINTS = IS_TOUCH ? 60_000 : 100_000;

// pass caps must stay under 512 (seed packing); the point budget is the
// real limit -- it stops refinement once enough samples have been drawn
const OPAQUE_MAX_PASSES = IS_TOUCH ? 120 : 400;
const LUMINOUS_MAX_PASSES = IS_TOUCH ? 100 : 250;
const POINT_BUDGET = IS_TOUCH ? 60e6 : 800e6;

// culling granularity: how many prefix cells the view gets subdivided into
const LEAF_BUDGET_FULL = IS_TOUCH ? 320 : 640;
const LEAF_BUDGET_QUICK = IS_TOUCH ? 96 : 128;
const TEX_W = 2048; // prefix texture width; holds up to 1024 prefixes

const POINT_SIZE = 1.0;
const QUICK_POINT_SIZE = Math.sqrt(
  (IS_TOUCH ? 300_000 : 1_000_000) / QUICK_MAX_POINTS
);

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2", { depth: true, preserveDrawingBuffer: true });

if (!gl) {
  alert("WebGL 2.0 not supported");
  throw new Error("WebGL 2.0 not supported");
}

// OPAQUE FRAGMENTS
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.clearDepth(1.0);
gl.clearColor(0.0, 0.0, 0.0, 1.0);

/////////////////////////
// WEBGL INITIALIZATION
/////////////////////////
// ──────────────────────────────────
//  Bounding-box line shaders (debug overlay, NDC space)
// ──────────────────────────────────
const bboxVertexShaderSource = `#version 300 es
precision mediump float;
in vec2 aPosition;
void main () {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
const bboxFragmentShaderSource = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 fragColor;
void main () { fragColor = uColor; }`;
const bboxProg = createProgram(
  gl,
  createShader(gl, gl.VERTEX_SHADER, bboxVertexShaderSource),
  createShader(gl, gl.FRAGMENT_SHADER, bboxFragmentShaderSource)
);
const bboxPosLoc = gl.getAttribLocation(bboxProg, "aPosition");
const bboxColorLoc = gl.getUniformLocation(bboxProg, "uColor");

const viewBoxVBO = gl.createBuffer();
let viewBoxVerts = 0;
const treeBoxVBO = gl.createBuffer();
let treeBoxVerts = 0;

// ───── overlay toggle state ─────
let overlayEnabled = false;
let currentViewBox = null;
window.toggleOverlay = () => (overlayEnabled = !overlayEnabled);
window.enableOverlay = () => (overlayEnabled = true);
window.disableOverlay = () => (overlayEnabled = false);

// ──────────────────────────────────
//  Chaos-game point program
// ──────────────────────────────────
const program = createProgram(
  gl,
  createShader(gl, gl.VERTEX_SHADER, vertexShaderSource),
  createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
);
const loc = {
  prefixTex: gl.getUniformLocation(program, "uPrefixTex"),
  numPrefixes: gl.getUniformLocation(program, "uNumPrefixes"),
  pass: gl.getUniformLocation(program, "uPass"),
  pointSize: gl.getUniformLocation(program, "uPointSize"),
  numMaps: gl.getUniformLocation(program, "uNumMaps"),
  mapsAff: gl.getUniformLocation(program, "uMapsAff"),
  colors: gl.getUniformLocation(program, "uColors"),
  alias: gl.getUniformLocation(program, "uAlias"),
};

// the point shader has no vertex attributes (everything derives from
// gl_VertexID), same pattern as the fullscreen passes below
const vao = gl.createVertexArray();

// per-prefix data texture: rows 0-1 matrices/colors, row 2 cumulative
// point-allocation starts (re-uploaded every pass)
const prefixTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, prefixTex);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, TEX_W, 3);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.bindTexture(gl.TEXTURE_2D, null);

const prefixTexels = new Float32Array(TEX_W * 2 * 4);
const cumTexels = new Float32Array(1024 * 4);
const mapsAffBuf = new Float32Array(20 * 4);
const colorsBuf = new Float32Array(10 * 4);

// scene state produced by updateScene()
const scene = {
  count: 0,
  wLum: [], // exact chain-statistics weights (luminous correctness)
  wOpq: [], // pixel-footprint weights (opaque fill speed)
  leaves: [],
};
// view scalars for composing matrices / projecting overlay (all f64)
const vs = { ox: 1, oy: 1, zoom: 1, panX: 0, panY: 0 };

let projectionMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const orthoTmp = new Array(16);

let isProgressiveMode = false;
let currentPassCount = 0;
let progressiveAnimationId = null;
let totalPointsDrawn = 0;
let vsyncEst = 30; // running estimate of the display's frame interval (ms)

// ──────────────────────────────────
//  Luminous (additive) rendering
// ──────────────────────────────────
// Points are accumulated additively into a float framebuffer; the screen
// shows the *running mean* (sum / passes), tone-mapped as 1-exp(-k*mu).
// Normalizing by pass count makes the image converge instead of brighten
// forever; auto-exposure (percentile of a 64x64 density sample) handles
// how density varies with the fractal and the zoom level.
const luminousSupported = !!gl.getExtension("EXT_color_buffer_float");
let renderMode = "opaque";
let accumTex = null;
let accumFBO = null;
let accumW = 0;
let accumH = 0;
let accumNeedsClear = true;
let exposure = 50.0;
let lastExposurePass = 0;
const SAMPLE_SIZE = 64;
let sampleTex = null;
let sampleFBO = null;

const fullscreenVertexSource = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const displayFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uAccum;
uniform float uInvPasses;
uniform float uExposure;
out vec4 fragColor;
void main() {
  vec3 mu = texelFetch(uAccum, ivec2(gl_FragCoord.xy), 0).rgb * uInvPasses;
  fragColor = vec4(1.0 - exp(-uExposure * mu), 1.0);
}`;
const sampleFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uAccum;
uniform vec2 uAccumSize;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / ${SAMPLE_SIZE}.0;
  fragColor = texelFetch(uAccum, ivec2(uv * uAccumSize), 0);
}`;

let displayProg = null;
let sampleProg = null;
if (luminousSupported) {
  displayProg = createProgram(
    gl,
    createShader(gl, gl.VERTEX_SHADER, fullscreenVertexSource),
    createShader(gl, gl.FRAGMENT_SHADER, displayFragmentSource)
  );
  sampleProg = createProgram(
    gl,
    createShader(gl, gl.VERTEX_SHADER, fullscreenVertexSource),
    createShader(gl, gl.FRAGMENT_SHADER, sampleFragmentSource)
  );
}

function createFloatTarget(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo };
}

function ensureAccumBuffers() {
  if (accumTex && accumW === canvas.width && accumH === canvas.height) return;
  if (accumTex) {
    gl.deleteTexture(accumTex);
    gl.deleteFramebuffer(accumFBO);
  }
  ({ tex: accumTex, fbo: accumFBO } = createFloatTarget(canvas.width, canvas.height));
  accumW = canvas.width;
  accumH = canvas.height;
  accumNeedsClear = true;
  if (!sampleTex) {
    ({ tex: sampleTex, fbo: sampleFBO } = createFloatTarget(SAMPLE_SIZE, SAMPLE_SIZE));
  }
}

function updateExposure(passes) {
  lastExposurePass = passes;
  gl.bindFramebuffer(gl.FRAMEBUFFER, sampleFBO);
  gl.viewport(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  gl.useProgram(sampleProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, accumTex);
  gl.uniform1i(gl.getUniformLocation(sampleProg, "uAccum"), 0);
  gl.uniform2f(gl.getUniformLocation(sampleProg, "uAccumSize"), accumW, accumH);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const buf = new Float32Array(SAMPLE_SIZE * SAMPLE_SIZE * 4);
  gl.readPixels(0, 0, SAMPLE_SIZE, SAMPLE_SIZE, gl.RGBA, gl.FLOAT, buf);
  const lum = [];
  for (let i = 0; i < buf.length; i += 4) {
    const l = (buf[i] + buf[i + 1] + buf[i + 2]) / (3 * passes);
    if (l > 0) lum.push(l);
  }
  if (lum.length === 0) return;
  lum.sort((a, b) => a - b);
  // expose so the brightest structures land around 0.86 after tone-mapping
  const ref = lum[Math.min(lum.length - 1, Math.floor(lum.length * 0.92))];
  const target = 2.0 / Math.max(ref, 1e-9);
  exposure = Math.min(Math.max(exposure * 0.6 + target * 0.4, 0.05), 1e6);
}

function setRenderMode(mode) {
  if (mode === renderMode) return;
  if (mode === "luminous" && !luminousSupported) return;
  renderMode = mode;
  drawScene();
}

function getRenderMode() {
  return renderMode;
}

function drawScene(quick, first_pass) {
  if (progressiveAnimationId !== null) {
    cancelAnimationFrame(progressiveAnimationId);
    progressiveAnimationId = null;
  }

  updateScene(quick === true);

  if (quick === true) {
    isProgressiveMode = false;
    currentPassCount = 0;
    renderSinglePass(true, true);
  } else if (first_pass === false) {
    isProgressiveMode = false;
    renderSinglePass(false, false);
  } else {
    isProgressiveMode = true;
    currentPassCount = 0;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    accumNeedsClear = true;
    startProgressiveRendering();
  }
}

function startProgressiveRendering() {
  const luminous = renderMode === "luminous" && luminousSupported;
  luminousPassPoints = passPoints;
  totalPointsDrawn = 0;
  const maxPasses = luminous ? LUMINOUS_MAX_PASSES : OPAQUE_MAX_PASSES;
  let lastT = performance.now();
  let frameAcc = 0;
  let frameCnt = 0;

  function animate() {
    renderSinglePass(false, false);
    currentPassCount++;

    // Adapt opaque pass size to the GPU by hill-climbing against the
    // display's vsync interval: rAF deltas sit at one vsync while the
    // GPU keeps up and jump to multiples when it falls behind, so grow
    // until frames start missing vsync, then back off. (Luminous keeps
    // a fixed size per run so the running-mean normalization is exact.)
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;
    if (!luminous && currentPassCount > 12 && dt < 250) {
      // frame interval floor: ignore sub-6ms anomalies (double-fired rAF)
      if (dt >= 6) vsyncEst = Math.min(vsyncEst, Math.max(dt, 7));
      frameAcc += dt;
      frameCnt++;
      if (frameCnt >= 8) {
        const avg = frameAcc / frameCnt;
        frameAcc = 0;
        frameCnt = 0;
        if (avg > 2.1 * vsyncEst && passPoints > MIN_PASS_POINTS) {
          passPoints = Math.max(MIN_PASS_POINTS, Math.round(passPoints / 1.5));
        } else if (avg < 1.35 * vsyncEst && passPoints < MAX_PASS_POINTS) {
          passPoints = Math.min(MAX_PASS_POINTS, Math.round(passPoints * 1.35));
        }
        window.renderStats = Object.assign(window.renderStats || {}, {
          passPointsTarget: passPoints,
          vsyncEst,
          lastAvgDt: avg,
        });
      }
    }

    if (
      isProgressiveMode &&
      currentPassCount < maxPasses &&
      totalPointsDrawn < POINT_BUDGET
    ) {
      progressiveAnimationId = requestAnimationFrame(animate);
    } else {
      progressiveAnimationId = null;
    }
  }

  animate();
}

/* ──────────────────────────────────────────────────────────────────────
   Scene update: float64 projection + culling + uniform/texture upload.
   Runs once per drawScene (i.e., whenever the view or the fractal
   changes), not per progressive pass.
   ────────────────────────────────────────────────────────────────────── */
function updateScene(quick) {
  const t0 = performance.now();
  const ar = canvas.width / canvas.height;
  vs.ox = ar >= 1 ? 1 / ar : 1;
  vs.oy = ar >= 1 ? 1 : ar;
  // handles.js builds `perspective` as scale(zoom)∘translate(pan), and
  // it's a plain (float64) array, so the view state reads back exactly
  vs.zoom = perspective[0] || 1;
  vs.panX = perspective[12] / vs.zoom;
  vs.panY = perspective[13] / (perspective[5] || 1);

  // exported picking matrix for handles.js (mutated in place)
  if (ar >= 1) {
    mat4.ortho(orthoTmp, -ar, ar, -1, 1, -1, 1);
  } else {
    mat4.ortho(orthoTmp, -1, 1, -1 / ar, 1 / ar, -1, 1);
  }
  mat4.multiply(projectionMatrix, orthoTmp, perspective);

  const halfX = 1 / (vs.ox * vs.zoom);
  const halfY = 1 / (vs.oy * vs.zoom);
  currentViewBox = {
    xMin: -vs.panX - halfX,
    xMax: -vs.panX + halfX,
    yMin: -vs.panY - halfY,
    yMax: -vs.panY + halfY,
  };
  window.currentViewBox = currentViewBox;
  const pixelWorld = (2 * halfX) / canvas.width;

  const m = transforms.length;
  if (m === 0) {
    scene.count = 0;
    return;
  }

  const affs = mapAffines(transforms);
  const colors = transforms.map((t) => t.color);
  const kernel = buildKernel(transforms, transition_matrix);
  const bound = attractorBound(affs);

  let leaves = buildPrefixLeaves({
    rootQuad: bound.quad,
    viewBox: currentViewBox,
    affs,
    colors,
    kernel,
    leafBudget: quick ? LEAF_BUDGET_QUICK : LEAF_BUDGET_FULL,
    pixelWorld,
  });
  if (leaves.length === 0) {
    // viewport misses the attractor entirely: draw it all through the
    // identity prefix (every point lands off-screen, which is correct)
    leaves = [
      {
        aff: [1, 0, 0, 0, 1, 0],
        w: 1,
        inner: -1,
        color: [0, 0, 0, 0],
        size: 2 * bound.r,
        R: 64,
        quad: bound.quad,
        depth: 0,
      },
    ];
  }

  // ── upload per-prefix texture rows (projected matrix, R, inner, color)
  const n = leaves.length;
  prefixTexels.fill(0);
  for (let p = 0; p < n; p++) {
    const L = leaves[p];
    const A = L.aff;
    // F = projection ∘ prefix, composed in f64 with the translation
    // gathered before scaling: zoom * (t + pan) keeps full precision
    // at extreme zoom instead of cancelling two huge numbers
    const o = ((p >> 9) * TEX_W + (p & 511) * 4) * 4;
    prefixTexels[o + 0] = vs.ox * vs.zoom * A[0];
    prefixTexels[o + 1] = vs.ox * vs.zoom * A[1];
    prefixTexels[o + 2] = vs.ox * vs.zoom * (A[2] + vs.panX);
    prefixTexels[o + 3] = quick ? Math.min(L.R, 24) : L.R;
    prefixTexels[o + 4] = vs.oy * vs.zoom * A[3];
    prefixTexels[o + 5] = vs.oy * vs.zoom * A[4];
    prefixTexels[o + 6] = vs.oy * vs.zoom * (A[5] + vs.panY);
    prefixTexels[o + 7] = L.inner + 1;
    prefixTexels[o + 8] = L.color[0];
    prefixTexels[o + 9] = L.color[1];
    prefixTexels[o + 10] = L.color[2];
    prefixTexels[o + 11] = L.color[3];
  }
  gl.bindTexture(gl.TEXTURE_2D, prefixTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, 2, gl.RGBA, gl.FLOAT, prefixTexels);
  gl.bindTexture(gl.TEXTURE_2D, null);

  // ── point-allocation weights
  scene.count = n;
  scene.leaves = leaves;
  scene.wLum = leaves.map((l) => l.w);

  // opaque mode fills pixels rather than sampling measure: weight each
  // cell by its on-screen footprint (visible extent ^ fractal dimension)
  const dim = similarityDimension(affs);
  const vb = currentViewBox;
  let wSum = 0;
  const wOpq = leaves.map((L) => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const [x, y] of L.quad) {
      xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
    }
    const w = Math.max(0, Math.min(xMax, vb.xMax) - Math.max(xMin, vb.xMin));
    const h = Math.max(0, Math.min(yMax, vb.yMax) - Math.max(yMin, vb.yMin));
    const eff = Math.max(Math.sqrt(w * h), pixelWorld);
    return Math.pow(eff, dim);
  });
  wOpq.forEach((w) => (wSum += w));
  scene.wOpq = wSum > 0 ? wOpq.map((w) => w / wSum) : leaves.map(() => 1 / n);

  // ── per-scene uniforms
  gl.useProgram(program);
  gl.uniform1i(loc.numPrefixes, n);
  gl.uniform1f(loc.numMaps, m);
  mapsAffBuf.fill(0);
  colorsBuf.fill(0);
  for (let i = 0; i < 10; i++) {
    const A = i < m ? affs[i] : [1, 0, 0, 0, 1, 0];
    mapsAffBuf.set([A[0], A[1], A[2], 0, A[3], A[4], A[5], 0], i * 8);
    colorsBuf.set(i < m ? colors[i] : [1, 1, 1, 1], i * 4);
  }
  gl.uniform4fv(loc.mapsAff, mapsAffBuf);
  gl.uniform4fv(loc.colors, colorsBuf);
  gl.uniform4fv(loc.alias, kernel.aliasPacked);

  // debug + perf introspection
  window.prefixLeaves = leaves;
  window.__ifs = { affs, kernel, bound, viewBox: currentViewBox, pixelWorld };
  const viewSize = Math.max(2 * halfX, 2 * halfY);
  window.renderStats = Object.assign(window.renderStats || {}, {
    leaves: n,
    treeMs: performance.now() - t0,
    maxCellOverView: Math.max(...leaves.map((l) => l.size)) / viewSize,
    maxDepth: Math.max(...leaves.map((l) => l.depth)),
    maxR: Math.max(...leaves.map((l) => l.R)),
    zoom: vs.zoom,
  });

  rebuildOverlayBuffers(leaves);
}

function worldToNdc(x, y) {
  return [vs.ox * vs.zoom * (x + vs.panX), vs.oy * vs.zoom * (y + vs.panY)];
}

// Debug overlay buffers (NDC space, so they stay exact at deep zoom)
function rebuildOverlayBuffers(leaves) {
  if (!overlayEnabled || !currentViewBox) {
    viewBoxVerts = treeBoxVerts = 0;
    return;
  }

  // (a) view window: the NDC unit square
  const e = 0.998;
  const viewVertices = new Float32Array([
    -e, -e, e, -e, e, -e, e, e, e, e, -e, e, -e, e, -e, -e,
  ]);
  viewBoxVerts = 8;
  gl.bindBuffer(gl.ARRAY_BUFFER, viewBoxVBO);
  gl.bufferData(gl.ARRAY_BUFFER, viewVertices, gl.STATIC_DRAW);

  // (b) leaf cells
  const verts = [];
  for (const L of leaves) {
    const q = L.quad.map(([x, y]) => worldToNdc(x, y));
    verts.push(
      q[0][0], q[0][1], q[1][0], q[1][1],
      q[1][0], q[1][1], q[2][0], q[2][1],
      q[2][0], q[2][1], q[3][0], q[3][1],
      q[3][0], q[3][1], q[0][0], q[0][1]
    );
  }
  treeBoxVerts = verts.length / 2;
  gl.bindBuffer(gl.ARRAY_BUFFER, treeBoxVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function renderSinglePass(quick, shouldClear) {
  const luminous = renderMode === "luminous" && luminousSupported;

  if (scene.count === 0) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    return;
  }

  if (!luminous && shouldClear) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  gl.useProgram(program);

  // stratified point allocation across prefixes with randomized rounding:
  // E[count] = weight * N exactly, so luminous brightness stays unbiased
  // and no cell is starved no matter how small its weight
  const N = quick
    ? QUICK_MAX_POINTS
    : luminous
      ? luminousPassPoints
      : passPoints;
  const weights = luminous ? scene.wLum : scene.wOpq;
  let total = 0;
  for (let p = 0; p < scene.count; p++) {
    cumTexels[p * 4] = total;
    total += Math.floor(weights[p] * N + Math.random());
  }
  if (total === 0) total = 1;

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, prefixTex);
  gl.texSubImage2D(
    gl.TEXTURE_2D, 0, 0, 2, scene.count, 1,
    gl.RGBA, gl.FLOAT, cumTexels.subarray(0, scene.count * 4)
  );
  gl.uniform1i(loc.prefixTex, 1);
  gl.uniform1ui(loc.pass, currentPassCount >>> 0);
  gl.uniform1f(loc.pointSize, quick ? QUICK_POINT_SIZE : POINT_SIZE);

  if (luminous) {
    ensureAccumBuffers();
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumFBO);
    if (shouldClear || accumNeedsClear) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.clearColor(0, 0, 0, 1);
      accumNeedsClear = false;
    }
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  }

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.POINTS, 0, total);
  totalPointsDrawn += total;
  window.renderStats = Object.assign(window.renderStats || {}, {
    passes: currentPassCount + 1,
    pointsPerPass: total,
    totalPoints: totalPointsDrawn,
  });

  if (luminous) {
    gl.disable(gl.BLEND);
    const passes = currentPassCount + 1;
    if (passes <= 2 || passes - lastExposurePass >= 10) {
      updateExposure(passes);
    }
    // tone-mapped display pass: screen = 1 - exp(-exposure * sum/passes)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(displayProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accumTex);
    gl.uniform1i(gl.getUniformLocation(displayProg, "uAccum"), 0);
    gl.uniform1f(gl.getUniformLocation(displayProg, "uInvPasses"), 1 / passes);
    gl.uniform1f(gl.getUniformLocation(displayProg, "uExposure"), exposure);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }

  // ───── debug overlays ─────
  if (overlayEnabled && viewBoxVerts + treeBoxVerts > 0) {
    gl.useProgram(bboxProg);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);

    if (treeBoxVerts > 0) {
      gl.uniform4fv(bboxColorLoc, [0.0, 1.0, 1.0, 0.8]);
      gl.bindBuffer(gl.ARRAY_BUFFER, treeBoxVBO);
      gl.enableVertexAttribArray(bboxPosLoc);
      gl.vertexAttribPointer(bboxPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, treeBoxVerts);
    }
    if (viewBoxVerts > 0) {
      gl.uniform4fv(bboxColorLoc, [1.0, 1.0, 0.0, 1.0]);
      gl.bindBuffer(gl.ARRAY_BUFFER, viewBoxVBO);
      gl.enableVertexAttribArray(bboxPosLoc);
      gl.vertexAttribPointer(bboxPosLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, viewBoxVerts);
    }
    gl.disableVertexAttribArray(bboxPosLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.enable(gl.DEPTH_TEST);
  }

  gl.bindVertexArray(null);
}

function resizeCanvas() {
  // Panels overlay the canvas, so it always fills the window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  gl.viewport(0, 0, canvas.width, canvas.height);

  isProgressiveMode = false;
  if (progressiveAnimationId !== null) {
    cancelAnimationFrame(progressiveAnimationId);
    progressiveAnimationId = null;
  }

  currentPassCount = 0;
  drawScene(false);
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

export {
  drawScene,
  projectionMatrix,
  resizeCanvas,
  setRenderMode,
  getRenderMode,
  luminousSupported,
};
