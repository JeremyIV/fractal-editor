import { transforms } from "../transforms.js";
import { drawScene } from "../renderer.js";
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
    const handleCoords = to_handle_coords(transform.origin);
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
  let handleCoords = to_handle_coords(transforms[transformIndex].origin);
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
    let originHandleCoords = to_handle_coords(origin);

    // Calculate vector from origin to mouse coordinates
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dx = mouseX - originHandleCoords[0];
    const dy = mouseY - originHandleCoords[1];

    // Calculate the angle in degrees
    rotationReferenceAngle = Math.atan2(-dx, -dy) * (180 / Math.PI);
    console.log(rotationReferenceAngle);

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
    let originHandleCoords = to_handle_coords(origin);

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
    const handleCoords = to_handle_coords(transform.origin);
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
    let webgl_coords = to_webgl_coords([mouseX, mouseY]);
    let draggedTransform = transforms[draggedTransformIndex];
    draggedTransform.origin = webgl_coords;
    drawScene(true);
  }
  // Redraw the scene
}

document.addEventListener("mousedown", onMouseDown);
document.addEventListener("mouseup", onMouseUp);
document.addEventListener("mousemove", onMouseMove);

// TODO: actually use the projection matrix here

function to_webgl_coords(x) {
  const aspectRatio = canvas.width / canvas.height;

  // Convert WebGL coordinates to canvas space
  let xCoord, yCoord;
  if (canvas.width >= canvas.height) {
    xCoord = ((x[0] - canvas.width / 2) * 4 * aspectRatio) / canvas.width;
    yCoord = ((canvas.height / 2 - x[1]) * 4) / canvas.height;
  } else {
    xCoord = ((x[0] - canvas.width / 2) * 4) / canvas.width;
    yCoord = ((canvas.height / 2 - x[1]) * 4) / aspectRatio / canvas.height;
  }

  return [xCoord, yCoord];
}
function to_handle_coords(x) {
  // TODO: the +6 here is just to center the handles.
  // this is the wrong place for this janky magic number to live.
  // have it more obviously associated with the handle positions.
  // Get aspect ratio
  const aspectRatio = canvas.width / canvas.height;

  // Convert WebGL coordinates to canvas space
  let xCoord, yCoord;
  if (canvas.width >= canvas.height) {
    (xCoord = canvas.width / 2 + (x[0] * canvas.width) / aspectRatio / 4 - 6),
      (yCoord = canvas.height / 2 - (x[1] * canvas.height) / 4 - 6);
  } else {
    xCoord = canvas.width / 2 + (x[0] * canvas.width) / 4 - 6;
    yCoord = canvas.height / 2 - (x[1] * canvas.height * aspectRatio) / 4 - 6;
  }

  return [xCoord, yCoord];
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

      let handle_coords = to_handle_coords(t.origin);

      let handle_left = handle_coords[0];
      let handle_top = handle_coords[1];

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
    let handleCoords = to_handle_coords(transform.origin);

    // Find the handle element
    let handle = document.getElementById("handle-" + index);
    if (handle) {
      // Update the handle position
      handle.style.left = `${handleCoords[0]}px`;
      handle.style.top = `${handleCoords[1]}px`;
      handle.style.backgroundColor = getHandleColorCode(transform.color);
    }
  });
}
window.addEventListener("resize", repositionHandles);

export { createHandles, repositionHandles };
