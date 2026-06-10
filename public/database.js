// Database functions for loading and saving fractals
import { transforms, transition_matrix } from "./transforms.js";
import { drawScene, getRenderMode } from "./renderer.js";
import { recreateHandles } from "./gui/handles.js";
import { reRenderTransformForms } from "./gui/transforms_form.js";
import { refreshTransitionMatrixUI } from "./gui/transition_matrix.js";
import { setModeUI } from "./gui/render_mode.js";

// API is served by the same Express server that serves this page
const API_BASE_URL = "";

/**
 * Save the current fractal to the database
 * @param {string} name - Name for the fractal
 * @returns {Promise<Object>} Response from the server
 */
async function save_fractal(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Fractal name is required and must be a string");
  }

  const fractalData = {
    name: name,
    data: {
      transforms: transforms,
      transition_matrix: transition_matrix,
      render_mode: getRenderMode(),
    },
  };

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fractalData),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to save fractal: ${errorData.error || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Load a fractal from the database by ID
 * @param {string} id - MongoDB ObjectId of the fractal to load
 * @returns {Promise<Object>} The fractal data
 */
async function load_fractal(id) {
  if (!id || typeof id !== "string") {
    throw new Error("Fractal ID is required and must be a string");
  }

  const response = await fetch(`${API_BASE_URL}/api/get/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Fractal with ID "${id}" not found`);
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to load fractal: ${errorData.error || response.statusText}`
    );
  }

  const fractal = await response.json();

  if (!fractal.data || typeof fractal.data !== "object") {
    throw new Error("Invalid fractal data format");
  }

  if (!Array.isArray(fractal.data.transforms)) {
    throw new Error("Invalid fractal data: transforms must be an array");
  }

  if (!Array.isArray(fractal.data.transition_matrix)) {
    throw new Error("Invalid fractal data: transition_matrix must be an array");
  }

  // Replace the contents of the shared arrays in place so every module
  // holding a reference to them sees the loaded fractal
  transforms.length = 0;
  transforms.push(...fractal.data.transforms);

  transition_matrix.length = 0;
  fractal.data.transition_matrix.forEach((row) => {
    transition_matrix.push([...row]);
  });

  // Update all UI components for the new transforms
  setModeUI(fractal.data.render_mode === "luminous" ? "luminous" : "opaque");
  recreateHandles();
  reRenderTransformForms();
  refreshTransitionMatrixUI();
  drawScene();
  return fractal;
}

/**
 * List all fractals in the database
 * @param {"popular"|"recent"} sort - Sort order
 * @returns {Promise<Array>} Array of fractal metadata
 *   (name, id, created_at, favorite_count, favorited)
 */
async function list_fractals(sort = "popular") {
  const response = await fetch(`${API_BASE_URL}/api/list?sort=${sort}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to list fractals: ${errorData.error || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Delete a fractal (only works for fractals created from this browser)
 * @param {string} id - Fractal ID
 */
async function delete_fractal(id) {
  const response = await fetch(`${API_BASE_URL}/api/fractals/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to delete fractal: ${errorData.error || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Favorite or unfavorite a fractal
 * @param {string} id - Fractal ID
 * @param {boolean} favorited - true to favorite, false to unfavorite
 * @returns {Promise<Object>} { favorited, favorite_count }
 */
async function set_favorite(id, favorited) {
  const response = await fetch(`${API_BASE_URL}/api/fractals/${id}/favorite`, {
    method: favorited ? "PUT" : "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to update favorite: ${errorData.error || response.statusText}`
    );
  }

  return response.json();
}

// Console convenience
window.save_fractal = save_fractal;
window.load_fractal = load_fractal;
window.list_fractals = list_fractals;
window.set_favorite = set_favorite;
window.delete_fractal = delete_fractal;

export { save_fractal, load_fractal, list_fractals, set_favorite, delete_fractal };
