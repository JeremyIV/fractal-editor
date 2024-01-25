import { transforms, perspective } from "./transforms.js";
import { vertexShaderSource, fragmentShaderSource } from "./shaders.js";
import { getAffineTransform3D } from "./matrices.js";

const QUICK_MAX_TRIANGLES = 1_000_00;
const MAX_TRIANGLES = 1_000_000;

const TRI_SIZE = 0.002;
const QUICK_TRI_SIZE =
  TRI_SIZE * Math.sqrt(MAX_TRIANGLES / QUICK_MAX_TRIANGLES);

// quick_size^2 * QUICK_MAX_TRIANGLES = size^2 * MAX_TRIANGLES
// quick_size^2 = size^2 * MAX_TRIANGLES / QUICK_MAX_TRIANGLES
// quick_size = sqrt(size^2 * MAX_TRIANGLES / QUICK_MAX_TRIANGLES)
// quick_size = size * sqrt(MAX_TRIANGLES / QUICK_MAX_TRIANGLES)

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2", { depth: true });

if (!gl) {
  alert("WebGL 2.0 not supported");
  throw new Error("WebGL 2.0 not supported");
}

gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
gl.clearDepth(1.0); // Clear everything

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

let bufferedNumTriangles = 0;

let projectionMatrix = mat4.create();

function drawScene(quick) {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(program);

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

  // TRIANGLE AND INDEX BUFFERS

  if (quick === undefined) {
    quick = false;
  }
  //const max_trianges = quick ? QUICK_MAX_TRIANGLES : MAX_TRIANGLES;
  // const recursion_level = Math.floor(
  //   Math.log(max_trianges) / Math.log(transforms.length)
  // );
  //const recursion_level = 1;
  //const num_triangles = Math.pow(transforms.length, recursion_level); // Number of triangles
  const num_triangles = quick ? 100_000 : 1_000_000;
  const recursion_level = quick ? 20 : 100;
  // If the number of triangles has changed, update the buffer
  if (num_triangles != bufferedNumTriangles) {
    const vertexData = [];
    const indexData = [];
    for (let i = 0; i < num_triangles; i++) {
      // Vertices for each triangle
      const size = quick ? QUICK_TRI_SIZE : TRI_SIZE;
      vertexData.push(0.0, size, -size, -size, size, -size);

      // Index for each vertex of the triangle
      for (let j = 0; j < 3; j++) {
        indexData.push(i);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(vertexData),
      gl.STATIC_DRAW
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(indexData), gl.STATIC_DRAW);

    bufferedNumTriangles = num_triangles;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const indexLocation = gl.getAttribLocation(program, "aIndex");
  gl.enableVertexAttribArray(indexLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
  gl.vertexAttribPointer(indexLocation, 1, gl.FLOAT, false, 0, 0);

  const numTransforms = transforms.length;

  // Set the uNumTransforms uniform
  const numTransformsLoc = gl.getUniformLocation(program, "uNumTransforms");
  gl.uniform1f(numTransformsLoc, numTransforms);

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

  gl.uniform1f(gl.getUniformLocation(program, "uN"), num_triangles);
  gl.uniform1f(gl.getUniformLocation(program, "uR"), recursion_level);

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3 * num_triangles); // Draw N triangles
}

function resizeCanvas() {
  const guiWidth = document.getElementById("transform-gui").offsetWidth;
  canvas.width = window.innerWidth - guiWidth;
  canvas.height = window.innerHeight;

  gl.viewport(0, 0, canvas.width, canvas.height);

  // Redraw the scene
  drawScene(); // Make sure this function redraws your WebGL scene
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

export { drawScene, projectionMatrix };
