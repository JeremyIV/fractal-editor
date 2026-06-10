// Edit history for the fractal (transforms + transition matrix) with
// ctrl/cmd-Z undo and shift+ctrl-Z / ctrl-Y redo.
//
// Commit-on-gesture-end: callers invoke commitHistory() after a complete
// edit (drag release, button click, matrix toggle, load) and the diff
// against the last committed state becomes one undo step. No-op gestures
// (e.g. a selection click, or a pan that touches no transform) are
// skipped automatically because the snapshots compare equal.
import { transforms, transition_matrix } from "./transforms.js";
import { drawScene } from "./renderer.js";
import { recreateHandles } from "./gui/handles.js";
import { reRenderTransformForms } from "./gui/transforms_form.js";
import { refreshTransitionMatrixUI } from "./gui/transition_matrix.js";
import { toast } from "./gui/toast.js";

const LIMIT = 100;
const undoStack = [];
const redoStack = [];

function snapshot() {
  // serialize only the canonical fields (renderer caches _matrix on
  // transform objects; that must not leak into history)
  return JSON.stringify({
    transforms: transforms.map((t) => ({
      origin: t.origin,
      degrees_rotation: t.degrees_rotation,
      rotation_axis: t.rotation_axis,
      x_scale: t.x_scale,
      y_scale: t.y_scale,
      z_scale: t.z_scale,
      color: t.color,
    })),
    transition_matrix: transition_matrix,
  });
}

let committedState = snapshot();
let pendingTimer = null;

function commitHistory() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  const current = snapshot();
  if (current === committedState) return;
  undoStack.push(committedState);
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
  committedState = current;
}

// Debounced commit for continuous edits (typing, slider drags): the
// whole burst becomes a single undo step.
function commitHistorySoon() {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(commitHistory, 400);
}

function apply(snap) {
  const parsed = JSON.parse(snap);
  transforms.length = 0;
  transforms.push(...parsed.transforms);
  transition_matrix.length = 0;
  parsed.transition_matrix.forEach((row) => transition_matrix.push([...row]));
  recreateHandles();
  reRenderTransformForms();
  refreshTransitionMatrixUI();
  drawScene();
}

function undo() {
  commitHistory(); // flush any pending edit so it becomes undoable first
  if (undoStack.length === 0) {
    toast("Nothing to undo");
    return;
  }
  redoStack.push(committedState);
  committedState = undoStack.pop();
  apply(committedState);
}

function redo() {
  if (redoStack.length === 0) {
    toast("Nothing to redo");
    return;
  }
  undoStack.push(committedState);
  committedState = redoStack.pop();
  apply(committedState);
}

window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  // leave native text-editing undo alone while typing in a field
  const target = event.target;
  if (
    target &&
    (target.tagName === "TEXTAREA" ||
      (target.tagName === "INPUT" && ["text", "number"].includes(target.type)))
  ) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
  } else if (key === "y") {
    event.preventDefault();
    redo();
  }
});

export { commitHistory, commitHistorySoon, undo, redo };
