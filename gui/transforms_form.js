import { createHandles, repositionHandles } from "./handles.js";
import { drawScene } from "../renderer.js";
import { transforms } from "../transforms.js";
// Assuming the transforms array is imported or globally accessible
// import { transforms } from "./your_transforms_module.js"; // Uncomment if needed

const transformGuiContainer = document.getElementById("transform-gui");
const transformFormsContainer = document.getElementById("transform-forms");

// Helper function to convert RGBA array to Hex color string
function rgbaToHex(rgba) {
  return (
    "#" +
    rgba
      .slice(0, 3)
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function hexToRgba(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b]; // Alpha will be added separately
}

function updateTransforms() {
  const allForms = document.querySelectorAll(".transform-form");
  allForms.forEach((form) => {
    const index = parseInt(form.dataset.index, 10);
    const transform = {
      origin: [
        parseFloat(form.querySelector('[data-property="origin_x"]').value),
        parseFloat(form.querySelector('[data-property="origin_y"]').value),
        parseFloat(form.querySelector('[data-property="origin_z"]').value),
      ],
      degrees_rotation: parseFloat(
        form.querySelector('[data-property="degrees_rotation"]').value
      ),
      rotation_axis: [
        parseFloat(
          form.querySelector('[data-property="rotation_axis_x"]').value
        ),
        parseFloat(
          form.querySelector('[data-property="rotation_axis_y"]').value
        ),
        parseFloat(
          form.querySelector('[data-property="rotation_axis_z"]').value
        ),
      ],
      x_scale: parseFloat(
        form.querySelector('[data-property="x_scale"]').value
      ),
      y_scale: parseFloat(
        form.querySelector('[data-property="y_scale"]').value
      ),
      z_scale: parseFloat(
        form.querySelector('[data-property="z_scale"]').value
      ),
      color: hexToRgba(form.querySelector('[data-property="color"]').value),
    };
    transform.color.push(
      parseFloat(form.querySelector('[data-property="color_A"]').value)
    );
    transforms[index] = transform;
  });

  // Redraw the scene with new transform values
  repositionHandles();
  drawScene();
}

function removeTransform(form) {
  const index = parseInt(form.getAttribute("data-index"), 10);
  form.remove();
  transforms.splice(index, 1);
  // Update the form IDs and re-render the forms to reflect the updated indexes
  const elements = document.getElementsByClassName("control-handle");
  while (elements.length > 0) {
    elements[0].remove();
  }
  reRenderTransformForms();
  createHandles();
  drawScene();
}

function createTransformForm(index) {
  const transform = transforms[index];
  const colorHex = rgbaToHex(transform.color);
  const alphaValue = transform.color[3];

  const form = document.createElement("div");
  form.className = "transform-form";
  form.dataset.index = index;
  form.innerHTML = `
    <div class="form-row">
      <label>Color <input type="color" value="${colorHex}" data-index="${index}" data-property="color"></label>
      <label>Alpha <input type="range" min="0" max="1" step="0.01" value="${alphaValue}" data-index="${index}" data-property="color_A"></label>
    </div>
    <div class="form-row">
      <label>Origin X <input type="number" value="${transform.origin[0]}" data-index="${index}" data-property="origin_x"></label>
      <label>Y <input type="number" value="${transform.origin[1]}" data-index="${index}" data-property="origin_y"></label>
      <label>Z <input type="number" value="${transform.origin[2]}" data-index="${index}" data-property="origin_z"></label>
    </div>
    <div class="form-row">
      <label>Scale X <input type="number" value="${transform.x_scale}" data-index="${index}" data-property="x_scale"></label>
      <label>Y <input type="number" value="${transform.y_scale}" data-index="${index}" data-property="y_scale"></label>
      <label>Z <input type="number" value="${transform.z_scale}" data-index="${index}" data-property="z_scale"></label>
    </div>
    <div class="form-row">
      <label>↺ <input type="number" value="${transform.degrees_rotation}" data-index="${index}" data-property="degrees_rotation"></label>
      <label>X <input type="number" value="${transform.rotation_axis[0]}" data-index="${index}" data-property="rotation_axis_x"></label>
      <label>Y <input type="number" value="${transform.rotation_axis[1]}" data-index="${index}" data-property="rotation_axis_y"></label>
      <label>Z <input type="number" value="${transform.rotation_axis[2]}" data-index="${index}" data-property="rotation_axis_z"></label>
    </div>
    <button class="close-btn">X</button>
  `;

  // Add event listeners for inputs
  Array.from(form.querySelectorAll("input")).forEach((input) => {
    input.addEventListener("input", updateTransforms);
  });

  form
    .querySelector(".close-btn")
    .addEventListener("click", (e) => removeTransform(form));

  transformFormsContainer.appendChild(form);
}

function addTransform() {
  const newTransform = {
    origin: [0, 0, 0],
    degrees_rotation: 0,
    rotation_axis: [0, 0, 1],
    x_scale: 0.5,
    y_scale: 0.5,
    z_scale: 0.5,
    color: [1, 1, 1, 0.5],
  };
  transforms.push(newTransform);

  // Add a new row and column of True values to the transition matrix.
  for (let i = 0; i < transforms.length - 1; i++) {
    transition_matrix[i].push(true);
  }

  let last_row = [];
  for (let i = 0; i < transforms.length; i++) {
    last_row.push(true);
  }

  transition_matrix.push(last_row);

  const existingGui = document.getElementById("transition-matrix-gui");
  if (existingGui) {
    existingGui.remove();
  }

  createTransformForm(transforms.length - 1);

  createHandles();
  drawScene();
}

function reRenderTransformForms() {
  transformFormsContainer.innerHTML = "";
  transforms.forEach((_, index) => createTransformForm(index));
}

// Initialization: Create forms for existing transforms
transforms.forEach((_, index) => createTransformForm(index));

document
  .getElementById("add-transform")
  .addEventListener("click", addTransform);

export { reRenderTransformForms };
