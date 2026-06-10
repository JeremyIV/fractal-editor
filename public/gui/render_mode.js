import { setRenderMode, getRenderMode, luminousSupported } from "../renderer.js";
import { toast } from "./toast.js";

const buttons = document.querySelectorAll("#render-mode-toggle button");

function refreshButtons() {
  buttons.forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === getRenderMode())
  );
}

/** Set the render mode and keep the toggle in sync (used by fractal load). */
export function setModeUI(mode) {
  setRenderMode(mode === "luminous" ? "luminous" : "opaque");
  refreshButtons();
}

buttons.forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.mode === "luminous" && !luminousSupported) {
      toast("Luminous mode isn't supported by this browser", "error");
      return;
    }
    if (b.dataset.mode === getRenderMode()) return;
    setModeUI(b.dataset.mode);
  })
);
