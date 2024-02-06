import { resizeCanvas } from "../renderer.js";
import { repositionHandles } from "./handles.js";

const canvas = document.getElementById("glCanvas");

function openToolbar() {
  document.getElementById("transform-gui").style.width = "300px";
  canvas.style.marginRight = "300px";
  canvas.width = canvas.width - 300;
  document.getElementById("menu-toggle").style.display = "none";
  resizeCanvas();
  repositionHandles();
}

document.getElementById("menu-toggle").onclick = openToolbar;

function closeToolbar() {
  const rect = canvas.getBoundingClientRect();

  console.log("Closing toolbar!!");
  document.getElementById("transform-gui").style.width = "0";
  canvas.style.marginRight = "0";
  canvas.width = canvas.width + 300;
  document.getElementById("menu-toggle").style.display = "";
  resizeCanvas();
  repositionHandles();
}
document.getElementById("closeToolbar").onclick = closeToolbar;
