import { recreateHandles, repositionHandles } from "./handles.js";
import { drawScene } from "../renderer.js";
import { transforms, transition_matrix } from "../transforms.js";
import { refreshTransitionMatrixUI } from "./transition_matrix.js";
import { commitHistory, commitHistorySoon } from "../history.js";

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
  commitHistorySoon(); // coalesce a typing/slider burst into one undo step
}

function removeTransform(form) {
  const index = parseInt(form.getAttribute("data-index"), 10);
  transforms.splice(index, 1);

  // Drop the transform's row and column from the transition matrix
  transition_matrix.splice(index, 1);
  transition_matrix.forEach((row) => row.splice(index, 1));

  reRenderTransformForms();
  recreateHandles();
  refreshTransitionMatrixUI();
  drawScene();
  commitHistory();
}

function numberField(label, value, index, property, step) {
  return `
    <div class="tf-field">
      <span>${label}</span>
      <input type="number" step="${step}" value="${value}" data-index="${index}" data-property="${property}">
    </div>`;
}

function createTransformForm(index) {
  const transform = transforms[index];
  const colorHex = rgbaToHex(transform.color);
  const alphaValue = transform.color[3];

  const form = document.createElement("div");
  form.className = "transform-form";
  form.dataset.index = index;
  form.innerHTML = `
    <div class="tf-header">
      <input type="color" value="${colorHex}" data-index="${index}" data-property="color" title="Color">
      <label class="tf-alpha">Alpha
        <input type="range" min="0" max="1" step="0.01" value="${alphaValue}" data-index="${index}" data-property="color_A">
      </label>
    </div>
    <div class="tf-grid">
      <div class="tf-row">
        <span class="tf-row-label">Origin</span>
        ${numberField("X", transform.origin[0], index, "origin_x", 0.1)}
        ${numberField("Y", transform.origin[1], index, "origin_y", 0.1)}
        ${numberField("Z", transform.origin[2], index, "origin_z", 0.1)}
      </div>
      <div class="tf-row">
        <span class="tf-row-label">Scale</span>
        ${numberField("X", transform.x_scale, index, "x_scale", 0.05)}
        ${numberField("Y", transform.y_scale, index, "y_scale", 0.05)}
        ${numberField("Z", transform.z_scale, index, "z_scale", 0.05)}
      </div>
      <div class="tf-row tf-row-4">
        <span class="tf-row-label">Rotate</span>
        ${numberField("Deg", transform.degrees_rotation, index, "degrees_rotation", 5)}
        ${numberField("X", transform.rotation_axis[0], index, "rotation_axis_x", 0.1)}
        ${numberField("Y", transform.rotation_axis[1], index, "rotation_axis_y", 0.1)}
        ${numberField("Z", transform.rotation_axis[2], index, "rotation_axis_z", 0.1)}
      </div>
    </div>
    <button class="close-btn" title="Remove transform">×</button>
  `;

  // Add event listeners for inputs
  Array.from(form.querySelectorAll("input")).forEach((input) => {
    input.addEventListener("input", updateTransforms);
  });

  form
    .querySelector(".close-btn")
    .addEventListener("click", () => removeTransform(form));

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

  // Add a new row and column of True values to the transition matrix
  transition_matrix.forEach((row) => row.push(true));
  transition_matrix.push(new Array(transforms.length).fill(true));

  createTransformForm(transforms.length - 1);
  recreateHandles();
  refreshTransitionMatrixUI();
  drawScene();
  commitHistory();
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
