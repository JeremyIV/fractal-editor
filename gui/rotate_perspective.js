// import { perspective } from "../transforms.js";
// import { drawScene } from "../renderer.js";
// import { repositionHandles } from "./handles.js";

// const canvas = document.getElementById("glCanvas");
// const toggleRotateBtn = document.getElementById("toggle-rotate");
// let isRotating = true;

// // Mouse down event
// canvas.addEventListener("mousedown", (e) => {
//   if (isRotating) {
//     lastMouseX = e.clientX;
//     lastMouseY = e.clientY;
//     canvas.addEventListener("mousemove", onMouseMove);
//   }
// });

// // Mouse move event
// function onMouseMove(e) {
//   console.log("made it here!?!?!?")
//   const dx = e.clientX - lastMouseX;
//   const dy = e.clientY - lastMouseY;
//   updateRotation(dx, dy);
//   lastMouseX = e.clientX;
//   lastMouseY = e.clientY;
// }

// // Mouse up event
// document.addEventListener("mouseup", (e) => {
//   canvas.removeEventListener("mousemove", onMouseMove);
//   drawScene(); // Implement this function to redraw your scene
// });

// // Toggle button event
// toggleRotateBtn.addEventListener("click", () => {
//   isRotating = !isRotating;
//   toggleRotateBtn.textContent = isRotating ? "Disable Rotate" : "Enable Rotate";
// });
