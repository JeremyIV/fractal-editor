import { transforms, transition_matrix } from "../transforms.js";
import { drawScene } from "../renderer.js";

function refreshTransitionMatrixUI() {
  const existingGui = document.getElementById("transition-matrix-gui");
  if (!existingGui) {
    return; // UI is not currently open, nothing to refresh
  }

  // Check if the matrix size has changed - if so, recreate the entire UI
  const currentCheckboxes = existingGui.querySelectorAll("input[type='checkbox']");
  const expectedSize = transition_matrix.length * transition_matrix.length;
  
  if (currentCheckboxes.length !== expectedSize) {
    // Size mismatch - close and recreate the UI
    existingGui.remove();
    // Don't automatically reopen - let user click the button if they want to see it
    return;
  }

  // Size matches - just update checkbox states
  const size = transition_matrix.length;
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      currentCheckboxes[i * size + j].checked = transition_matrix[i][j];
    }
  }
}

function updateTransitionMatrix(e) {
  const checkboxes = document.querySelectorAll(
    "#transition-matrix-gui input[type='checkbox']"
  );
  const size = Math.sqrt(checkboxes.length);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      // Update the existing matrix's values instead of reassigning the variable
      transition_matrix[i][j] = checkboxes[i * size + j].checked;
    }
  }
  console.log(transition_matrix);
  drawScene();
}

document
  .getElementById("transition-matrix")
  .addEventListener("click", function () {
    console.log("foo");
    const existingGui = document.getElementById("transition-matrix-gui");
    if (!existingGui) {
      console.log("bar");
      const guiDiv = document.createElement("div");
      guiDiv.id = "transition-matrix-gui";
      guiDiv.style.position = "absolute";
      guiDiv.style.right = "20px";
      guiDiv.style.bottom = "20px";
      guiDiv.style.border = "1px solid black";
      guiDiv.style.padding = "10px";
      guiDiv.style.paddingTop = "30px"; // Increased padding at the top
      guiDiv.style.backgroundColor = "white";
      guiDiv.style.zIndex = 2;

      const size = transition_matrix.length;
      const table = document.createElement("table");
      for (let i = 0; i < size; i++) {
        const tr = document.createElement("tr");
        for (let j = 0; j < size; j++) {
          const td = document.createElement("td");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = transition_matrix[i][j];
          checkbox.addEventListener("change", updateTransitionMatrix);
          td.appendChild(checkbox);
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      guiDiv.appendChild(table);

      const closeButton = document.createElement("button");
      closeButton.textContent = "X";
      closeButton.style.position = "absolute";
      closeButton.style.top = "5px";
      closeButton.style.right = "5px";
      closeButton.onclick = function () {
        guiDiv.remove();
      };
      guiDiv.appendChild(closeButton);

      document.body.appendChild(guiDiv);
    }

    drawScene();
  });

export { refreshTransitionMatrixUI };
