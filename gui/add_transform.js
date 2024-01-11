import { transforms } from "../transforms.js";
import { drawScene } from "../renderer.js";
import { createHandles } from "./handles.js";

document.getElementById("addButton").addEventListener("click", function () {
  // Define a new transformation centered at the origin, with zero rotation, 0.5 scaling
  var newTransform = {
    origin: [0, 0],
    degrees_rotation: 0,
    x_scale: 0.5,
    y_scale: 0.5,
    color: [1, 1, 1, 0.5],
  };

  // Assuming you have a global list of transformations and colors
  transforms.push(newTransform);

  // Redraw the scene
  createHandles();
  drawScene();
});
