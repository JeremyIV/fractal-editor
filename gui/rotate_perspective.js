import { perspective } from "../transforms.js";
import { drawScene } from "../renderer.js";
import { repositionHandles } from "./handles.js";

const canvas = document.getElementById("glCanvas");
const toggleRotateBtn = document.getElementById("toggle-rotate");
let isRotating = false;
let lastMouseX = 0,
  lastMouseY = 0;

// Function to update the 'perspective' matrix
function updateRotation(dx, dy) {
  // Convert dx, dy to rotation angles
  const angleX = dy * 0.01; // Scale factor for rotation sensitivity
  const angleY = dx * 0.01;

  // Update the 'perspective' matrix with new rotations
  mat4.rotate(perspective, perspective, angleX, [1, 0, 0]); // Rotate around X axis
  mat4.rotate(perspective, perspective, angleY, [0, 1, 0]); // Rotate around Y axis

  // Redraw the scene with the updated matrix
  drawScene(true); // Implement this function to redraw your scene
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
