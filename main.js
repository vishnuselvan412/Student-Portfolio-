// ============================================================
// main.js — Portify Portfolio Manager (Updated)
// New: Skills section, Photo upload, Edit projects, View counter,
//      Confirm modal, URL validation, Unsaved warning, Auto-save links,
//      Copy share link, Empty states
// ============================================================

import { auth, db } from "./firebase.js";

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
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Cloudinary Config ────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME    = "dmbn0nbb8";
const CLOUDINARY_UPLOAD_PRESET = "portify_uploads";

function getCloudinaryUploadUrl(fileType) {
  if (fileType.startsWith("image/")) {
    return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  }
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;
}

// ─── State ───────────────────────────────────────────────────
let currentSkills = [];
let hasUnsavedChanges = false;
let editingProjectId = null;

// ─── Helpers ─────────────────────────────────────────────────

function nameFromEmail(email) {
  return email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function showNotification(message, type = "success") {
  const el = document.getElementById(type === "success" ? "success-notification" : "error-notification");
  el.querySelector("p").textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), type === "success" ? 3000 : 4500);
}

function calcCompletion(profile, skills, hasProject) {
  const fields = ["fullName", "phone", "department", "bio"];
  let score = fields.filter(f => profile[f]?.trim()).length;
  if (skills.length > 0) score++;
  if (hasProject) score++;
  return Math.round((score / 6) * 100);
}

function updateCompletionUI(pct) {
  document.getElementById("completion-text").textContent = pct + "%";
  const circle = document.querySelector(".completion-circle");
  const deg = Math.round((pct / 100) * 360);
  circle.style.background = `conic-gradient(var(--primary) 0deg, var(--secondary) ${deg}deg, var(--gray-200) ${deg}deg)`;
}

function markUnsaved() {
  hasUnsavedChanges = true;
  document.querySelector(".save-bar").classList.add("has-changes");
}

function markSaved() {
  hasUnsavedChanges = false;
  document.querySelector(".save-bar").classList.remove("has-changes");
}

// ─── Confirm Modal ────────────────────────────────────────────
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-modal-overlay");
    document.getElementById("confirm-modal-title").textContent = title;
    document.getElementById("confirm-modal-message").textContent = message;
    overlay.classList.remove("hidden");
    lucide.createIcons();

    function cleanup(result) {
      overlay.classList.add("hidden");
      document.getElementById("confirm-modal-ok").onclick = null;
      document.getElementById("confirm-modal-cancel").onclick = null;
      document.getElementById("confirm-modal-close").onclick = null;
      resolve(result);
    }

    document.getElementById("confirm-modal-ok").onclick     = () => cleanup(true);
    document.getElementById("confirm-modal-cancel").onclick = () => cleanup(false);
    document.getElementById("confirm-modal-close").onclick  = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
  });
}

// ─── URL Validation ───────────────────────────────────────────
function isValidUrl(str) {
  if (!str) return true;
  try { return ["http:", "https:"].includes(new URL(str).protocol); }
  catch { return false; }
}

function validateUrlInput(inputEl) {
  const val = inputEl.value.trim();
  let errEl = inputEl.nextElementSibling;
  if (errEl?.classList.contains("input-error-msg")) errEl.remove();
  if (val && !isValidUrl(val)) {
    inputEl.classList.add("input-error");
    const msg = document.createElement("p");
    msg.className = "input-error-msg";
    msg.textContent = "Enter a valid URL starting with https://";
    inputEl.after(msg);
    return false;
  }
  inputEl.classList.remove("input-error");
  return true;
}

// ─── Skills rendering ─────────────────────────────────────────
function renderSkillTag(tag) {
  const container = document.getElementById("skills-tags");
  const empty = container.querySelector(".skills-empty");
  if (empty) empty.remove();

  const el = document.createElement("span");
  el.className = "skill-tag";
  el.dataset.skill = tag.toLowerCase();
  el.innerHTML = `${tag} <button class="skill-tag-remove" title="Remove"><i data-lucide="x"></i></button>`;
  el.querySelector("button").addEventListener("click", () => {
    currentSkills = currentSkills.filter(s => s !== tag.toLowerCase());
    el.remove();
    if (!document.getElementById("skills-tags").children.length) renderSkillsEmpty();
    markUnsaved();
  });
  container.appendChild(el);
  lucide.createIcons();
}

function renderSkillsEmpty() {
  document.getElementById("skills-tags").innerHTML =
    `<span class="skills-empty">No skills added yet. Type above to get started.</span>`;
}

// ─── Avatar photo helper ──────────────────────────────────────
function setAvatarPhoto(url) {
  ["avatar-img", "profile-photo-img"].forEach(id => {
    const img = document.getElementById(id);
    if (img) { img.src = url; img.style.display = "block"; }
  });
  ["avatar-icon", "profile-photo-icon"].forEach(id => {
    const ic = document.getElementById(id);
    if (ic) ic.style.display = "none";
  });
}


// ─── DOM Ready ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // ── Auth ────────────────────────────────────────────────────
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    if (!user.displayName) await updateProfile(user, { displayName: nameFromEmail(user.email) });

    document.getElementById("dropdown-name").textContent  = user.displayName || nameFromEmail(user.email);
    document.getElementById("dropdown-email").textContent = user.email;
    document.getElementById("dropdown-email-input").value = user.email;
    if (user.photoURL) setAvatarPhoto(user.photoURL);
    await loadAllData(user.uid);
  });

  // ── Profile Photo ────────────────────────────────────────────
  document.getElementById("profile-photo-change-btn").addEventListener("click", () => {
    document.getElementById("profile-photo-input").click();
  });

  document.getElementById("profile-photo-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showNotification("Photo must be under 5MB.", "error"); return; }
    const user = auth.currentUser;
    if (!user) return;
    showNotification("Uploading photo...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      fd.append("folder", `portify/${user.uid}/profile`);
      const res  = await fetch(getCloudinaryUploadUrl(file.type), { method: "POST", body: fd });
      const data = await res.json();
      const photoURL = data.secure_url;
      await updateProfile(user, { photoURL });
      await setDoc(doc(db, "users", user.uid, "data", "profile"), { photoURL }, { merge: true });
      setAvatarPhoto(photoURL);
      showNotification("Profile photo updated!");
    } catch (err) {
      showNotification("Photo upload failed: " + err.message, "error");
    }
  });

  // ── Copy Portfolio Link ──────────────────────────────────────
  document.getElementById("copy-link-btn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Look up username from Firestore users doc
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const username = userSnap.exists() ? userSnap.data().username : null;
      const link = username
        ? `${window.location.origin}/view.html?u=${username}`
        : `${window.location.origin}/view.html?uid=${user.uid}`; // fallback
      await navigator.clipboard.writeText(link);
      showNotification("Portfolio link copied!");
    } catch {
      showNotification("Could not copy link.", "error");
    }
  });

  // ── Profile Dropdown ────────────────────────────────────────
  const profileDropdown = document.getElementById("profile-dropdown");
  document.getElementById("user-profile").addEventListener("click", (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle("show");
    lucide.createIcons();
  });
  document.addEventListener("click", () => profileDropdown.classList.remove("show"));
  profileDropdown.addEventListener("click", e => e.stopPropagation());

  document.getElementById("save-profile-btn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    const profileData = {
      fullName:   document.getElementById("dropdown-full-name").value.trim(),
      email:      document.getElementById("dropdown-email-input").value.trim(),
      phone:      document.getElementById("dropdown-phone").value.trim(),
      department: document.getElementById("dropdown-department").value.trim(),
      bio:        document.getElementById("dropdown-bio").value.trim(),
      updatedAt:  serverTimestamp()
    };
    try {
      await setDoc(doc(db, "users", user.uid, "data", "profile"), profileData, { merge: true });
      if (profileData.fullName) {
        document.getElementById("dropdown-name").textContent = profileData.fullName;
        await updateProfile(user, { displayName: profileData.fullName });
      }
      const hasProject = document.getElementById("projects-container").children.length > 0;
      updateCompletionUI(calcCompletion(profileData, currentSkills, hasProject));
      profileDropdown.classList.remove("show");
      showNotification("Profile saved successfully!");
    } catch (err) {
      showNotification("Failed to save profile: " + err.message, "error");
    }
  });

  // ── Skills Input ─────────────────────────────────────────────
  const skillInput = document.getElementById("skill-input");

  function tryAddSkill() {
    const tag = skillInput.value.trim().replace(/,$/, "").trim();
    if (!tag || currentSkills.includes(tag.toLowerCase())) { skillInput.value = ""; return; }
    currentSkills.push(tag.toLowerCase());
    renderSkillTag(tag);
    skillInput.value = "";
    markUnsaved();
  }

  skillInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); tryAddSkill(); }
  });
  document.getElementById("add-skill-btn").addEventListener("click", () => {
    tryAddSkill();
    skillInput.focus();
  });

  // ── URL Validation on blur ───────────────────────────────────
  ["github-link","linkedin-link","leetcode-link","proj-github","proj-demo"].forEach(id => {
    document.getElementById(id)?.addEventListener("blur", () => validateUrlInput(document.getElementById(id)));
  });

  // ── Auto-save links on blur ──────────────────────────────────
  ["github-link","linkedin-link","leetcode-link"].forEach(id => {
    document.getElementById(id)?.addEventListener("blur", async () => {
      const user = auth.currentUser;
      if (!user || !validateUrlInput(document.getElementById(id))) return;
      try { await saveLinks(user.uid); showNotification("Links auto-saved ✓"); } catch {}
    });
  });

  // ── Mark unsaved on form edits ───────────────────────────────
  document.querySelectorAll("#education .form-input").forEach(el => el.addEventListener("input", markUnsaved));

  // ── Sidebar ─────────────────────────────────────────────────
  const sidebar       = document.getElementById("sidebar");
  const sidebarClose  = document.getElementById("sidebar-close");

  document.getElementById("menu-toggle").addEventListener("click", () => {
    sidebar.classList.toggle("active");
    sidebarClose.style.display = sidebar.classList.contains("active") ? "flex" : "none";
  });
  sidebarClose.addEventListener("click", () => {
    sidebar.classList.remove("active");
    sidebarClose.style.display = "none";
  });
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", function(e) {
      e.preventDefault();
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      this.classList.add("active");
      document.getElementById(this.getAttribute("href").substring(1))?.scrollIntoView({ behavior: "smooth" });
      if (window.innerWidth <= 1024) { sidebar.classList.remove("active"); sidebarClose.style.display = "none"; }
    });
  });

  // ── View Mode ────────────────────────────────────────────────
  document.querySelector(".btn-preview").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const username = userSnap.exists() ? userSnap.data().username : null;
      const url = username
        ? `view.html?u=${username}`
        : `view.html?uid=${user.uid}`;
      window.open(url, "_blank");
    } catch {
      window.open(`view.html?uid=${user.uid}`, "_blank");
    }
  });

  // ── Theme Toggle ─────────────────────────────────────────────
  document.getElementById("theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    lucide.createIcons();
  });

  // ── Notification Close ───────────────────────────────────────
  document.querySelector(".notification-close").addEventListener("click",     () => document.getElementById("success-notification").classList.add("hidden"));
  document.querySelector(".notification-close-err").addEventListener("click", () => document.getElementById("error-notification").classList.add("hidden"));

  // ── Save All ─────────────────────────────────────────────────
  document.getElementById("save-all-btn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    let valid = true;
    ["github-link","linkedin-link","leetcode-link"].forEach(id => {
      if (!validateUrlInput(document.getElementById(id))) valid = false;
    });
    if (!valid) { showNotification("Fix invalid URLs before saving.", "error"); return; }
    try {
      await saveLinks(user.uid);
      await saveEducation(user.uid);
      await saveSkills(user.uid);
      markSaved();
      showNotification("All changes saved successfully!");
    } catch (err) {
      showNotification("Save failed: " + err.message, "error");
    }
  });

  // ── Logout ───────────────────────────────────────────────────
  document.getElementById("logout-btn").addEventListener("click", async () => {
    const ok = await showConfirm("Logout", "Are you sure you want to log out?");
    if (ok) { await signOut(auth); window.location.href = "index.html"; }
  });

  // ── File Upload Areas ────────────────────────────────────────
  setupUploadArea("resume-upload-area",      "resume-input",      "resume-list",      "resumes");
  setupUploadArea("certificate-upload-area", "certificate-input", "certificate-list", "certificates");

  // ── Project Modal ─────────────────────────────────────────────
  document.getElementById("add-project-btn").addEventListener("click", () => openProjectModal());
  document.getElementById("modal-close-btn").addEventListener("click", closeProjectModal);
  document.getElementById("modal-cancel-btn").addEventListener("click", closeProjectModal);
  document.getElementById("project-modal-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeProjectModal();
  });

  document.getElementById("modal-save-btn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    const title = document.getElementById("proj-title").value.trim();
    if (!title) { showNotification("Project title is required.", "error"); return; }
    if (!validateUrlInput(document.getElementById("proj-github"))) return;
    if (!validateUrlInput(document.getElementById("proj-demo")))   return;

    const project = {
      title,
      description: document.getElementById("proj-desc").value.trim(),
      techStack:   document.getElementById("proj-tech").value.trim(),
      github:      document.getElementById("proj-github").value.trim(),
      demo:        document.getElementById("proj-demo").value.trim(),
    };

    try {
      if (editingProjectId) {
        await updateDoc(doc(db, "users", user.uid, "projects", editingProjectId), {
          ...project, updatedAt: serverTimestamp()
        });
        const old = document.querySelector(`.project-card[data-id="${editingProjectId}"]`);
        if (old) old.remove();
        renderProject(editingProjectId, project, user.uid);
        showNotification("Project updated!");
      } else {
        const docRef = await addDoc(collection(db, "users", user.uid, "projects"), {
          ...project, createdAt: serverTimestamp()
        });
        renderProject(docRef.id, project, user.uid);
        showNotification("Project added!");
      }
      closeProjectModal();
    } catch (err) {
      showNotification("Failed to save project: " + err.message, "error");
    }
  });

  // ── Unsaved Changes Warning ──────────────────────────────────
  window.addEventListener("beforeunload", (e) => {
    if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ""; }
  });
});

// ─── Load All Data ────────────────────────────────────────────
async function loadAllData(uid) {
  try {
    const [profileSnap, linksSnap, eduSnap, skillsSnap, projectsSnap, resumesSnap, certsSnap] =
      await Promise.all([
        getDoc(doc(db, "users", uid, "data", "profile")),
        getDoc(doc(db, "users", uid, "data", "links")),
        getDoc(doc(db, "users", uid, "data", "education")),
        getDoc(doc(db, "users", uid, "data", "skills")),
        getDocs(collection(db, "users", uid, "projects")),
        getDocs(collection(db, "users", uid, "resumes")),
        getDocs(collection(db, "users", uid, "certificates")),
      ]);

    // Profile
    let profileData = {};
    if (profileSnap.exists()) {
      const p = profileSnap.data();
      profileData = p;
      if (p.fullName)   { document.getElementById("dropdown-full-name").value = p.fullName; document.getElementById("dropdown-name").textContent = p.fullName; }
      if (p.email)       document.getElementById("dropdown-email-input").value = p.email;
      if (p.phone)       document.getElementById("dropdown-phone").value = p.phone;
      if (p.department)  document.getElementById("dropdown-department").value = p.department;
      if (p.bio)         document.getElementById("dropdown-bio").value = p.bio;
      if (p.photoURL)    setAvatarPhoto(p.photoURL);
    }

    // Links
    if (linksSnap.exists()) {
      const l = linksSnap.data();
      if (l.github)   document.getElementById("github-link").value   = l.github;
      if (l.linkedin) document.getElementById("linkedin-link").value = l.linkedin;
      if (l.leetcode) document.getElementById("leetcode-link").value = l.leetcode;
    }

    // Education
    if (eduSnap.exists()) {
      const ed = eduSnap.data();
      const map = {
        "school-10-name":  ed.school10?.name,  "school-10-board": ed.school10?.board,
        "school-10-year":  ed.school10?.year,  "school-10-grade": ed.school10?.grade,
        "school-12-name":  ed.school12?.name,  "school-12-board": ed.school12?.board,
        "school-12-stream":ed.school12?.stream,"school-12-year":  ed.school12?.year,
        "school-12-grade": ed.school12?.grade,
        "ug-college-name": ed.ug?.collegeName, "ug-degree":       ed.ug?.degree,
        "ug-branch":       ed.ug?.branch,      "ug-start-year":   ed.ug?.startYear,
        "ug-end-year":     ed.ug?.endYear,     "ug-grade":        ed.ug?.grade,
        "pg-college-name": ed.pg?.collegeName, "pg-degree":       ed.pg?.degree,
        "pg-branch":       ed.pg?.branch,      "pg-start-year":   ed.pg?.startYear,
        "pg-end-year":     ed.pg?.endYear,     "pg-grade":        ed.pg?.grade,
      };
      for (const [id, val] of Object.entries(map)) {
        if (val) { const el = document.getElementById(id); if (el) el.value = val; }
      }
    }

    // Skills
    currentSkills = [];
    if (skillsSnap.exists() && skillsSnap.data().tags?.length) {
      document.getElementById("skills-tags").innerHTML = "";
      skillsSnap.data().tags.forEach(tag => {
        currentSkills.push(tag.toLowerCase());
        renderSkillTag(tag);
      });
    } else {
      renderSkillsEmpty();
    }

    // Projects
    let hasProject = false;
    projectsSnap.forEach(d => { renderProject(d.id, d.data(), uid); hasProject = true; });
    if (!hasProject) {
      document.getElementById("projects-container").innerHTML =
        `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--gray-400);font-size:0.875rem;border:2px dashed var(--gray-200);border-radius:0.75rem;"><i data-lucide='folder-open' style='width:32px;height:32px;margin:0 auto 0.75rem;display:block;opacity:0.4;'></i>No projects yet. Add your first one!</div>`;
    }

    // Resumes
    resumesSnap.forEach(d => renderFileItem(d.id, d.data(), "resume-list", "resumes", uid));

    // Certificates
    certsSnap.forEach(d => renderFileItem(d.id, d.data(), "certificate-list", "certificates", uid));

    // Completion
    updateCompletionUI(calcCompletion(profileData, currentSkills, hasProject));

    lucide.createIcons();
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

// ─── Save Helpers ─────────────────────────────────────────────
async function saveLinks(uid) {
  await setDoc(doc(db, "users", uid, "data", "links"), {
    github:    document.getElementById("github-link").value.trim(),
    linkedin:  document.getElementById("linkedin-link").value.trim(),
    leetcode:  document.getElementById("leetcode-link").value.trim(),
    updatedAt: serverTimestamp()
  });
}

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
    },
    updatedAt: serverTimestamp()
  });
}

async function saveSkills(uid) {
  await setDoc(doc(db, "users", uid, "data", "skills"), {
    tags: currentSkills,
    updatedAt: serverTimestamp()
  });
}

// ─── Project Modal ────────────────────────────────────────────
function openProjectModal(projId = null, proj = null) {
  editingProjectId = projId;
  document.getElementById("project-modal-title").textContent = projId ? "Edit Project" : "Add New Project";
  document.getElementById("modal-save-btn").innerHTML = projId
    ? `<i data-lucide="save"></i> Save Changes`
    : `<i data-lucide="plus"></i> Add Project`;

  if (proj) {
    document.getElementById("proj-title").value  = proj.title || "";
    document.getElementById("proj-desc").value   = proj.description || "";
    document.getElementById("proj-tech").value   = proj.techStack || "";
    document.getElementById("proj-github").value = proj.github || "";
    document.getElementById("proj-demo").value   = proj.demo || "";
  } else {
    ["proj-title","proj-desc","proj-tech","proj-github","proj-demo"].forEach(id => {
      document.getElementById(id).value = "";
    });
  }
  document.getElementById("project-modal-overlay").classList.remove("hidden");
  lucide.createIcons();
}

function closeProjectModal() {
  editingProjectId = null;
  document.getElementById("project-modal-overlay").classList.add("hidden");
}

function renderProject(id, proj, uid) {
  const container = document.getElementById("projects-container");
  // Remove empty state if present
  const empty = container.querySelector("[style*='grid-column']");
  if (empty) empty.remove();

  const card = document.createElement("div");
  card.className = "project-card card";
  card.dataset.id = id;
  card.innerHTML = `
    <div class="project-card-header">
      <div class="project-icon"><i data-lucide="folder-open"></i></div>
      <div style="display:flex;gap:0.25rem;">
        <button class="project-edit-btn" title="Edit"><i data-lucide="pencil"></i></button>
        <button class="project-delete-btn" title="Delete"><i data-lucide="trash-2"></i></button>
      </div>
    </div>
    <h3 class="project-title">${proj.title}</h3>
    <p class="project-desc">${proj.description || "No description provided."}</p>
    ${proj.techStack ? `<div class="project-tech">${proj.techStack.split(",").map(t=>`<span class="tech-tag">${t.trim()}</span>`).join("")}</div>` : ""}
    <div class="project-links">
      ${proj.github ? `<a href="${proj.github}" target="_blank" class="project-link github-link"><i data-lucide="github"></i> GitHub</a>` : ""}
      ${proj.demo   ? `<a href="${proj.demo}"   target="_blank" class="project-link demo-link"><i data-lucide="external-link"></i> Live Demo</a>` : ""}
    </div>
  `;

  card.querySelector(".project-edit-btn").addEventListener("click", () => openProjectModal(id, proj));
  card.querySelector(".project-delete-btn").addEventListener("click", async () => {
    const ok = await showConfirm("Delete Project", `Delete "${proj.title}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "users", uid, "projects", id));
      card.remove();
      if (!container.children.length) {
        container.innerHTML =
          `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--gray-400);font-size:0.875rem;border:2px dashed var(--gray-200);border-radius:0.75rem;"><i data-lucide='folder-open' style='width:32px;height:32px;margin:0 auto 0.75rem;display:block;opacity:0.4;'></i>No projects yet. Add your first one!</div>`;
        lucide.createIcons();
      }
      showNotification("Project deleted.");
    } catch (err) {
      showNotification("Delete failed: " + err.message, "error");
    }
  });

  container.appendChild(card);
  lucide.createIcons();
}

// ─── File Upload ──────────────────────────────────────────────
function setupUploadArea(areaId, inputId, listId, dbKey) {
  const area  = document.getElementById(areaId);
  const input = document.getElementById(inputId);
  area.addEventListener("click", () => input.click());
  area.addEventListener("dragover", e => { e.preventDefault(); area.classList.add("drag-over"); });
  area.addEventListener("dragleave", () => area.classList.remove("drag-over"));
  area.addEventListener("drop", e => { e.preventDefault(); area.classList.remove("drag-over"); handleFiles(e.dataTransfer.files, listId, dbKey); });
  input.addEventListener("change", () => { handleFiles(input.files, listId, dbKey); input.value = ""; });
}

async function handleFiles(files, listId, dbKey) {
  const user = auth.currentUser;
  if (!user) return;

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      showNotification(`"${file.name}" exceeds the 10MB limit.`, "error");
      continue;
    }
    const card = showUploadingCard(file.name, listId);
    let cancelled = false, xhr = null;

    card.querySelector(".upload-cancel-btn").addEventListener("click", () => {
      cancelled = true;
      if (xhr) xhr.abort();
      card.remove();
      showNotification(`Upload of "${file.name}" cancelled.`);
    });

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      fd.append("folder", `portify/${user.uid}/${dbKey}`);

      const result = await new Promise((resolve, reject) => {
        xhr = new XMLHttpRequest();
        xhr.open("POST", getCloudinaryUploadUrl(file.type));
        xhr.upload.addEventListener("progress", e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            const bar = card.querySelector(".upload-progress-bar");
            const txt = card.querySelector(".upload-pct");
            if (bar) bar.style.width  = pct + "%";
            if (txt) txt.textContent  = pct + "%";
          }
        });
        xhr.addEventListener("load",  () => xhr.status === 200 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.statusText)));
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.addEventListener("abort", () => reject(new Error("cancelled")));
        xhr.send(fd);
      });

      if (cancelled) continue;

      const meta = { name: file.name, size: file.size, type: file.type, url: result.secure_url, publicId: result.public_id, uploadedAt: serverTimestamp() };
      const docRef = await addDoc(collection(db, "users", user.uid, dbKey), meta);
      card.remove();
      renderFileItem(docRef.id, meta, listId, dbKey, user.uid);
      showNotification(`"${file.name}" uploaded successfully!`);
    } catch (err) {
      if (!cancelled) { card.remove(); showNotification("Upload error: " + err.message, "error"); }
    }
  }
}

function showUploadingCard(fileName, listId) {
  const list = document.getElementById(listId);
  const item = document.createElement("div");
  item.className = "file-item card uploading";
  item.innerHTML = `
    <div class="file-icon uploading-spin"><i data-lucide="loader-2"></i></div>
    <div class="file-info">
      <p class="file-name">${fileName}</p>
      <div class="upload-progress"><div class="upload-progress-bar"></div></div>
    </div>
    <div class="file-actions">
      <span class="upload-pct">0%</span>
      <button class="upload-cancel-btn file-delete-btn" title="Cancel"><i data-lucide="x"></i></button>
    </div>
  `;
  list.appendChild(item);
  lucide.createIcons();
  return item;
}

function renderFileItem(id, fileMeta, listId, dbKey, uid) {
  const list = document.getElementById(listId);
  const item = document.createElement("div");
  item.className = "file-item card";
  const sizeKB = fileMeta.size ? (fileMeta.size / 1024).toFixed(1) + " KB" : "";
  const date   = fileMeta.uploadedAt?.seconds ? new Date(fileMeta.uploadedAt.seconds * 1000).toLocaleDateString() : new Date().toLocaleDateString();
  const icon   = fileMeta.type?.includes("pdf") ? "file-text" : "file";

  item.innerHTML = `
    <div class="file-icon"><i data-lucide="${icon}"></i></div>
    <div class="file-info">
      <p class="file-name">${fileMeta.name}</p>
      <p class="file-meta">${sizeKB}${sizeKB ? " · " : ""}${date}</p>
    </div>
    <div class="file-actions">
      ${fileMeta.url ? `<a href="${fileMeta.url}" target="_blank" class="file-view-btn" title="View"><i data-lucide="eye"></i></a>` : ""}
      <button class="file-delete-btn" title="Delete"><i data-lucide="trash-2"></i></button>
    </div>
  `;

  item.querySelector(".file-delete-btn").addEventListener("click", async () => {
    const ok = await showConfirm("Delete File", `Remove "${fileMeta.name}"?`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "users", uid, dbKey, id));
      item.remove();
      showNotification(`"${fileMeta.name}" removed.`);
    } catch (err) {
      showNotification("Delete failed: " + err.message, "error");
    }
  });

  list.appendChild(item);
  lucide.createIcons();
}
