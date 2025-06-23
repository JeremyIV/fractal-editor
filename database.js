// Database functions for loading and saving fractals
import { drawScene } from "./renderer.js";
import { recreateHandles } from "./gui/handles.js";
import { reRenderTransformForms } from "./gui/transforms_form.js";

// Get your Vercel API base URL here - replace with your actual deployment URL
const API_BASE_URL = 'http://localhost:3000'; // Change to your Vercel URL when deployed

/**
 * Save the current fractal to the database
 * @param {string} name - Name for the fractal
 * @returns {Promise<Object>} Response from the server
 */
async function save_fractal(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Fractal name is required and must be a string');
  }

  if (!window.transforms || !Array.isArray(window.transforms)) {
    throw new Error('No transforms found. Make sure transforms are loaded.');
  }

  const fractalData = {
    name: name,
    data: window.transforms,
    created_at: new Date().toISOString()
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fractalData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to save fractal: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    console.log(`Fractal "${name}" saved successfully with ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error('Error saving fractal:', error);
    throw error;
  }
}

/**
 * Load a fractal from the database by ID
 * @param {string} id - MongoDB ObjectId of the fractal to load
 * @returns {Promise<Object>} The fractal data
 */
async function load_fractal(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Fractal ID is required and must be a string');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/get/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Fractal with ID "${id}" not found`);
      }
      const errorData = await response.json();
      throw new Error(`Failed to load fractal: ${errorData.error || response.statusText}`);
    }

    const fractal = await response.json();
    
    if (!fractal.data || !Array.isArray(fractal.data)) {
      throw new Error('Invalid fractal data format');
    }

    // Apply the loaded transforms to the global transforms array
    window.transforms.length = 0; // Clear existing transforms
    window.transforms.push(...fractal.data); // Add loaded transforms

    console.log(`Fractal "${fractal.name}" loaded successfully`);
    console.log('Transforms updated. The fractal should now be visible.');
    
    // Update all UI components for the new transforms
    recreateHandles();
    reRenderTransformForms();
    drawScene();
    return fractal;
  } catch (error) {
    console.error('Error loading fractal:', error);
    throw error;
  }
}

/**
 * List all fractals in the database
 * @returns {Promise<Array>} Array of fractal metadata (name, id, created_at)
 */
async function list_fractals() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/list`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to list fractals: ${errorData.error || response.statusText}`);
    }

    const fractals = await response.json();
    console.log(`Found ${fractals.length} fractals`);
    return fractals;
  } catch (error) {
    console.error('Error listing fractals:', error);
    throw error;
  }
}

// Make functions available globally for console testing
window.save_fractal = save_fractal;
window.load_fractal = load_fractal;
window.list_fractals = list_fractals;

export { save_fractal, load_fractal, list_fractals };