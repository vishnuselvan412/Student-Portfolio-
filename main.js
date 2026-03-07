// ============================================================
// main.js — Firestore + Firebase Storage powered Portfolio
// ============================================================

import { auth, db, storage, provider } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── Helpers ─────────────────────────────────────────────────

function nameFromEmail(email) {
  const local = email.split("@")[0];
  return local
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function showNotification(message, type = "success") {
  if (type === "success") {
    const el = document.getElementById("success-notification");
    el.querySelector("p").textContent = message;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 3000);
  } else {
    const el = document.getElementById("error-notification");
    document.getElementById("error-message").textContent = message;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 4000);
  }
}

function calcCompletion(profile) {
  const fields = ["fullName", "phone", "department", "bio"];
  const filled = fields.filter(f => profile[f] && profile[f].trim() !== "").length;
  return Math.round((filled / fields.length) * 100);
}

function updateCompletionUI(pct) {
  document.getElementById("completion-text").textContent = pct + "%";
  const circle = document.querySelector(".completion-circle");
  const deg = Math.round((pct / 100) * 360);
  circle.style.background = `conic-gradient(var(--primary) 0deg, var(--secondary) ${deg}deg, var(--gray-200) ${deg}deg)`;
}

// ─── DOM Ready ────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // ── Auth State ──────────────────────────────────────────────
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    // Auto display name from email on first login
    if (!user.displayName) {
      const derived = nameFromEmail(user.email);
      await updateProfile(user, { displayName: derived });
    }

    document.getElementById("dropdown-name").textContent =
      user.displayName || nameFromEmail(user.email);
    document.getElementById("dropdown-email").textContent = user.email;
    document.getElementById("dropdown-email-input").value = user.email;

    await loadAllData(user.uid);
  });

  // ── Profile Dropdown ────────────────────────────────────────
  const userProfile = document.getElementById("user-profile");
  const profileDropdown = document.getElementById("profile-dropdown");

  userProfile.addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle("show");
  });

  document.addEventListener("click", () => profileDropdown.classList.remove("show"));
  profileDropdown.addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("save-profile-btn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const profileData = {
      fullName:   document.getElementById("dropdown-full-name").value.trim(),
      email:      document.getElementById("dropdown-email-input").value.trim(),
      phone:      document.getElementById("dropdown-phone").value.trim(),
      department: document.getElementById("dropdown-department").value.trim(),
      bio:        document.getElementById("dropdown-bio").value.trim(),
    };

    try {
      await setDoc(doc(db, "users", user.uid, "data", "profile"), profileData);
      if (profileData.fullName) {
        document.getElementById("dropdown-name").textContent = profileData.fullName;
        await updateProfile(user, { displayName: profileData.fullName });
      }
      updateCompletionUI(calcCompletion(profileData));
      profileDropdown.classList.remove("show");
      showNotification("Profile saved successfully!");
    } catch (err) {
      showNotification("Failed to save profile: " + err.message, "error");
    }
  });

  // ── Sidebar ──────────────────────────────────────────────────
  const sidebar = document.getElementById("sidebar");

  document.getElementById("menu-toggle").addEventListener("click", () => {
    sidebar.classList.toggle("active");
  });

  document.getElementById("sidebar-close").addEventListener("click", () => {
    sidebar.classList.remove("active");
  });

  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      this.classList.add("active");
      const targetId = this.getAttribute("href").substring(1);
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
      if (window.innerWidth <= 1024) sidebar.classList.remove("active");
    });
  });

  // ── Theme Toggle ─────────────────────────────────────────────
  document.getElementById("theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    lucide.createIcons();
  });

  // ── Notification Close ───────────────────────────────────────
  document.querySelector(".notification-close").addEventListener("click", () => {
    document.getElementById("success-notification").classList.add("hidden");
  });
  document.querySelector(".notification-close-err").addEventListener("click", () => {
    document.getElementById("error-notification").classList.add("hidden");
  });

  // ── Save All Button ──────────────────────────────────────────
  document.getElementById("save-all-btn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await saveLinks(user.uid);
      await saveEducation(user.uid);
      showNotification("All changes saved successfully!");
    } catch (err) {
      showNotification("Save failed: " + err.message, "error");
    }
  });

  // ── Logout ───────────────────────────────────────────────────
  document.getElementById("logout-btn").addEventListener("click", async () => {
    if (confirm("Are you sure you want to logout?")) {
      await signOut(auth);
      window.location.href = "index.html";
    }
  });

  // ── File Upload Setup ────────────────────────────────────────
  setupUploadArea("resume-upload-area",      "resume-input",      "resume-list",      "resumes");
  setupUploadArea("certificate-upload-area", "certificate-input", "certificate-list", "certificates");

  // ── Project Modal ────────────────────────────────────────────
  document.getElementById("add-project-btn").addEventListener("click", openProjectModal);
  document.getElementById("modal-close-btn").addEventListener("click", closeProjectModal);
  document.getElementById("modal-cancel-btn").addEventListener("click", closeProjectModal);
  document.getElementById("project-modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeProjectModal();
  });

  document.getElementById("modal-save-btn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const title = document.getElementById("proj-title").value.trim();
    if (!title) {
      showNotification("Project title is required.", "error");
      return;
    }

    const project = {
      title,
      description: document.getElementById("proj-desc").value.trim(),
      techStack:   document.getElementById("proj-tech").value.trim(),
      github:      document.getElementById("proj-github").value.trim(),
      demo:        document.getElementById("proj-demo").value.trim(),
      createdAt:   serverTimestamp()
    };

    try {
      const projRef = await addDoc(
        collection(db, "users", user.uid, "projects"),
        project
      );
      renderProject(projRef.id, project, user.uid);
      closeProjectModal();
      showNotification("Project added!");
    } catch (err) {
      showNotification("Failed to add project: " + err.message, "error");
    }
  });
});

// ─── Load All Data ────────────────────────────────────────────

async function loadAllData(uid) {
  try {
    // Profile
    const profileSnap = await getDoc(doc(db, "users", uid, "data", "profile"));
    if (profileSnap.exists()) {
      const p = profileSnap.data();
      if (p.fullName) {
        document.getElementById("dropdown-full-name").value = p.fullName;
        document.getElementById("dropdown-name").textContent = p.fullName;
      }
      if (p.email)      document.getElementById("dropdown-email-input").value = p.email;
      if (p.phone)      document.getElementById("dropdown-phone").value = p.phone;
      if (p.department) document.getElementById("dropdown-department").value = p.department;
      if (p.bio)        document.getElementById("dropdown-bio").value = p.bio;
      updateCompletionUI(calcCompletion(p));
    }

    // Social Links
    const linksSnap = await getDoc(doc(db, "users", uid, "data", "links"));
    if (linksSnap.exists()) {
      const l = linksSnap.data();
      if (l.github)   document.getElementById("github-link").value = l.github;
      if (l.linkedin) document.getElementById("linkedin-link").value = l.linkedin;
      if (l.leetcode) document.getElementById("leetcode-link").value = l.leetcode;
    }

    // Education
    const eduSnap = await getDoc(doc(db, "users", uid, "data", "education"));
    if (eduSnap.exists()) {
      const ed = eduSnap.data();
      const fieldMap = {
        "school-10-name":   ed.school10?.name,
        "school-10-board":  ed.school10?.board,
        "school-10-year":   ed.school10?.year,
        "school-10-grade":  ed.school10?.grade,
        "school-12-name":   ed.school12?.name,
        "school-12-board":  ed.school12?.board,
        "school-12-stream": ed.school12?.stream,
        "school-12-year":   ed.school12?.year,
        "school-12-grade":  ed.school12?.grade,
        "ug-college-name":  ed.ug?.collegeName,
        "ug-degree":        ed.ug?.degree,
        "ug-branch":        ed.ug?.branch,
        "ug-start-year":    ed.ug?.startYear,
        "ug-end-year":      ed.ug?.endYear,
        "ug-grade":         ed.ug?.grade,
        "pg-college-name":  ed.pg?.collegeName,
        "pg-degree":        ed.pg?.degree,
        "pg-branch":        ed.pg?.branch,
        "pg-start-year":    ed.pg?.startYear,
        "pg-end-year":      ed.pg?.endYear,
        "pg-grade":         ed.pg?.grade,
      };
      for (const [id, val] of Object.entries(fieldMap)) {
        if (val) { const el = document.getElementById(id); if (el) el.value = val; }
      }
    }

    // Projects
    const projectsSnap = await getDocs(collection(db, "users", uid, "projects"));
    projectsSnap.forEach(d => renderProject(d.id, d.data(), uid));

    // Resumes
    const resumesSnap = await getDocs(collection(db, "users", uid, "resumes"));
    resumesSnap.forEach(d => renderFileItem(d.id, d.data(), "resume-list", "resumes", uid));

    // Certificates
    const certsSnap = await getDocs(collection(db, "users", uid, "certificates"));
    certsSnap.forEach(d => renderFileItem(d.id, d.data(), "certificate-list", "certificates", uid));

    lucide.createIcons();
  } catch (err) {
    showNotification("Error loading data: " + err.message, "error");
  }
}

// ─── Save Links ───────────────────────────────────────────────

async function saveLinks(uid) {
  await setDoc(doc(db, "users", uid, "data", "links"), {
    github:   document.getElementById("github-link").value.trim(),
    linkedin: document.getElementById("linkedin-link").value.trim(),
    leetcode: document.getElementById("leetcode-link").value.trim(),
  });
}

// ─── Save Education ───────────────────────────────────────────

async function saveEducation(uid) {
  await setDoc(doc(db, "users", uid, "data", "education"), {
    school10: {
      name:  document.getElementById("school-10-name").value.trim(),
      board: document.getElementById("school-10-board").value.trim(),
      year:  document.getElementById("school-10-year").value.trim(),
      grade: document.getElementById("school-10-grade").value.trim(),
    },
    school12: {
      name:   document.getElementById("school-12-name").value.trim(),
      board:  document.getElementById("school-12-board").value.trim(),
      stream: document.getElementById("school-12-stream").value.trim(),
      year:   document.getElementById("school-12-year").value.trim(),
      grade:  document.getElementById("school-12-grade").value.trim(),
    },
    ug: {
      collegeName: document.getElementById("ug-college-name").value.trim(),
      degree:      document.getElementById("ug-degree").value.trim(),
      branch:      document.getElementById("ug-branch").value.trim(),
      startYear:   document.getElementById("ug-start-year").value.trim(),
      endYear:     document.getElementById("ug-end-year").value.trim(),
      grade:       document.getElementById("ug-grade").value.trim(),
    },
    pg: {
      collegeName: document.getElementById("pg-college-name").value.trim(),
      degree:      document.getElementById("pg-degree").value.trim(),
      branch:      document.getElementById("pg-branch").value.trim(),
      startYear:   document.getElementById("pg-start-year").value.trim(),
      endYear:     document.getElementById("pg-end-year").value.trim(),
      grade:       document.getElementById("pg-grade").value.trim(),
    }
  });
}

// ─── Projects ─────────────────────────────────────────────────

function openProjectModal() {
  ["proj-title", "proj-desc", "proj-tech", "proj-github", "proj-demo"]
    .forEach(id => document.getElementById(id).value = "");
  document.getElementById("project-modal-overlay").classList.remove("hidden");
  lucide.createIcons();
}

function closeProjectModal() {
  document.getElementById("project-modal-overlay").classList.add("hidden");
}

function renderProject(id, proj, uid) {
  const container = document.getElementById("projects-container");
  const card = document.createElement("div");
  card.className = "project-card card";
  card.dataset.id = id;

  card.innerHTML = `
    <div class="project-card-header">
      <div class="project-icon"><i data-lucide="folder-open"></i></div>
      <button class="project-delete-btn" title="Delete project"><i data-lucide="trash-2"></i></button>
    </div>
    <h3 class="project-title">${proj.title}</h3>
    <p class="project-desc">${proj.description || "No description provided."}</p>
    ${proj.techStack
      ? `<div class="project-tech">${proj.techStack.split(",").map(t => `<span class="tech-tag">${t.trim()}</span>`).join("")}</div>`
      : ""}
    <div class="project-links">
      ${proj.github ? `<a href="${proj.github}" target="_blank" class="project-link github-link"><i data-lucide="github"></i> GitHub</a>` : ""}
      ${proj.demo   ? `<a href="${proj.demo}"   target="_blank" class="project-link demo-link"><i data-lucide="external-link"></i> Live Demo</a>` : ""}
    </div>
  `;

  card.querySelector(".project-delete-btn").addEventListener("click", async () => {
    if (!confirm("Delete this project?")) return;
    try {
      await deleteDoc(doc(db, "users", uid, "projects", id));
      card.remove();
      showNotification("Project deleted.");
    } catch (err) {
      showNotification("Delete failed: " + err.message, "error");
    }
  });

  container.appendChild(card);
  lucide.createIcons();
}

// ─── File Upload (Storage + Firestore) ───────────────────────

function setupUploadArea(areaId, inputId, listId, folder) {
  const area  = document.getElementById(areaId);
  const input = document.getElementById(inputId);

  area.addEventListener("click", () => input.click());

  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    area.classList.add("drag-over");
  });
  area.addEventListener("dragleave", () => area.classList.remove("drag-over"));
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("drag-over");
    handleFiles(e.dataTransfer.files, listId, folder);
  });

  input.addEventListener("change", () => {
    handleFiles(input.files, listId, folder);
    input.value = "";
  });
}

async function handleFiles(files, listId, folder) {
  const user = auth.currentUser;
  if (!user) return;

  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      showNotification(`"${file.name}" exceeds the 5MB limit.`, "error");
      continue;
    }

    // Upload file to Firebase Storage
    const filePath   = `${user.uid}/${folder}/${Date.now()}_${file.name}`;
    const fileRef    = storageRef(storage, filePath);
    const uploadTask = uploadBytesResumable(fileRef, file);

    // Show progress card while uploading
    const progressCard = createProgressCard(file.name);
    document.getElementById(listId).appendChild(progressCard);
    lucide.createIcons();

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        progressCard.querySelector(".progress-bar-fill").style.width = pct + "%";
        progressCard.querySelector(".progress-text").textContent = pct + "%";
      },
      (err) => {
        progressCard.remove();
        showNotification(`Upload failed: ${err.message}`, "error");
      },
      async () => {
        // Get public download URL
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

        // Save metadata to Firestore
        const meta = {
          name:        file.name,
          size:        file.size,
          type:        file.type,
          storagePath: filePath,
          downloadURL,
          uploadedAt:  serverTimestamp()
        };

        try {
          const docRef = await addDoc(
            collection(db, "users", user.uid, folder),
            meta
          );
          progressCard.remove();
          renderFileItem(docRef.id, meta, listId, folder, user.uid);
          showNotification(`"${file.name}" uploaded!`);
        } catch (err) {
          progressCard.remove();
          showNotification("Metadata save failed: " + err.message, "error");
        }
      }
    );
  }
}

function createProgressCard(fileName) {
  const card = document.createElement("div");
  card.className = "file-item card";
  card.innerHTML = `
    <div class="file-icon"><i data-lucide="loader"></i></div>
    <div class="file-info">
      <p class="file-name">${fileName}</p>
      <div class="progress-bar"><div class="progress-bar-fill"></div></div>
    </div>
    <span class="progress-text">0%</span>
  `;
  return card;
}

function renderFileItem(id, meta, listId, folder, uid) {
  const list = document.getElementById(listId);
  const item = document.createElement("div");
  item.className = "file-item card";
  item.dataset.id = id;

  const sizeKB = (meta.size / 1024).toFixed(1);
  const date   = meta.uploadedAt?.toDate
    ? meta.uploadedAt.toDate().toLocaleDateString()
    : new Date().toLocaleDateString();
  const icon   = meta.type?.includes("pdf") ? "file-text" : "file-image";

  item.innerHTML = `
    <div class="file-icon"><i data-lucide="${icon}"></i></div>
    <div class="file-info">
      <p class="file-name">${meta.name}</p>
      <p class="file-meta">${sizeKB} KB · ${date}</p>
    </div>
    <div class="file-actions">
      ${meta.downloadURL
        ? `<a href="${meta.downloadURL}" target="_blank" class="file-view-btn" title="View/Download"><i data-lucide="eye"></i></a>`
        : ""}
      <button class="file-delete-btn" title="Delete"><i data-lucide="trash-2"></i></button>
    </div>
  `;

  // Delete: removes from Storage AND Firestore
  item.querySelector(".file-delete-btn").addEventListener("click", async () => {
    if (!confirm(`Delete "${meta.name}"?`)) return;
    try {
      if (meta.storagePath) {
        await deleteObject(storageRef(storage, meta.storagePath));
      }
      await deleteDoc(doc(db, "users", uid, folder, id));
      item.remove();
      showNotification(`"${meta.name}" deleted.`);
    } catch (err) {
      showNotification("Delete failed: " + err.message, "error");
    }
  });

  list.appendChild(item);
  lucide.createIcons();
}