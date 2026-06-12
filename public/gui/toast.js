// Small non-blocking toast notifications (replacement for alert())

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

let current = null;

/**
 * Show a toast message. Only one toast is visible at a time: a new one
 * replaces the current one instead of stacking below it.
 * @param {string} message
 * @param {"info"|"success"|"error"} type
 */
export function toast(message, type = "info") {
  if (current) {
    current.remove();
    current = null;
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  getContainer().appendChild(el);
  current = el;

  requestAnimationFrame(() => el.classList.add("show"));

  setTimeout(() => {
    if (current === el) current = null;
    el.classList.remove("show");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 500); // fallback if transitionend never fires
  }, 3000);
}
