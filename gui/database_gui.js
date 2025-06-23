import { save_fractal, load_fractal, list_fractals } from "../database.js";
import { resizeCanvas } from "../renderer.js";
import { repositionHandles } from "./handles.js";

const canvas = document.getElementById("glCanvas");

// Database GUI toggle functions
function openDatabaseToolbar() {
  document.getElementById("database-gui").style.width = "300px";
  canvas.style.marginLeft = "300px";
  canvas.width = canvas.width - 300;
  document.getElementById("database-menu-toggle").style.display = "none";
  resizeCanvas();
  repositionHandles();
  
  // Load fractal list when opening
  loadFractalList();
}

function closeDatabaseToolbar() {
  document.getElementById("database-gui").style.width = "0";
  canvas.style.marginLeft = "0";
  canvas.width = canvas.width + 300;
  document.getElementById("database-menu-toggle").style.display = "";
  resizeCanvas();
  repositionHandles();
}

// Load and display fractal list
async function loadFractalList() {
  const fractalListContainer = document.getElementById("fractal-list");
  
  try {
    // Show loading state
    fractalListContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading fractals...</div>';
    
    const fractals = await list_fractals();
    
    if (fractals.length === 0) {
      fractalListContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No fractals saved yet</div>';
      return;
    }
    
    // Clear loading state
    fractalListContainer.innerHTML = '';
    
    // Create fractal items
    fractals.forEach(fractal => {
      const fractalItem = document.createElement('div');
      fractalItem.className = 'fractal-item';
      fractalItem.dataset.fractalId = fractal._id;
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'fractal-name';
      nameDiv.textContent = fractal.name;
      
      const dateDiv = document.createElement('div');
      dateDiv.className = 'fractal-date';
      dateDiv.textContent = new Date(fractal.created_at).toLocaleString();
      
      fractalItem.appendChild(nameDiv);
      fractalItem.appendChild(dateDiv);
      
      // Add click handler to load fractal
      fractalItem.addEventListener('click', async () => {
        try {
          // Show loading state on clicked item
          fractalItem.style.opacity = '0.5';
          await load_fractal(fractal._id);
          fractalItem.style.opacity = '1';
        } catch (error) {
          fractalItem.style.opacity = '1';
          alert(`Failed to load fractal: ${error.message}`);
        }
      });
      
      fractalListContainer.appendChild(fractalItem);
    });
    
  } catch (error) {
    fractalListContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #d32f2f;">Error loading fractals: ${error.message}</div>`;
  }
}

// Save fractal functionality
async function saveFractal() {
  const nameInput = document.getElementById("fractal-name");
  const saveButton = document.getElementById("save-fractal-btn");
  const name = nameInput.value.trim();
  
  if (!name) {
    alert("Please enter a fractal name");
    nameInput.focus();
    return;
  }
  
  try {
    // Show saving state
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    
    await save_fractal(name);
    
    // Clear input and refresh list
    nameInput.value = "";
    loadFractalList();
    
    // Reset button
    saveButton.disabled = false;
    saveButton.textContent = "Save";
    
    alert(`Fractal "${name}" saved successfully!`);
    
  } catch (error) {
    // Reset button
    saveButton.disabled = false;
    saveButton.textContent = "Save";
    
    alert(`Failed to save fractal: ${error.message}`);
  }
}

// Event listeners
document.getElementById("database-menu-toggle").addEventListener("click", openDatabaseToolbar);
document.getElementById("closeDatabaseToolbar").addEventListener("click", closeDatabaseToolbar);
document.getElementById("save-fractal-btn").addEventListener("click", saveFractal);

// Allow Enter key to save
document.getElementById("fractal-name").addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    saveFractal();
  }
});