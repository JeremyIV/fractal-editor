import { transforms, perspective } from "../transforms.js";
import { drawScene, projectionMatrix } from "../renderer.js";
import { reRenderTransformForms } from "./transforms_form.js";

const canvas = document.getElementById("glCanvas");

const MAX_CLICK_DURATION = 200;

let selectedTransformIndex = null;
let dragging = false;
let oldRotationDegrees = null;
let oldRotationAxis = null;
let oldScalingValue = null;
let clickStartDistance = null;
let clickStartAngle = null;
let clickStartTime = null;

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
function onMouseDown(e) {
  if (e.preventDefault !== undefined) {
    e.preventDefault();
  }
  if (e.target.className === "control-handle") {
    const transformIndex = e.target.getAttribute("data-transform-index");
    if (transformIndex !== null) {
      selectedTransformIndex = transformIndex;
      // TODO: make the selected transform appear different
      dragging = true;
    }
    return;
  }
  if (selectedTransformIndex === null) {
    return;
  }
  const transform = transforms[selectedTransformIndex];
  const originCoords = to_canvas_coords(transform.origin);
  const originX = originCoords[0];
  const originY = originCoords[1];
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  clickStartDistance = getDistance(originX, originY, mouseX, mouseY);
  clickStartAngle = getAngle(originX, originY, mouseX, mouseY);
  oldRotationDegrees = transform.degrees_rotation;
  oldRotationAxis = transform.rotation_axis;
  oldScalingValue = [transform.x_scale, transform.y_scale, transform.z_scale];
  clickStartTime = new Date().getTime();
}

function getRotationMatrix(angle, axis) {
  let radians = (angle * Math.PI) / 180; // Convert angle to radians
  let rotationMatrix = mat3.create(); // Create a new identity mat3

  // Normalize the axis of rotation
  let normalizedAxis = vec3.create();
  vec3.normalize(normalizedAxis, vec3.fromValues(...axis));

  // Calculate the rotation matrix
  // Note: mat3 does not have a direct fromRotation, so we adapt from mat4's approach
  mat3.fromRotation(rotationMatrix, radians, normalizedAxis);

  return rotationMatrix;
}

function getRotationAngleAndAxis(rotationMatrix) {
  // Convert the glMatrix mat3 to a format suitable for numeric.js
  let matrixForNumeric = [
    Array.from(rotationMatrix.subarray(0, 3)),
    Array.from(rotationMatrix.subarray(3, 6)),
    Array.from(rotationMatrix.subarray(6, 9)),
  ];

  // Perform eigenvalue decomposition with numeric.js
  let evd = numeric.eig(matrixForNumeric);
  let eigenvalues = evd.lambda.x; // Real parts of the eigenvalues
  let eigenvectors = evd.E.x; // Real parts of the eigenvectors

  // Find an eigenvalue close to 1 and its corresponding eigenvector
  let index = eigenvalues.findIndex((val) => Math.abs(val - 1) < 0.001);
  if (index === -1) {
    throw new Error("No valid rotation axis found.");
  }
  let rotationAxis = eigenvectors.map((vec) => vec[index]);

  // Assuming the rotation matrix is proper and orthogonally normalized,
  // the angle can be directly calculated from the trace method
  let trace =
    matrixForNumeric[0][0] + matrixForNumeric[1][1] + matrixForNumeric[2][2];

  let angle = Math.acos((trace - 1) / 2);
  angle = angle * (180 / Math.PI); // Convert to degrees

  return { angle: angle, axis: rotationAxis };
}

function getViewAxis(projectionMatrix) {
  // Extract the first three rows and columns to form a 3x3 matrix
  let mat3x3 = [
    [projectionMatrix[0], projectionMatrix[1], projectionMatrix[2]],
    [projectionMatrix[4], projectionMatrix[5], projectionMatrix[6]],
    [projectionMatrix[8], projectionMatrix[9], projectionMatrix[10]],
  ];

  // The goal vector [0, 0, 1] is on the right side of the equation
  let goal = [0, 0, 1];

  // Solve the linear system mat3x3 * x = goal for x
  // This can be done via various methods; here, we assume a solver function is available
  let viewAxis = numeric.solve(mat3x3, goal);

  return viewAxis;
}

function onMouseMove(e) {
  if (e.preventDefault !== undefined) {
    e.preventDefault();
  }
  if (selectedTransformIndex === null) {
    return;
  }
  const transform = transforms[selectedTransformIndex];
  const originCoords = to_canvas_coords(transform.origin);
  const originX = originCoords[0];
  const originY = originCoords[1];

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  if (dragging) {
    const webgl_coords = update_old_coord(transform.origin, [mouseX, mouseY]);
    transform.origin = webgl_coords;
    repositionHandles();
    drawScene(true);
  } else if (clickStartTime !== null) {
    // SCALING
    const distance = getDistance(originX, originY, mouseX, mouseY);
    const distance_ratio = distance / clickStartDistance;

    transform.x_scale = oldScalingValue[0] * distance_ratio;
    transform.y_scale = oldScalingValue[1] * distance_ratio;
    transform.z_scale = oldScalingValue[2] * distance_ratio;

    // ROTATION
    // Assuming getAngle and getViewAxis are provided
    // And assuming projectionMatrix is available and correctly set up
    const angle = getAngle(originX, originY, mouseX, mouseY) - clickStartAngle;
    console.log(angle);
    const angleRadians = angle * (Math.PI / 180);
    const axis = getViewAxis(perspective); // Ensure this returns a vec3 or similar structure
    // Create quaternions for the delta rotation and the old rotation
    let delta_rotation_quaternion = quat.create();
    quat.setAxisAngle(delta_rotation_quaternion, axis, angleRadians); // Set delta rotation based on axis and angle
    console.log(delta_rotation_quaternion);
    let old_rotation_quaternion = quat.create();
    console.log(oldRotationAxis, oldRotationDegrees);
    quat.setAxisAngle(
      old_rotation_quaternion,
      oldRotationAxis,
      oldRotationDegrees * (Math.PI / 180)
    ); // Convert degrees to radians
    console.log(old_rotation_quaternion);
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

    console.log({
      angle: transform.degrees_rotation,
      axis: transform.rotation_axis,
    });

    drawScene(true);
  }
}
function onMouseUp(e) {
  if (e.preventDefault !== undefined) {
    e.preventDefault();
  }
  if (selectedTransformIndex === null) {
    return;
  }
  if (dragging) {
    dragging = false;
    return;
  }
  const current_time = new Date().getTime();
  const click_duration = current_time - clickStartTime;
  if (click_duration < MAX_CLICK_DURATION) {
    // clicked somewhere in space. This should deselect the
    // selected transform without applying any modifications to it.

    const transform = transforms[selectedTransformIndex];

    transform.rotation_axis = oldRotationAxis;
    transform.degrees_rotation = oldRotationDegrees;
    transform.x_scale = oldScalingValue[0];
    transform.y_scale_scale = oldScalingValue[1];
    transform.z_scale = oldScalingValue[2];

    selectedTransformIndex = null;
    dragging = false;
    oldRotationDegrees = null;
    oldRotationAxis = null;
    oldScalingValue = null;
    clickStartDistance = null;
    clickStartAngle = null;
    clickStartTime = null;
  } else {
    oldRotationDegrees = null;
    oldRotationAxis = null;
    oldScalingValue = null;
    clickStartDistance = null;
    clickStartAngle = null;
    clickStartTime = null;
  }
  drawScene();
}

function removeWidgets() {
  let existingWidgets = document.querySelectorAll(".rotation-widget");
  existingWidgets.forEach((widget) => widget.remove());
  existingWidgets = document.querySelectorAll(".scaling-widget");
  existingWidgets.forEach((widget) => widget.remove());
}

document.addEventListener("mousedown", onMouseDown);
document.addEventListener("mouseup", onMouseUp);
document.addEventListener("mousemove", onMouseMove);

function convertTouchEvent(event) {
  // Prevent default to stop mobile browsers from handling touch events as mouse events/scrolling
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

document.addEventListener(
  "touchstart",
  function (event) {
    onMouseDown(convertTouchEvent(event));
  },
  { passive: false }
);

document.addEventListener(
  "touchend",
  function (event) {
    onMouseUp(convertTouchEvent(event));
  },
  { passive: false }
);

document.addEventListener(
  "touchmove",
  function (event) {
    onMouseMove(convertTouchEvent(event));
  },
  { passive: false }
);

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

// function onScalingMouseDown(e) {
//   e.preventDefault();
//   if (scaling) {
//     // Reset scaling state
//     scaling = false;
//     scalingReferenceDist = null;
//     // Optional: Update scaling widget appearance to indicate it's not active
//   } else {
//     // Set scaling state
//     scaling = true;
//     const transform = transforms[selectedTransformIndex];
//     const handleCoords = to_canvas_coords(transform.origin);
//     scalingReferenceDist = Math.hypot(
//       e.clientX - handleCoords[0],
//       e.clientY - handleCoords[1]
//     );
//     oldScalingValue = [transform.x_scale, transform.y_scale];
//     // Optional: Update scaling widget appearance to indicate it's active

//     e.stopPropagation(); // Prevent further event propagation
//   }
// }

// function onMouseMove(e) {
//   // Calculate new mouse position

//   // What all needs to happen on mouse move?
//   // if a transform is being dragged, drag it
//   if (rotating && selectedTransformIndex !== null) {
//     // Get the selected transform's origin
//     let origin = transforms[selectedTransformIndex].origin;
//     let originHandleCoords = to_canvas_coords(origin);

//     // Calculate vector from origin to mouse coordinates
//     const dx = mouseX - originHandleCoords[0];
//     const dy = mouseY - originHandleCoords[1];

//     // Calculate the angle in degrees
//     const angle =
//       Math.atan2(-dx, -dy) * (180 / Math.PI) - rotationReferenceAngle;

//     // Set the transform's rotation to this new value
//     transforms[selectedTransformIndex].degrees_rotation =
//       oldRotationValue + angle;
//     drawScene(true);
//   } else if (
//     scaling &&
//     selectedTransformIndex !== null &&
//     scalingReferenceDist !== null
//   ) {
//     // Scaling logic
//     const transform = transforms[selectedTransformIndex];
//     const handleCoords = to_canvas_coords(transform.origin);
//     const currentDist = Math.hypot(
//       e.clientX - handleCoords[0],
//       e.clientY - handleCoords[1]
//     );
//     const scalingFactor = currentDist / scalingReferenceDist;

//     transform.x_scale = oldScalingValue[0] * scalingFactor;
//     transform.y_scale = oldScalingValue[1] * scalingFactor;

//     drawScene(true);
//   } else if (draggedTransformIndex) {
//     // Move the handle
//     let handle = document.getElementById("handle-" + draggedTransformIndex);
//     handle.style.left = `${mouseX - 6}px`;
//     handle.style.top = `${mouseY - 6}px`;

//     // Move the transform origin
//     // let webgl_coords = to_webgl_coords([mouseX, mouseY]);
//     let draggedTransform = transforms[draggedTransformIndex];
//     let webgl_coords = update_old_coord(draggedTransform.origin, [
//       mouseX,
//       mouseY,
//     ]);
//     draggedTransform.origin = webgl_coords;
//     drawScene(true);
//   }
//   // Redraw the scene
// }

// function selectTransform(transformIndex) {
//   selectedTransformIndex = transformIndex;

//   // delete old rotation widget
//   removeWidgets();

//   // Create a rotation widget
//   let rotationWidget = document.createElement("div");
//   rotationWidget.className = "rotation-widget";
//   rotationWidget.style.position = "absolute";
//   rotationWidget.style.color = "white";
//   rotationWidget.textContent = "↻"; // Unicode symbol for rotation

//   rotationWidget.style.cursor = "pointer";

//   // Position the widget 10px above the handle
//   let handleCoords = to_canvas_coords(transforms[transformIndex].origin);
//   //rotationWidget.style.left = `${handleCoords[0]}px`;
//   //rotationWidget.style.top = `${handleCoords[1] - 20}px`;
//   rotationWidget.style.left = "0px"; // Adjust as needed
//   rotationWidget.style.top = "-20px"; // Position above the handle
//   rotationWidget.style.backgroundColor = "black";
//   rotationWidget.style.borderRadius = 10;

//   // Add event listener for rotation
//   rotationWidget.addEventListener("mousedown", function (e) {
//     e.preventDefault();
//     rotating = true;
//     oldRotationValue = transforms[transformIndex].degrees_rotation;
//     let origin = transforms[transformIndex].origin;
//     let originHandleCoords = to_canvas_coords(origin);

//     // Calculate vector from origin to mouse coordinates
//     const rect = canvas.getBoundingClientRect();
//     const mouseX = e.clientX - rect.left;
//     const mouseY = e.clientY - rect.top;

//     const dx = mouseX - originHandleCoords[0];
//     const dy = mouseY - originHandleCoords[1];

//     // Calculate the angle in degrees
//     rotationReferenceAngle = Math.atan2(-dx, -dy) * (180 / Math.PI);

//     e.stopPropagation(); // Prevent further event propagation
//   });

//   let handle = document.getElementById("handle-" + transformIndex);

//   handle.appendChild(rotationWidget);

//   let scalingWidget = document.createElement("div");
//   scalingWidget.className = "scaling-widget";
//   scalingWidget.style.position = "absolute";
//   scalingWidget.style.color = "white";
//   scalingWidget.style.backgroundColor = "black";
//   scalingWidget.style.borderRadius = 10;
//   scalingWidget.textContent = "⇲"; // Unicode symbol for scaling

//   scalingWidget.style.cursor = "pointer";

//   // Position the widget 10px below the handle
//   scalingWidget.style.left = "0px"; // Relative to the handle
//   scalingWidget.style.top = "20px"; // Position below the handle

//   // Add event listener for scaling
//   scalingWidget.addEventListener("mousedown", onScalingMouseDown);
//   handle.appendChild(scalingWidget);
// }
// function onMouseUp(e) {
//   if (selectedTransformIndex !== null) {
//     reRenderTransformForms();
//   }
//   draggedTransformIndex = null;
//   rotating = false;
//   oldRotationValue = null;
//   scaling = false;
//   scalingReferenceDist = null;
//   oldScalingValue = null;
//   drawScene();
// }

// function onMouseDown(e) {
//   if (e.target.className === "control-handle") {
//     e.preventDefault();
//     const transformIndex = e.target.getAttribute("data-transform-index");
//     if (transformIndex !== null) {
//       draggedTransformIndex = transformIndex;
//       if (selectedTransformIndex !== transformIndex) {
//         selectTransform(transformIndex);
//       }
//     }
//   } else {
//     // delete old rotation widget
//     removeWidgets();
//     selectedTransformIndex = null;
//   }
// }
