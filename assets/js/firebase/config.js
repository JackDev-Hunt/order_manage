// assets/js/firebase/config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

/**
 * Firebase Configuration
 * Replace these values with your own Firebase project credentials.
 * Get them from: Firebase Console → Project Settings → General → Your apps
 */
const firebaseConfig = {
  apiKey: "AIzaSyCrsm-mRZAWfnWmu43nrS-IZwL-yNgmdA0",
  authDomain: "greenbasket-f0161.firebaseapp.com",
  projectId: "greenbasket-f0161",
  storageBucket: "greenbasket-f0161.firebasestorage.app",
  messagingSenderId: "201413749824",
  appId: "1:201413749824:web:1ba21f3089e0cf870503a5",
  measurementId: "G-S6S329ZN03"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Keep user logged in across browser sessions
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});

// Enable offline persistence for Firestore (better UX on flaky networks)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    // Multiple tabs open — only one can enable persistence
    console.warn("Firestore persistence failed: multiple tabs open.");
  } else if (err.code === "unimplemented") {
    console.warn("Firestore persistence not supported in this browser.");
  }
});

export default app;