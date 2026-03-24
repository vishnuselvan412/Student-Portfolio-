import { auth, provider, db } from "./firebase.js";
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const googleBtn = document.querySelector(".btn-google");

googleBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if user already exists in Firestore
    const userDocRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userDocRef);

    // Only create the document on first login
    if (!snapshot.exists()) {
      await setDoc(userDocRef, {
        displayName: user.displayName,
        username: user.displayName.replace(/\s+/g, "").toLowerCase(),
        email: user.email,
        photoURL: user.photoURL,
        createdAt: serverTimestamp()
      });
    }

    window.location.href = "main.html";

  } catch (error) {
    console.error("Error signing in:", error);
    alert(error.message);
  }
});
