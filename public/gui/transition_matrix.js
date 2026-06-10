import { transforms, transition_matrix } from "../transforms.js";
import { drawScene } from "../renderer.js";

function colorDot(index) {
  const dot = document.createElement("span");
  dot.className = "tm-dot";
  const c = transforms[index]?.color || [1, 1, 1, 1];
  dot.style.backgroundColor = `rgb(${Math.round(c[0] * 255)}, ${Math.round(
    c[1] * 255
  )}, ${Math.round(c[2] * 255)})`;
  dot.title = `Transform ${index + 1}`;
  return dot;
}

function updateTransitionMatrix() {
  const checkboxes = document.querySelectorAll(
    "#transition-matrix-gui input[type='checkbox']"
  );
  const size = transition_matrix.length;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      transition_matrix[i][j] = checkboxes[i * size + j].checked;
    }
  }
  drawScene();
}

function buildMatrixGui() {
  const guiDiv = document.createElement("div");
  guiDiv.id = "transition-matrix-gui";

  const title = document.createElement("div");
  title.className = "tm-title";
  title.textContent = "Transition Matrix";
  guiDiv.appendChild(title);

  const size = transition_matrix.length;
  const table = document.createElement("table");

  // Header row: which transform each column may transition *to*
  const headerRow = document.createElement("tr");
  headerRow.appendChild(document.createElement("th")); // corner
  for (let j = 0; j < size; j++) {
    const th = document.createElement("th");
    th.appendChild(colorDot(j));
    headerRow.appendChild(th);
  }
  table.appendChild(headerRow);

  for (let i = 0; i < size; i++) {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("th");
    rowHeader.appendChild(colorDot(i));
    tr.appendChild(rowHeader);
    for (let j = 0; j < size; j++) {
      const td = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = transition_matrix[i][j];
      checkbox.title = `Allow transform ${i + 1} → ${j + 1}`;
      checkbox.addEventListener("change", updateTransitionMatrix);
      td.appendChild(checkbox);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  guiDiv.appendChild(table);

  const closeButton = document.createElement("button");
  closeButton.className = "tm-close";
  closeButton.textContent = "×";
  closeButton.onclick = () => guiDiv.remove();
  guiDiv.appendChild(closeButton);

  document.body.appendChild(guiDiv);
}

// Rebuild the popup (if open) so it tracks transform add/remove/recolor
function refreshTransitionMatrixUI() {
  const existingGui = document.getElementById("transition-matrix-gui");
  if (!existingGui) {
    return;
  }
  existingGui.remove();
  buildMatrixGui();
}

document
  .getElementById("transition-matrix")
  .addEventListener("click", function () {
    const existingGui = document.getElementById("transition-matrix-gui");
    if (existingGui) {
      existingGui.remove(); // toggle closed
    } else {
      buildMatrixGui();
    }
  });

export { refreshTransitionMatrixUI };
