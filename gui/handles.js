import { transforms } from "../transforms.js";
import { drawScene, projectionMatrix } from "../renderer.js";
import { reRenderTransformForms } from "./transforms_form.js";

const canvas = document.getElementById("glCanvas");

let draggedTransformIndex = null;

let selectedTransformIndex = null;
let rotating = false;
let rotationReferenceAngle = null;
let oldRotationValue = null;
let scaling = false;
let oldScalingValue = null;
let scalingReferenceDist = null;

function onScalingMouseDown(e) {
  e.preventDefault();
  if (scaling) {
    // Reset scaling state
    scaling = false;
    scalingReferenceDist = null;
    // Optional: Update scaling widget appearance to indicate it's not active
  } else {
    // Set scaling state
    scaling = true;
    const transform = transforms[selectedTransformIndex];
    const handleCoords = to_canvas_coords(transform.origin);
    scalingReferenceDist = Math.hypot(
      e.clientX - handleCoords[0],
      e.clientY - handleCoords[1]
    );
    oldScalingValue = [transform.x_scale, transform.y_scale];
    // Optional: Update scaling widget appearance to indicate it's active

    e.stopPropagation(); // Prevent further event propagation
  }
}

function removeWidgets() {
  let existingWidgets = document.querySelectorAll(".rotation-widget");
  existingWidgets.forEach((widget) => widget.remove());
  existingWidgets = document.querySelectorAll(".scaling-widget");
  existingWidgets.forEach((widget) => widget.remove());
}

function selectTransform(transformIndex) {
  selectedTransformIndex = transformIndex;

  // delete old rotation widget
  removeWidgets();

  // Create a rotation widget
  let rotationWidget = document.createElement("div");
  rotationWidget.className = "rotation-widget";
  rotationWidget.style.position = "absolute";
  rotationWidget.style.color = "white";
  rotationWidget.textContent = "↻"; // Unicode symbol for rotation

  rotationWidget.style.cursor = "pointer";

  // Position the widget 10px above the handle
  let handleCoords = to_canvas_coords(transforms[transformIndex].origin);
  //rotationWidget.style.left = `${handleCoords[0]}px`;
  //rotationWidget.style.top = `${handleCoords[1] - 20}px`;
  rotationWidget.style.left = "0px"; // Adjust as needed
  rotationWidget.style.top = "-20px"; // Position above the handle
  rotationWidget.style.backgroundColor = "black";
  rotationWidget.style.borderRadius = 10;

  // Add event listener for rotation
  rotationWidget.addEventListener("mousedown", function (e) {
    e.preventDefault();
    rotating = true;
    oldRotationValue = transforms[transformIndex].degrees_rotation;
    let origin = transforms[transformIndex].origin;
    let originHandleCoords = to_canvas_coords(origin);

    // Calculate vector from origin to mouse coordinates
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dx = mouseX - originHandleCoords[0];
    const dy = mouseY - originHandleCoords[1];

    // Calculate the angle in degrees
    rotationReferenceAngle = Math.atan2(-dx, -dy) * (180 / Math.PI);

    e.stopPropagation(); // Prevent further event propagation
  });

  let handle = document.getElementById("handle-" + transformIndex);

  handle.appendChild(rotationWidget);

  let scalingWidget = document.createElement("div");
  scalingWidget.className = "scaling-widget";
  scalingWidget.style.position = "absolute";
  scalingWidget.style.color = "white";
  scalingWidget.style.backgroundColor = "black";
  scalingWidget.style.borderRadius = 10;
  scalingWidget.textContent = "⇲"; // Unicode symbol for scaling

  scalingWidget.style.cursor = "pointer";

  // Position the widget 10px below the handle
  scalingWidget.style.left = "0px"; // Relative to the handle
  scalingWidget.style.top = "20px"; // Position below the handle

  // Add event listener for scaling
  scalingWidget.addEventListener("mousedown", onScalingMouseDown);
  handle.appendChild(scalingWidget);
}

function onMouseDown(e) {
  if (e.target.className === "control-handle") {
    e.preventDefault();
    const transformIndex = e.target.getAttribute("data-transform-index");
    if (transformIndex !== null) {
      draggedTransformIndex = transformIndex;
      if (selectedTransformIndex !== transformIndex) {
        selectTransform(transformIndex);
      }
    }
  } else {
    // delete old rotation widget
    removeWidgets();
    selectedTransformIndex = null;
  }
}

function onMouseUp(e) {
  if (selectedTransformIndex !== null) {
    reRenderTransformForms();
  }
  draggedTransformIndex = null;
  rotating = false;
  oldRotationValue = null;
  scaling = false;
  scalingReferenceDist = null;
  oldScalingValue = null;
  drawScene();
}

function onMouseMove(e) {
  // Calculate new mouse position
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // What all needs to happen on mouse move?
  // if a transform is being dragged, drag it
  if (rotating && selectedTransformIndex !== null) {
    // Get the selected transform's origin
    let origin = transforms[selectedTransformIndex].origin;
    let originHandleCoords = to_canvas_coords(origin);

    // Calculate vector from origin to mouse coordinates
    const dx = mouseX - originHandleCoords[0];
    const dy = mouseY - originHandleCoords[1];

    // Calculate the angle in degrees
    const angle =
      Math.atan2(-dx, -dy) * (180 / Math.PI) - rotationReferenceAngle;

    // Set the transform's rotation to this new value
    transforms[selectedTransformIndex].degrees_rotation =
      oldRotationValue + angle;
    drawScene(true);
  } else if (
    scaling &&
    selectedTransformIndex !== null &&
    scalingReferenceDist !== null
  ) {
    // Scaling logic
    const transform = transforms[selectedTransformIndex];
    const handleCoords = to_canvas_coords(transform.origin);
    const currentDist = Math.hypot(
      e.clientX - handleCoords[0],
      e.clientY - handleCoords[1]
    );
    const scalingFactor = currentDist / scalingReferenceDist;

    transform.x_scale = oldScalingValue[0] * scalingFactor;
    transform.y_scale = oldScalingValue[1] * scalingFactor;

    drawScene(true);
  } else if (draggedTransformIndex) {
    // Move the handle
    let handle = document.getElementById("handle-" + draggedTransformIndex);
    handle.style.left = `${mouseX - 6}px`;
    handle.style.top = `${mouseY - 6}px`;

    // Move the transform origin
    // let webgl_coords = to_webgl_coords([mouseX, mouseY]);
    let draggedTransform = transforms[draggedTransformIndex];
    let webgl_coords = update_old_coord(draggedTransform.origin, [
      mouseX,
      mouseY,
    ]);
    draggedTransform.origin = webgl_coords;
    drawScene(true);
  }
  // Redraw the scene
}

document.addEventListener("mousedown", onMouseDown);
document.addEventListener("mouseup", onMouseUp);
document.addEventListener("mousemove", onMouseMove);

// TODO: actually use the projection matrix here

function to_canvas_coords(webGL_coords) {
  // Create a 4D vector from the 3D coordinates for matrix multiplication
  let coords4D = [webGL_coords[0], webGL_coords[1], webGL_coords[2], 1.0];
  vec4.transformMat4(coords4D, coords4D, projectionMatrix);

  // Normalize the coordinates (homogeneous division)
  coords4D = coords4D.map((v) => v / coords4D[3]);

  // Convert to canvas coordinates
  const canvasX = canvas.width / 2 + (canvas.width / 4) * coords4D[0];
  const canvasY = canvas.height / 2 - (canvas.height / 4) * coords4D[1];

  return [canvasX, canvasY];
}

function update_old_coord(old_coords, canvas_coords) {
  // Convert canvas coordinates back to normalized device coordinates
  const surfaceX = (canvas_coords[0] - canvas.width / 2) / (canvas.width / 4);
  const surfaceY =
    (canvas_coords[1] - canvas.height / 2) / (-canvas.height / 4);

  // Apply the projection matrix to the old coordinates
  let projectedCoords = [old_coords[0], old_coords[1], old_coords[2], 1.0];
  vec4.transformMat4(projectedCoords, projectedCoords, projectionMatrix);

  // Normalize the coordinates (homogeneous division)
  projectedCoords = projectedCoords.map((v) => v / projectedCoords[3]);

  // Update the x and y values
  projectedCoords[0] = surfaceX;
  projectedCoords[1] = surfaceY;

  // Now apply the inverse projection to get back to 3D space
  let inverseProjectionMatrix = mat4.create();
  mat4.invert(inverseProjectionMatrix, projectionMatrix);
  let updatedCoords = [];
  vec4.transformMat4(updatedCoords, projectedCoords, inverseProjectionMatrix);

  // Discard the w component and return the updated coordinates
  return updatedCoords.slice(0, 3);
}

function getHandleColorCode(color) {
  // Convert each color component from a float to an integer and clamp between 0 and 255
  const r = Math.round(255 * Math.min(Math.max(color[0], 0), 1));
  const g = Math.round(255 * Math.min(Math.max(color[1], 0), 1));
  const b = Math.round(255 * Math.min(Math.max(color[2], 0), 1));

  // Convert each component to a two-digit hexadecimal string
  const toHex = (component) => component.toString(16).padStart(2, "0");

  // Combine into a single color string
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function createHandles() {
  transforms.forEach((t, index) => {
    // Check if the handle already exists
    let handle = document.getElementById("handle-" + index);

    // Create and append the handle only if it doesn't exist
    if (!handle) {
      handle = document.createElement("div");
      handle.className = "control-handle";
      handle.style.position = "absolute";

      let handle_coords = to_canvas_coords(t.origin);

      let handle_left = handle_coords[0] - 7;
      let handle_top = handle_coords[1] - 7;

      handle.style.left = `${handle_left}px`;
      handle.style.top = `${handle_top}px`;
      handle.style.width = "10px";
      handle.style.height = "10px";
      handle.style.borderRadius = "10px";
      handle.style.backgroundColor = getHandleColorCode(t.color);
      handle.style.border = "2px solid black"; // Adjust the size as needed

      handle.id = "handle-" + index; // Use index to create a unique ID
      handle.setAttribute("data-transform-index", index); // Set data attribute

      document.body.appendChild(handle);
    }
  });
}

createHandles();

function repositionHandles() {
  transforms.forEach((transform, index) => {
    // Recalculate handle coordinates
    let handleCoords = to_canvas_coords(transform.origin);

    // Find the handle element
    let handle = document.getElementById("handle-" + index);
    if (handle) {
      // Update the handle position
      handle.style.left = `${handleCoords[0] - 7}px`;
      handle.style.top = `${handleCoords[1] - 7}px`;
      handle.style.backgroundColor = getHandleColorCode(transform.color);
    }
  });
}
window.addEventListener("resize", repositionHandles);

export { createHandles, repositionHandles };
