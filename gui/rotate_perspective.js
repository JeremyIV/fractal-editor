import { perspective } from "../transforms.js";
import { drawScene } from "../renderer.js";
import { repositionHandles } from "./handles.js";

const canvas = document.getElementById("glCanvas");
const toggleRotateBtn = document.getElementById("toggle-rotate");
let isRotating = false;
let lastMouseX = 0,
  lastMouseY = 0;

// Function to update the 'perspective' matrix
let theta = 0; // Azimuthal angle
let phi = 0; // Polar angle

function updateRotation(dx, dy) {
  // Update theta and phi based on dx and dy
  // Adjust these scaling factors as needed for sensitivity
  const thetaScale = 0.01;
  const phiScale = 0.01;

  theta += dx * thetaScale;
  phi -= dy * phiScale; // Inverting dy to match the screen's coordinate system

  // Clamp phi to prevent the camera from flipping over
  // This restricts the elevation angle to be between -90 and 90 degrees
  phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, phi));

  // Reset the perspective matrix
  mat4.identity(perspective);

  // First, rotate around the Y axis (theta)
  mat4.rotate(perspective, perspective, theta, [0, 1, 0]);

  // Then, rotate around the X axis (phi)
  mat4.rotate(perspective, perspective, phi, [1, 0, 0]);

  // Redraw the scene with the updated matrix
  drawScene(true);
  repositionHandles();
}

// Mouse down event
canvas.addEventListener("mousedown", (e) => {
  if (isRotating) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvas.addEventListener("mousemove", onMouseMove);
  }
});

// Mouse move event
function onMouseMove(e) {
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  updateRotation(dx, dy);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

// Mouse up event
document.addEventListener("mouseup", (e) => {
  canvas.removeEventListener("mousemove", onMouseMove);
  drawScene(); // Implement this function to redraw your scene
});

// Toggle button event
toggleRotateBtn.addEventListener("click", () => {
  isRotating = !isRotating;
  toggleRotateBtn.textContent = isRotating ? "Disable Rotate" : "Enable Rotate";
});
