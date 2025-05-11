// import { perspective } from "../transforms.js";
// import { drawScene } from "../renderer.js";
// import { repositionHandles } from "./handles.js";

// const canvas = document.getElementById("glCanvas");
// let lastMouseX, lastMouseY;
// let panX = 0, panY = 0;

// // Mouse down event
// canvas.addEventListener("mousedown", (e) => {
//   lastMouseX = e.clientX;
//   lastMouseY = e.clientY;
//   canvas.addEventListener("mousemove", onMouseMove);
// });

// // Mouse move event
// function onMouseMove(e) {
//   const dx = e.clientX - lastMouseX;
//   const dy = e.clientY - lastMouseY;
//   updatePan(dx, dy);
//   lastMouseX = e.clientX;
//   lastMouseY = e.clientY;
// }

// // Update pan position
// function updatePan(dx, dy) {
//   // Scale the movement based on canvas size for more natural panning
//   const scaleFactor = 0.01;
  
//   // Update the pan position
//   panX += dx * scaleFactor;
//   panY -= dy * scaleFactor; // Invert Y for natural panning
  
//   // Reset perspective matrix to identity
//   //mat4.identity(perspective);
  
//   // Apply translation for panning using proper gl-matrix function
//   // mat4.translate(
//   //   perspective,
//   //   perspective,
//   //   vec3.fromValues(panX, panY, 0)
//   // );
  
//   // Redraw the scene with the updated perspective
//   drawScene();
  
//   // Reposition handles if they exist
//   if (typeof repositionHandles === "function") {
//     repositionHandles();
//   }
// }

// // Mouse up event
// document.addEventListener("mouseup", (e) => {
//   canvas.removeEventListener("mousemove", onMouseMove);
//   drawScene();
// });

// // Export functionality if needed
// export { updatePan };