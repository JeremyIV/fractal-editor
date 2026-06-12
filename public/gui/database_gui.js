import {
  save_fractal,
  load_fractal,
  list_fractals,
  set_favorite,
  delete_fractal,
  getCurrentFractalId,
  setCurrentFractal,
} from "../database.js";
import { toast } from "./toast.js";
import { tutorialEvent } from "./tutorial.js";
import { generateRandomFractal } from "../random_fractal.js";

const panel = document.getElementById("database-gui");
const openButton = document.getElementById("database-menu-toggle");
const fractalListContainer = document.getElementById("fractal-list");
const searchInput = document.getElementById("fractal-search");

let currentSort = "popular";
let cachedFractals = [];

// The panel overlays the canvas, so opening/closing it never resizes the scene
function openDatabaseToolbar() {
  panel.classList.add("open");
  openButton.style.display = "none";
  tutorialEvent("fractals");
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

  if (fractal.mine) {
    // two-step inline confirm: click turns the button into "Delete?" for 3s
    const delButton = document.createElement("button");
    delButton.className = "del-btn";
    delButton.title = "Delete (you created this)";
    delButton.textContent = "🗑";
    let confirmTimer = null;
    delButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!delButton.classList.contains("confirm")) {
        delButton.classList.add("confirm");
        delButton.textContent = "Delete?";
        confirmTimer = setTimeout(() => {
          delButton.classList.remove("confirm");
          delButton.textContent = "🗑";
        }, 3000);
        return;
      }
      clearTimeout(confirmTimer);
      delButton.disabled = true;
      try {
        await delete_fractal(fractal._id);
        cachedFractals = cachedFractals.filter((f) => f._id !== fractal._id);
        if (getCurrentFractalId() === fractal._id) {
          setCurrentFractal(null);
        }
        renderFractalList();
        toast(`Deleted "${fractal.name}"`);
      } catch (error) {
        delButton.disabled = false;
        toast(`Failed to delete: ${error.message}`, "error");
      }
    });
    fractalItem.appendChild(delButton);
  }

  fractalItem.addEventListener("click", async () => {
    try {
      fractalItem.style.opacity = "0.5";
      await load_fractal(fractal._id);
      fractalItem.style.opacity = "1";
      toast(`Loaded "${fractal.name}"`, "success");
      if (fractal.mine) {
        // prefill so tweak-and-save updates this fractal by default
        document.getElementById("fractal-name").value = fractal.name;
      }
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

  const query = searchInput.value.trim().toLowerCase();
  const visible = query
    ? cachedFractals.filter((f) => f.name.toLowerCase().includes(query))
    : cachedFractals;

  if (visible.length === 0) {
    const msg = document.createElement("div");
    msg.className = "list-message";
    msg.textContent = `No fractals match "${searchInput.value.trim()}"`;
    fractalListContainer.appendChild(msg);
    return;
  }

  const favorites = visible.filter((f) => f.favorited);
  if (favorites.length > 0) {
    appendSection("Your favorites", favorites);
  }
  appendSection("All fractals", visible);
}

async function loadFractalList() {
  try {
    fractalListContainer.innerHTML =
      '<div class="list-message">Loading fractals...</div>';
    cachedFractals = await list_fractals(currentSort);
    renderFractalList();
  } catch (error) {
    fractalListContainer.innerHTML = '<div class="list-message error"></div>';
    fractalListContainer.firstChild.textContent = `Error loading fractals: ${error.message}`;
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

    const result = await save_fractal(name);

    loadFractalList();
    toast(result.updated ? `Updated "${name}"` : `Saved "${name}"`, "success");
  } catch (error) {
    toast(`Failed to save fractal: ${error.message}`, "error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save";
  }
}

// Live name search over the already-fetched list
searchInput.addEventListener("input", renderFractalList);

// Random fractal generation
document
  .getElementById("random-fractal-btn")
  .addEventListener("click", () => {
    generateRandomFractal();
    toast("Generated a random fractal 🎲", "success");
  });

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

// Copy a shareable link to the currently loaded/saved fractal
document.getElementById("copy-link-btn").addEventListener("click", async () => {
  const id = getCurrentFractalId();
  if (!id) {
    toast("Save or load a fractal first to get a link", "error");
    return;
  }
  const link = `${location.origin}/?f=${id}`;
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied 🔗", "success");
  } catch {
    // clipboard API unavailable: fall back to the legacy path
    const ta = document.createElement("textarea");
    ta.value = link;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Link copied 🔗", "success");
  }
});

// Deep link: ?f=<id> loads that fractal on page open
const sharedId = new URLSearchParams(location.search).get("f");
if (sharedId) {
  load_fractal(sharedId)
    .then((fractal) => toast(`Loaded "${fractal.name}"`, "success"))
    .catch(() => {
      toast("Couldn't load the linked fractal", "error");
      setCurrentFractal(null);
    });
}
