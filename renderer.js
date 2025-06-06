import { transforms, perspective, getAffineTransform3D } from "./transforms.js";
import { vertexShaderSource, fragmentShaderSource } from "./shaders.js";

let MAX_POINTS = 1_000_000;
let QUICK_MAX_POINTS = 100_000;

let POINT_SIZE = 1.0
let QUICK_POINT_SIZE = Math.sqrt(MAX_POINTS / QUICK_MAX_POINTS)

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2", { depth: true, preserveDrawingBuffer: true });
const SPHERE_RADIUS = 0.005;
const QUICK_SPHERE_RADIUS = Math.sqrt(
  (SPHERE_RADIUS * SPHERE_RADIUS * MAX_POINTS) / QUICK_MAX_POINTS
);

if (!gl) {
  alert("WebGL 2.0 not supported");
  throw new Error("WebGL 2.0 not supported");
}

// OPAQUE FRAGMENTS
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.clearDepth(1.0); // Clear everything

//gl.enable(gl.BLEND);
//gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

// ADDITIVE FRAGMENTS (glowing light effect)
//gl.depthMask(false);
//gl.enable(gl.BLEND);
//gl.blendFunc(gl.ONE, gl.ONE);

gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque

/////////////////////////
// WEBGL INITIALIZATION
/////////////////////////
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