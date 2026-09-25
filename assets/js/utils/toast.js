// assets/js/utils/toast.js

const ICONS = {
  success: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
  error:   `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-2.97L13.74 4.97a2 2 0 00-3.48 0L3.2 16.03A2 2 0 004.93 19z"/></svg>`,
  info:    `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
};

const COLORS = {
  success: "bg-green-50 border-green-200 text-green-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info:    "bg-blue-50 border-blue-200 text-blue-800",
};

const ICON_COLORS = {
  success: "text-green-600",
  error:   "text-red-600",
  warning: "text-amber-600",
  info:    "text-blue-600",
};

/**
 * Show a toast notification.
 * @param {"success"|"error"|"warning"|"info"} type
 * @param {string} message
 * @param {number} duration - ms; default 3500
 */
export function showToast(type, message, duration = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) {
    console.warn("Toast container not found.");
    return;
  }

  const el = document.createElement("div");
  el.className = `
    pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-sm
    toast-enter max-w-sm w-full sm:w-auto sm:min-w-[280px] ${COLORS[type] || COLORS.info}
  `;
  el.setAttribute("role", "status");
  el.innerHTML = `
    <span class="${ICON_COLORS[type] || ICON_COLORS.info} mt-0.5 shrink-0">${ICONS[type] || ICONS.info}</span>
    <p class="text-sm font-medium flex-1 leading-snug">${escapeHtml(message)}</p>
    <button type="button" class="shrink-0 p-1 -m-1 rounded hover:bg-black/5" aria-label="Close">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `;

  const remove = () => {
    el.classList.add("toast-exit");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  };

  el.querySelector("button").addEventListener("click", remove);
  container.appendChild(el);

  if (duration > 0) setTimeout(remove, duration);
}

// Convenience methods
export const toast = {
  success: (msg, d) => showToast("success", msg, d),
  error:   (msg, d) => showToast("error", msg, d),
  warning: (msg, d) => showToast("warning", msg, d),
  info:    (msg, d) => showToast("info", msg, d),
};

// Internal escape helper (duplicated to keep this module standalone)
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}