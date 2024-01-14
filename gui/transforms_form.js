import { createHandles, repositionHandles } from "./handles.js";
import { drawScene } from "../renderer.js";
import { transforms } from "../transforms.js";
// Assuming the transforms array is imported or globally accessible
// import { transforms } from "./your_transforms_module.js"; // Uncomment if needed

const transformGuiContainer = document.getElementById("transform-gui");
const transformFormsContainer = document.getElementById("transform-forms");

function updateTransform(index, property, value) {
  if (property === "origin") {
    transforms[index][property] = value;
  } else if (property === "color") {
    transforms[index].color = value;
  } else {
    transforms[index][property] = parseFloat(value);
  }
  // Redraw the scene with new transform values
  repositionHandles();
  drawScene();
}

function createTransformForm(index) {
  const transform = transforms[index];
  const colorHex = rgbaToHex(transform.color);
  const alphaValue = transform.color[3];

  const form = document.createElement("div");
  form.className = "transform-form";
  form.id = `transform-form-${index}`;
  form.innerHTML = `
      <div class="form-row">
        <label>Color <input type="color" value="${colorHex}" data-index="${index}" data-property="color"></label>
        <label>Alpha <input type="range" min="0" max="1" step="0.01" value="${alphaValue}" data-index="${index}" data-property="color_A"></label>
      </div>
      <div class="form-row">
        <label>Origin X <input type="number" value="${transform.origin[0]}" data-index="${index}" data-property="origin_x"></label>
        <label>Y <input type="number" value="${transform.origin[1]}" data-index="${index}" data-property="origin_y"></label>
      </div>
      <div class="form-row">
        <label>Scale X <input type="number" value="${transform.x_scale}" data-index="${index}" data-property="x_scale"></label>
        <label>Y <input type="number" value="${transform.y_scale}" data-index="${index}" data-property="y_scale"></label>
      </div>
      <div class="form-row">
        <label>Rotation <input type="number" value="${transform.degrees_rotation}" data-index="${index}" data-property="degrees_rotation"></label>
      </div>
      <button class="close-btn" onclick="removeTransform(${index})">X</button>
    `;

  Array.from(form.querySelectorAll("input")).forEach((input) => {
    input.addEventListener("input", (event) => {
      const { index, property } = event.target.dataset;
      handleInputChange(index, property, event.target.value);
    });
  });

  transformFormsContainer.appendChild(form);
}

function handleInputChange(index, property, value) {
  if (property === "color") {
    const rgbaColor = hexToRgba(event.target.value);
    rgbaColor.push(transforms[index].color[3]); // Keep existing alpha
    updateTransform(index, property, rgbaColor);
  } else if (property === "color_A") {
    const newAlpha = parseFloat(event.target.value);
    updateTransform(index, "color", [
      ...transforms[index].color.slice(0, 3),
      newAlpha,
    ]);
  } else if (property === "origin_x" || property === "origin_y") {
    // Handle origin change
    const newOrigin = [...transforms[index].origin];
    newOrigin[property === "origin_x" ? 0 : 1] = parseFloat(value);
    updateTransform(index, "origin", newOrigin);
  } else {
    // Handle other changes
    updateTransform(index, property, value);
  }
}

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

function removeTransform(index) {
  transforms.splice(index, 1);
  document.getElementById(`transform-form-${index}`).remove();
  // Update the form IDs and re-render the forms to reflect the updated indexes
  reRenderTransformForms();
  repositionHandles();
  drawScene();
}

function addTransform() {
  const newTransform = {
    origin: [0, 0],
    degrees_rotation: 0,
    x_scale: 0.5,
    y_scale: 0.5,
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
