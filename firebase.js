// ============================================================
// firebase.js — Firebase Services (Auth + Firestore only)
// Files are handled by Cloudinary — no Firebase Storage needed
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQwyitKL1rS1cvcIdx6jG9eO1uYKlcCHg",
  authDomain: "studentportfolio-2a0a9.firebaseapp.com",
  projectId: "studentportfolio-2a0a9",
  storageBucket: "studentportfolio-2a0a9.firebasestorage.app",
  messagingSenderId: "341141290699",
  appId: "1:341141290699:web:019775a193ae25f7a6a54e"
};

const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const db       = getFirestore(app);  // Firestore — all data + file metadata
export const provider = new GoogleAuthProvider();
// No Firebase Storage export — using Cloudinary instead
