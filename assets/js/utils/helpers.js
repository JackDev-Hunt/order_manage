// assets/js/utils/helpers.js

/**
 * Format a number as BDT currency.
 * @param {number} amount
 * @returns {string} e.g. "৳1,250.00"
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return "৳" + num.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a Firestore Timestamp or Date to readable string.
 * @param {any} timestamp
 * @param {boolean} withTime
 * @returns {string}
 */
export function formatDate(timestamp, withTime = false) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const options = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(withTime && { hour: "2-digit", minute: "2-digit" }),
  };
  return date.toLocaleDateString("en-GB", options);
}

/**
 * Generate next order ID in format ORD-000001.
 * In production, use a Firestore counter document for atomic increments.
 * @param {number} lastNumber
 * @returns {string}
 */
export function generateOrderId(lastNumber = 0) {
  const next = lastNumber + 1;
  return "ORD-" + String(next).padStart(6, "0");
}

/**
 * Validate Bangladeshi phone number (11 digits, starts with 01).
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone) return false;
  const cleaned = String(phone).replace(/\s|-/g, "");
  return /^01[3-9]\d{8}$/.test(cleaned);
}

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Debounce — delays function execution until after wait ms.
 * Useful for search inputs.
 */
export function debounce(fn, wait = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Escape HTML to prevent XSS when injecting user data.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Show field-level validation error.
 * @param {HTMLElement} input
 * @param {string} message
 */
export function setFieldError(input, message) {
  if (!input) return;
  input.classList.add("border-red-500", "focus:ring-red-500");
  input.setAttribute("aria-invalid", "true");
  let errEl = input.parentElement.querySelector(".field-error");
  if (!errEl) {
    errEl = document.createElement("p");
    errEl.className = "field-error text-xs text-red-600 mt-1";
    input.parentElement.appendChild(errEl);
  }
  errEl.textContent = message;
}

/**
 * Clear field-level validation error.
 */
export function clearFieldError(input) {
  if (!input) return;
  input.classList.remove("border-red-500", "focus:ring-red-500");
  input.removeAttribute("aria-invalid");
  const errEl = input.parentElement.querySelector(".field-error");
  if (errEl) errEl.remove();
}

/**
 * Clear all field errors inside a form.
 */
export function clearFormErrors(form) {
  form.querySelectorAll(".field-error").forEach((el) => el.remove());
  form.querySelectorAll(".border-red-500").forEach((el) => {
    el.classList.remove("border-red-500", "focus:ring-red-500");
    el.removeAttribute("aria-invalid");
  });
}

// ─── موجودة সব functions এর নিচে add করুন ────────────────

/**
 * Firestore Timestamp → relative time ("2 hours ago").
 */
export function timeAgo(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(timestamp);
}

/**
 * Truncate a string to maxLen, adding ellipsis.
 */
export function truncate(str, maxLen = 40) {
  if (!str) return "";
  str = String(str);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

/**
 * Debounce (already exists — kept for reference)
 */

/**
 * Cache helper — client-side Map cache with TTL.
 * Prevents redundant Firestore reads within same session.
 */
const __cache = new Map();

export function cacheGet(key) {
  const entry = __cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    __cache.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 30000) {
  __cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function cacheClear(prefix) {
  if (!prefix) {
    __cache.clear();
    return;
  }
  for (const k of __cache.keys()) {
    if (k.startsWith(prefix)) __cache.delete(k);
  }
}