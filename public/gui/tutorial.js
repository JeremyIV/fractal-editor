// First-visit walkthrough for the control-point interactions.
// A hint pill is anchored next to the relevant control point with an
// arrow pointing at it, advances as the user performs each action, and
// never shows again (localStorage).
import { toast } from "./toast.js";

const STORAGE_KEY = "sg-tutorial-done";
const GAP = 26; // px between the anchor point and the pill

function firstHandle() {
  return centerOf(document.getElementById("handle-0"));
}

function selectedHandle() {
  return centerOf(
    document.querySelector(".control-handle.selected") ||
      document.getElementById("handle-0")
  );
}

function centerOf(el) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// A point in the empty space beside the selected handle
function spaceBesideHandle() {
  const p = selectedHandle();
  if (!p) return null;
  const dx = p.x < window.innerWidth - 220 ? 110 : -110;
  return { x: p.x + dx, y: p.y };
}

const STEPS = [
  { event: "select", text: "Click a control point", anchor: firstHandle },
  { event: "move", text: "Drag it to move", anchor: selectedHandle },
  {
    event: "scale",
    text: "Drag the space around it to scale & rotate",
    anchor: spaceBesideHandle,
  },
];

let stepIndex = -1; // -1 = inactive
let hintEl = null;
let textEl = null;
let arrowEl = null;
let dotEls = [];
let rafId = null;

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

  arrowEl = document.createElement("div");
  arrowEl.className = "tutorial-arrow";
  hintEl.appendChild(arrowEl);

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

// Place the pill below (or above) the anchor with the arrow pointing at it.
// Runs every frame while the tutorial is active so it tracks the handle.
function positionHint() {
  if (!hintEl || stepIndex < 0 || stepIndex >= STEPS.length) return;
  const anchor = STEPS[stepIndex].anchor();
  if (!anchor) return; // handles not created yet; try next frame

  const width = hintEl.offsetWidth;
  const height = hintEl.offsetHeight;
  const below = anchor.y < window.innerHeight - height - GAP - 20;

  const top = below ? anchor.y + GAP : anchor.y - height - GAP;
  const left = Math.min(
    Math.max(anchor.x - width / 2, 12),
    window.innerWidth - width - 12
  );

  hintEl.style.left = `${left}px`;
  hintEl.style.top = `${top}px`;

  arrowEl.classList.toggle("on-top", below);
  arrowEl.classList.toggle("on-bottom", !below);
  const arrowX = Math.min(Math.max(anchor.x - left, 16), width - 16);
  arrowEl.style.left = `${arrowX}px`;
}

function trackAnchor() {
  positionHint();
  rafId = requestAnimationFrame(trackAnchor);
}

function showStep(index) {
  textEl.textContent = STEPS[index].text;
  dotEls.forEach((dot, i) => dot.classList.toggle("done", i < index));
}

function dismiss() {
  if (!hintEl) return;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
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
  trackAnchor();
}
