import { transforms, perspective } from "../transforms.js";
import { drawScene, projectionMatrix } from "../renderer.js";
import { reRenderTransformForms } from "./transforms_form.js";

const canvas = document.getElementById("glCanvas");

const MAX_CLICK_DURATION = 200;

let selectedTransformIndex = null;

function getDistance(x0, y0, x1, y1) {
  const dx = x0 - x1;
  const dy = y0 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function getAngle(x0, y0, x1, y1) {
  const dx = x0 - x1;
  const dy = y0 - y1;

  // Calculate the angle in degrees
  const angle = Math.atan2(-dx, -dy) * (180 / Math.PI);

  return angle;
}

// Simplified for 2D - just returns the vector unchanged
function rotateVec3(vector) {
  // In 2D mode, we don't need to rotate vectors in 3D space
  return vector;
}

function convertTouchEvent(event) {
  event.preventDefault();
  if (event.touches.length > 0) {
    // Use the first touch point for the event
    var touch = event.touches[0];
    // Mimic a mouse event based on the first touch point
    return {
      ...event,
      clientX: touch.clientX,
      clientY: touch.clientY,
      target: touch.target,
    };
  }
  return event;
}

// TODO
// pull out shared logic of click-drag pattern

function registerDragEvents(onMove, onUp) {
  // TODO:
  // onMove: takes in x,y coords of the move event
  // onUp is optional, and runs in addition to the standard onUp events

  function onMouseMove(e) {
    if (e.preventDefault !== undefined) {
      e.preventDefault();
    }
    const rect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement.getBoundingClientRect();
    // Calculate mouse position relative to canvas container (parent element)
    const x = e.clientX - parentRect.left;
    const y = e.clientY - parentRect.top;

    onMove(x, y);

    repositionHandles();
    reRenderTransformForms();
    drawScene(true);
  }

  function onTouchMove(e) {
    onMouseMove(convertTouchEvent(e));
  }
  function onMouseUp(e) {
    if (e.preventDefault !== undefined) {
      e.preventDefault();
    }
    if (onUp !== undefined) {
      onUp();
    }
    document.onmousemove = null;
    document.onmouseup = null;
    document.removeEventListener("touchmove", onTouchMove, { passive: false });
    document.removeEventListener("touchend", onTouchEnd, { passive: false });
    drawScene();
  }

  function onTouchEnd(e) {
    onMouseUp(convertTouchEvent(e));
  }

  document.onmousemove = onMouseMove;
  document.onmouseup = onMouseUp;
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd, { passive: false });
}

function handleMouseDown(e) {
  if (e.preventDefault !== undefined) {
    e.preventDefault();
  }

  const handles = document.querySelectorAll(".control-handle");
  handles.forEach((handle) => {
    handle.classList.remove("selected");
  });
  if (e.target.classList.contains("control-handle")) {
    e.target.classList.add("selected");
  }

  selectedTransformIndex = e.target.getAttribute("data-transform-index");
  const transform = transforms[selectedTransformIndex];

  function onMove(x, y) {
    const webgl_coords = update_old_coord(transform.origin, [x, y]);
    transform.origin = webgl_coords;
  }

  registerDragEvents(onMove);
}

// Panning and zooming state
let panX = 0;
let panY = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let zoomLevel = 1.0;

// Convert mouse movement to world-space movement, accounting for perspective and zoom
function getPanAmountForMouseMovement(dx, dy) {
  // Get the canvas dimensions for scaling
  const rect = canvas.getBoundingClientRect();
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  // Note: We're calculating the scale directly based on the viewport
  // This gives us a consistent panning behavior
  
  // Calculate the scale factor based on aspect ratio
  const aspectRatio = canvasWidth / canvasHeight;
  let scaleX, scaleY;
  
  if (canvasWidth > canvasHeight) {
    scaleX = 2 * aspectRatio / canvasWidth;
    scaleY = 2 / canvasHeight;
  } else {
    scaleX = 2 / canvasWidth;
    scaleY = 2 / aspectRatio / canvasHeight;
  }
  
  // Adjust the scale based on the current zoom level
  // Divide by zoomLevel to move less in world space when zoomed in
  scaleX = scaleX / zoomLevel;
  scaleY = scaleY / zoomLevel;
  
  // Calculate how much to move in world-space
  return {
    worldDx: dx * scaleX,
    worldDy: -dy * scaleY
  };
}

// Function to update the 'perspective' matrix (kept name for compatibility)
function updateRotation(dx, dy) {
  // Calculate world-space movement based on mouse movement
  const { worldDx, worldDy } = getPanAmountForMouseMovement(dx, dy);
  
  // Update pan position
  panX += worldDx;
  panY += worldDy;
  
  updatePerspectiveMatrix();
}

// Apply current zoom and pan to the perspective matrix
function updatePerspectiveMatrix() {
  // Reset the perspective matrix
  mat4.identity(perspective);
  
  // Apply zoom (scale) first
  mat4.scale(perspective, perspective, [zoomLevel, zoomLevel, 1]);
  
  // Then apply translation for panning
  mat4.translate(perspective, perspective, [panX, panY, 0]);
}

function canvasMouseDown(e) {
  if (e.preventDefault !== undefined) {
    e.preventDefault();
  }

  // If no transform is selected, pan the view
  if (selectedTransformIndex === null) {
    // Pan the viewport (previously "rotate the viewport")
    const rect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement.getBoundingClientRect();
    lastMouseX = e.clientX - parentRect.left;
    lastMouseY = e.clientY - parentRect.top;

    function onMove(x, y) {
      const dx = x - lastMouseX;
      const dy = y - lastMouseY;
      updateRotation(dx, dy);
      lastMouseX = x;
      lastMouseY = y;
    }
    registerDragEvents(onMove);
    return;
  }

  const transform = transforms[selectedTransformIndex];
  const originCoords = to_canvas_coords(transform.origin);
  const originX = originCoords[0];
  const originY = originCoords[1];
  const rect = canvas.getBoundingClientRect();
  const parentRect = canvas.parentElement.getBoundingClientRect();
  // Calculate mouse position relative to canvas container (parent element)
  const mouseX = e.clientX - parentRect.left;
  const mouseY = e.clientY - parentRect.top;
  const clickStartDistance = getDistance(originX, originY, mouseX, mouseY);
  const clickStartAngle = getAngle(originX, originY, mouseX, mouseY);
  const oldRotationDegrees = transform.degrees_rotation;
  const oldRotationAxis = transform.rotation_axis;
  const oldScalingValue = [
    transform.x_scale,
    transform.y_scale,
    transform.z_scale,
  ];
  const clickStartTime = new Date().getTime();

  function onMove(x, y) {
    // SCALING
    const distance = getDistance(originX, originY, x, y);
    const distance_ratio = distance / clickStartDistance;

    transform.x_scale = Math.min(oldScalingValue[0] * distance_ratio, 1);
    transform.y_scale = Math.min(oldScalingValue[1] * distance_ratio, 1);
    transform.z_scale = Math.min(oldScalingValue[2] * distance_ratio, 1);

    // ROTATION
    // Assuming getAngle and getViewAxis are provided
    // And assuming projectionMatrix is available and correctly set up
    const angle = getAngle(originX, originY, x, y) - clickStartAngle;
    const angleRadians = angle * (Math.PI / 180);
    const axis = vec3.fromValues(0, 0, 1); // Fixed Z-axis rotation for 2D mode
    // Create quaternions for the delta rotation and the old rotation
    let delta_rotation_quaternion = quat.create();
    quat.setAxisAngle(delta_rotation_quaternion, axis, angleRadians); // Set delta rotation based on axis and angle
    let old_rotation_quaternion = quat.create();
    quat.setAxisAngle(
      old_rotation_quaternion,
      oldRotationAxis,
      oldRotationDegrees * (Math.PI / 180)
    ); // Convert degrees to radians
    // Calculate the new rotation quaternion by multiplying the old rotation by the delta rotation
    let new_rotation_quaternion = quat.create();
    quat.multiply(
      new_rotation_quaternion,
      old_rotation_quaternion,
      delta_rotation_quaternion
    );

    // Normalize the new rotation quaternion to ensure it's valid for rotation
    quat.normalize(new_rotation_quaternion, new_rotation_quaternion);

    // Extract the angle and axis from the new rotation quaternion
    let new_axis = vec3.create();
    let new_angle_rads = quat.getAxisAngle(new_axis, new_rotation_quaternion);
    // quat.getAxisAngle returns the angle in radians, convert it back to degrees
    let new_angle = new_angle_rads * (180 / Math.PI);

    // Update the transform with the new rotation angle and axis
    transform.degrees_rotation = new_angle;
    transform.rotation_axis = Array.from(new_axis); // Convert vec3 to array if necessary
  }

  function onUp() {
    const current_time = new Date().getTime();
    const click_duration = current_time - clickStartTime;
    if (click_duration < MAX_CLICK_DURATION) {
      // quick click!
      selectedTransformIndex = null;
      const handles = document.querySelectorAll(".control-handle");
      handles.forEach((handle) => {
        handle.classList.remove("selected");
      });
    }
  }

  registerDragEvents(onMove, onUp);
}

// Zoom with mouse wheel
function handleMouseWheel(e) {
  e.preventDefault();
  
  // Get mouse position relative to canvas
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Convert mouse position to normalized device coordinates (NDC)
  const ndcX = (mouseX / canvas.width) * 2 - 1;
  const ndcY = -((mouseY / canvas.height) * 2 - 1); // Y is flipped in WebGL
  
  // Convert mouse position to world coordinates before zoom
  const worldX = ndcX / zoomLevel - panX;
  const worldY = ndcY / zoomLevel - panY;
  
  // Determine zoom direction and amount
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9; // Zoom in or out
  
  // Update zoom level with limits
  const oldZoomLevel = zoomLevel;
  zoomLevel = Math.max(0.1, Math.min(1000, zoomLevel * zoomFactor));
  
  // Calculate how much the world coordinates of the mouse point changed due to zooming
  const newWorldX = ndcX / zoomLevel - panX;
  const newWorldY = ndcY / zoomLevel - panY;
  
  // Adjust pan to keep the mouse over the same world point
  panX += (newWorldX - worldX);
  panY += (newWorldY - worldY);
  
  // Update the perspective matrix
  updatePerspectiveMatrix();
  
  // Redraw the scene
  drawScene();
  repositionHandles();
}

canvas.addEventListener("mousedown", canvasMouseDown);
canvas.addEventListener("wheel", handleMouseWheel, { passive: false });
canvas.addEventListener(
  "touchstart",
  function (event) {
    canvasMouseDown(convertTouchEvent(event));
  },
  { passive: false }
);

function to_canvas_coords(webGL_coords) {
  // Create a 4D vector from the 3D coordinates for matrix multiplication
  let coords4D = [webGL_coords[0], webGL_coords[1], webGL_coords[2], 1.0];
  vec4.transformMat4(coords4D, coords4D, projectionMatrix);

  // Normalize the coordinates (homogeneous division)
  coords4D = coords4D.map((v) => v / coords4D[3]);

  // Get canvas position relative to its parent
  const rect = canvas.getBoundingClientRect();
  const parentRect = canvas.parentElement.getBoundingClientRect();
  
  // Convert to canvas coordinates relative to canvas position
  const canvasX = (rect.left - parentRect.left) + canvas.width / 2 + (canvas.width / 2) * coords4D[0];
  const canvasY = (rect.top - parentRect.top) + canvas.height / 2 - (canvas.height / 2) * coords4D[1];

  return [canvasX, canvasY];
}

function update_old_coord(old_coords, canvas_coords) {
  // Get canvas position relative to its parent
  const rect = canvas.getBoundingClientRect();
  const parentRect = canvas.parentElement.getBoundingClientRect();
  
  // Adjust canvas coordinates to account for canvas position within parent
  const adjustedX = canvas_coords[0] - (rect.left - parentRect.left);
  const adjustedY = canvas_coords[1] - (rect.top - parentRect.top);
  
  // Convert canvas coordinates back to normalized device coordinates
  const surfaceX = (adjustedX - canvas.width / 2) / (canvas.width / 2);
  const surfaceY = (adjustedY - canvas.height / 2) / (-canvas.height / 2);

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

      let handle_left = handle_coords[0] - 10;
      let handle_top = handle_coords[1] - 10;

      handle.style.left = `${handle_left}px`;
      handle.style.top = `${handle_top}px`;
      //handle.style.width = "10px";
      //handle.style.height = "10px";
      //handle.style.borderRadius = "10px";
      handle.style.backgroundColor = getHandleColorCode(t.color);
      handle.style.border = "2px solid black"; // Adjust the size as needed

      handle.id = "handle-" + index; // Use index to create a unique ID
      handle.setAttribute("data-transform-index", index); // Set data attribute
      handle.addEventListener("mousedown", handleMouseDown);
      handle.addEventListener(
        "touchstart",
        function (event) {
          handleMouseDown(convertTouchEvent(event));
        },
        { passive: false }
      );

      // Append to canvas parent instead of body so it moves with the canvas
      canvas.parentElement.appendChild(handle);
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
      handle.style.left = `${handleCoords[0] - 10}px`;
      handle.style.top = `${handleCoords[1] - 10}px`;
      handle.style.backgroundColor = getHandleColorCode(transform.color);
    }
  });
}

function recreateHandles() {
  // Remove all existing handles
  const existingHandles = document.querySelectorAll(".control-handle");
  existingHandles.forEach(handle => handle.remove());
  
  // Clear selection
  selectedTransformIndex = null;
  
  // Create new handles for current transforms
  createHandles();
}
window.addEventListener("resize", repositionHandles);

export { createHandles, repositionHandles, recreateHandles };
