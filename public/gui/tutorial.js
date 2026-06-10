// First-visit walkthrough for the control-point interactions.
// A hint pill advances as the user performs each action, then never
// shows again (localStorage).
import { toast } from "./toast.js";

const STORAGE_KEY = "sg-tutorial-done";

const STEPS = [
  { event: "select", text: "Click a control point" },
  { event: "move", text: "Drag it to move" },
  { event: "scale", text: "Drag the space around it to scale & rotate" },
];

let stepIndex = -1; // -1 = inactive
let hintEl = null;
let textEl = null;
let dotEls = [];

function isDone() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // storage unavailable: don't nag on every visit
  }
}

function markDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function buildHint() {
  hintEl = document.createElement("div");
  hintEl.id = "tutorial-hint";

  const dots = document.createElement("div");
  dots.className = "tutorial-dots";
  dotEls = STEPS.map(() => {
    const dot = document.createElement("span");
    dot.className = "tutorial-dot";
    dots.appendChild(dot);
    return dot;
  });
  hintEl.appendChild(dots);

  textEl = document.createElement("span");
  textEl.className = "tutorial-text";
  hintEl.appendChild(textEl);

  const skip = document.createElement("button");
  skip.className = "tutorial-skip";
  skip.textContent = "×";
  skip.title = "Dismiss";
  skip.addEventListener("click", () => {
    markDone();
    dismiss();
  });
  hintEl.appendChild(skip);

  document.body.appendChild(hintEl);
}

function showStep(index) {
  textEl.textContent = STEPS[index].text;
  dotEls.forEach((dot, i) => dot.classList.toggle("done", i < index));
}

function dismiss() {
  if (!hintEl) return;
  hintEl.classList.add("hide");
  const el = hintEl;
  setTimeout(() => el.remove(), 400);
  hintEl = null;
  stepIndex = STEPS.length;
}

/**
 * Report a user interaction ("select" | "move" | "scale").
 * Advances the walkthrough when it matches the awaited step.
 */
export function tutorialEvent(name) {
  if (stepIndex < 0 || stepIndex >= STEPS.length || !hintEl) return;
  const eventIndex = STEPS.findIndex((s) => s.event === name);
  if (eventIndex < stepIndex) return; // already done that step

  if (eventIndex === STEPS.length - 1) {
    markDone();
    dismiss();
    toast("That's it! Quick-click a point to deselect 🎉", "success");
  } else {
    stepIndex = eventIndex + 1;
    showStep(stepIndex);
  }
}

if (!isDone()) {
  stepIndex = 0;
  buildHint();
  showStep(0);
}
