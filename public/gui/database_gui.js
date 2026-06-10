import {
  save_fractal,
  load_fractal,
  list_fractals,
  set_favorite,
} from "../database.js";
import { toast } from "./toast.js";

const panel = document.getElementById("database-gui");
const openButton = document.getElementById("database-menu-toggle");
const fractalListContainer = document.getElementById("fractal-list");

let currentSort = "popular";
let cachedFractals = [];

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

async function toggleFavorite(fractal, button) {
  button.disabled = true;
  try {
    const result = await set_favorite(fractal._id, !fractal.favorited);
    fractal.favorited = result.favorited;
    fractal.favorite_count = result.favorite_count;
    renderFractalList();
  } catch (error) {
    toast(`Failed to update favorite: ${error.message}`, "error");
    button.disabled = false;
  }
}

function createFractalItem(fractal) {
  const fractalItem = document.createElement("div");
  fractalItem.className = "fractal-item";

  const info = document.createElement("div");
  info.className = "fractal-info";

  const nameDiv = document.createElement("div");
  nameDiv.className = "fractal-name";
  nameDiv.textContent = fractal.name;

  const dateDiv = document.createElement("div");
  dateDiv.className = "fractal-date";
  dateDiv.textContent = new Date(fractal.created_at).toLocaleString();

  info.appendChild(nameDiv);
  info.appendChild(dateDiv);
  fractalItem.appendChild(info);

  const favButton = document.createElement("button");
  favButton.className = "fav-btn" + (fractal.favorited ? " favorited" : "");
  favButton.title = fractal.favorited ? "Unfavorite" : "Favorite";
  favButton.innerHTML = `♥ <span>${fractal.favorite_count || 0}</span>`;
  favButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(fractal, favButton);
  });
  fractalItem.appendChild(favButton);

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

  return fractalItem;
}

function appendSection(title, fractals) {
  const header = document.createElement("div");
  header.className = "list-subheader";
  header.textContent = title;
  fractalListContainer.appendChild(header);
  fractals.forEach((fractal) => {
    fractalListContainer.appendChild(createFractalItem(fractal));
  });
}

function renderFractalList() {
  // keep ordering correct after favorite toggles, without a refetch
  cachedFractals.sort((a, b) => {
    const byDate = new Date(b.created_at) - new Date(a.created_at);
    if (currentSort === "recent") return byDate;
    return b.favorite_count - a.favorite_count || byDate;
  });

  fractalListContainer.innerHTML = "";

  if (cachedFractals.length === 0) {
    fractalListContainer.innerHTML =
      '<div class="list-message">No fractals saved yet</div>';
    return;
  }

  const favorites = cachedFractals.filter((f) => f.favorited);
  if (favorites.length > 0) {
    appendSection("Your favorites", favorites);
  }
  appendSection("All fractals", cachedFractals);
}

async function loadFractalList() {
  try {
    fractalListContainer.innerHTML =
      '<div class="list-message">Loading fractals...</div>';
    cachedFractals = await list_fractals(currentSort);
    renderFractalList();
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

// Sort toggle
document.querySelectorAll("#sort-toggle button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.sort === currentSort) return;
    currentSort = button.dataset.sort;
    document
      .querySelectorAll("#sort-toggle button")
      .forEach((b) => b.classList.toggle("active", b === button));
    loadFractalList();
  });
});

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
