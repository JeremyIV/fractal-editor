// The transform panel overlays the canvas, so opening/closing it never
// resizes or redraws the WebGL scene.
const panel = document.getElementById("transform-gui");
const openButton = document.getElementById("menu-toggle");

openButton.onclick = function () {
  panel.classList.add("open");
  openButton.style.display = "none";
};

document.getElementById("closeToolbar").onclick = function () {
  panel.classList.remove("open");
  openButton.style.display = "";
};
