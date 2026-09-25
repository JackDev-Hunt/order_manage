// assets/js/firebase/auth.js
// ─────────────────────────────────────────────────────────────
// Firebase Authentication module
// Handles: login, logout, password reset, auth state, profile, guard
// ─────────────────────────────────────────────────────────────

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile as updateAuthProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "./config.js";

/* ═══════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════ */

const USERS_COLLECTION = "users";
const DEFAULT_REDIRECT = "login.html";

/* ═══════════════════════════════════════════════════════
   LOGIN
   ═══════════════════════════════════════════════════════ */

/**
 * Sign in a user with email + password.
 * Also fetches their Firestore profile (users/{uid}).
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: import("firebase-auth").User, profile: object|null}>}
 * @throws {Error} with code like "auth/wrong-password"
 */
export async function loginUser(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getUserProfile(credential.user.uid);
  return { user: credential.user, profile };
}

/* ═══════════════════════════════════════════════════════
   LOGOUT
   ═══════════════════════════════════════════════════════ */

/**
 * Sign out the current user.
 * Safe to call even if no user is signed in.
 */
export async function logoutUser() {
  await signOut(auth);
}

/* ═══════════════════════════════════════════════════════
   USER PROFILE (Firestore)
   ═══════════════════════════════════════════════════════ */

/**
 * Fetch user profile document from `users/{uid}`.
 * Returns null if it doesn't exist (user needs to be seeded by admin).
 *
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const ref = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.error("getUserProfile error:", err);
    return null;
  }
}

/**
 * Update the current user's profile in Firestore (name, phone, etc.).
 * @param {string} uid
 * @param {object} updates
 */
export async function updateUserProfile(uid, updates) {
  const ref = doc(db, USERS_COLLECTION, uid);
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/* ═══════════════════════════════════════════════════════
   PASSWORD RESET
   ═══════════════════════════════════════════════════════ */

/**
 * Send a password reset email.
 * @param {string} email
 */
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Change password for the currently signed-in user.
 * Requires the user's current password (re-authentication).
 *
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("no-current-user");
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

/* ═══════════════════════════════════════════════════════
   AUTH STATE
   ═══════════════════════════════════════════════════════ */

/**
 * Subscribe to auth state changes. Callback receives:
 *   (user | null, profile | null)
 *
 * @param {(user: object|null, profile: object|null) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    const profile = await getUserProfile(user.uid);
    callback(user, profile);
  });
}

/**
 * Get the currently signed-in user (sync).
 * Returns null if none.
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/* ═══════════════════════════════════════════════════════
   ROUTE GUARD
   ═══════════════════════════════════════════════════════ */

/**
 * Guard function for protected pages.
 * Resolves with { user, profile } if authenticated.
 * Redirects to `redirectTo` (default: login.html) otherwise.
 *
 * @param {string} redirectTo
 * @returns {Promise<{user: object, profile: object|null}>}
 */
export function requireAuth(redirectTo = DEFAULT_REDIRECT) {
  return new Promise((resolve, reject) => {
    // If already resolved once (avoid multiple triggers)
    let settled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (settled) return;

      if (!user) {
        settled = true;
        unsubscribe();
        // Redirect with optional "next" param
        const next = encodeURIComponent(window.location.pathname);
        window.location.replace(`${redirectTo}?next=${next}`);
        reject(new Error("not-authenticated"));
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        settled = true;
        unsubscribe();
        resolve({ user, profile });
      } catch (err) {
        settled = true;
        unsubscribe();
        reject(err);
      }
    });
  });
}

/**
 * Redirect already-authenticated users away from public pages (login/register).
 * Call at top of login.html.
 *
 * @param {string} redirectTo - where to send logged-in users
 */
export function redirectIfAuthenticated(redirectTo = "pages/dashboard.html") {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    if (user) window.location.replace(redirectTo);
  });
}

/* ═══════════════════════════════════════════════════════
   ERROR MESSAGING
   ═══════════════════════════════════════════════════════ */

/**
 * Map a Firebase Auth error code to a user-friendly message.
 * @param {string} code - e.g. "auth/wrong-password"
 * @returns {string}
 */
export function mapAuthError(code) {
  const map = {
    "auth/invalid-email":            "Invalid email address.",
    "auth/user-not-found":           "No account found with this email.",
    "auth/wrong-password":           "Incorrect email or password.",
    "auth/invalid-credential":       "Incorrect email or password.",
    "auth/invalid-login-credentials":"Incorrect email or password.",
    "auth/user-disabled":            "This account has been disabled. Contact admin.",
    "auth/too-many-requests":        "Too many failed attempts. Try again later.",
    "auth/network-request-failed":   "Network error. Check your internet connection.",
    "auth/email-already-in-use":     "This email is already registered.",
    "auth/weak-password":            "Password is too weak. Use at least 6 characters.",
    "auth/requires-recent-login":    "Please log in again to complete this action.",
    "auth/operation-not-allowed":    "This sign-in method is disabled. Contact admin.",
    "auth/missing-password":         "Password is required.",
    "auth/missing-email":            "Email is required.",
  };
  return map[code] || "Something went wrong. Please try again.";
}