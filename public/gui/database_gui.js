import { save_fractal, load_fractal, list_fractals } from "../database.js";
import { toast } from "./toast.js";

const panel = document.getElementById("database-gui");
const openButton = document.getElementById("database-menu-toggle");

// The panel overlays the canvas, so opening/closing it never resizes the scene
function openDatabaseToolbar() {
  panel.classList.add("open");
  openButton.style.display = "none";
  loadFractalList();
}

function closeDatabaseToolbar() {
  panel.classList.remove("open");
  openButton.style.display = "";
}

// Load and display fractal list
async function loadFractalList() {
  const fractalListContainer = document.getElementById("fractal-list");

  try {
    fractalListContainer.innerHTML =
      '<div class="list-message">Loading fractals...</div>';

    const fractals = await list_fractals();

    if (fractals.length === 0) {
      fractalListContainer.innerHTML =
        '<div class="list-message">No fractals saved yet</div>';
      return;
    }

    fractalListContainer.innerHTML = "";

    fractals.forEach((fractal) => {
      const fractalItem = document.createElement("div");
      fractalItem.className = "fractal-item";
      fractalItem.dataset.fractalId = fractal._id;

      const nameDiv = document.createElement("div");
      nameDiv.className = "fractal-name";
      nameDiv.textContent = fractal.name;

      const dateDiv = document.createElement("div");
      dateDiv.className = "fractal-date";
      dateDiv.textContent = new Date(fractal.created_at).toLocaleString();

      fractalItem.appendChild(nameDiv);
      fractalItem.appendChild(dateDiv);

      fractalItem.addEventListener("click", async () => {
        try {
          fractalItem.style.opacity = "0.5";
          await load_fractal(fractal._id);
          fractalItem.style.opacity = "1";
          toast(`Loaded "${fractal.name}"`, "success");
        } catch (error) {
          fractalItem.style.opacity = "1";
          toast(`Failed to load fractal: ${error.message}`, "error");
        }
      });

      fractalListContainer.appendChild(fractalItem);
    });
  } catch (error) {
    fractalListContainer.innerHTML = `<div class="list-message error">Error loading fractals: ${error.message}</div>`;
  }
}

// Save fractal functionality
async function saveFractal() {
  const nameInput = document.getElementById("fractal-name");
  const saveButton = document.getElementById("save-fractal-btn");
  const name = nameInput.value.trim();

  if (!name) {
    toast("Please enter a fractal name", "error");
    nameInput.focus();
    return;
  }

  try {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    await save_fractal(name);

    nameInput.value = "";
    loadFractalList();
    toast(`Saved "${name}"`, "success");
  } catch (error) {
    toast(`Failed to save fractal: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save";
  }
}

// Event listeners
openButton.addEventListener("click", openDatabaseToolbar);
document
  .getElementById("closeDatabaseToolbar")
  .addEventListener("click", closeDatabaseToolbar);
document.getElementById("save-fractal-btn").addEventListener("click", saveFractal);

// Allow Enter key to save
document.getElementById("fractal-name").addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    saveFractal();
  }
});
