import { setHandlesVisible } from "./handles.js";

const STORAGE_KEY = "sg-hide-handles";
const buttons = document.querySelectorAll("#handle-toggle button");

function apply(visible) {
  setHandlesVisible(visible);
  buttons.forEach((b) =>
    b.classList.toggle("active", (b.dataset.visible === "true") === visible)
  );
  try {
    localStorage.setItem(STORAGE_KEY, visible ? "0" : "1");
  } catch {
    /* ignore */
  }
}

buttons.forEach((b) =>
  b.addEventListener("click", () => apply(b.dataset.visible === "true"))
);

let hidden = false;
try {
  hidden = localStorage.getItem(STORAGE_KEY) === "1";
} catch {
  /* ignore */
}
if (hidden) apply(false);
