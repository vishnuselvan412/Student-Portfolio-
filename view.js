// ============================================================
// view.js — Portfolio View Page (Updated)
// New: View counter, Skills section, Scroll-reveal animations,
//      Print/PDF export, default dark theme
// ============================================================

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Init ─────────────────────────────────────────────────────

async function init() {
  const uid = new URLSearchParams(window.location.search).get("uid");
  if (uid) {
    await renderPortfolio(uid);
    hideLoader();
      setupNav();
  } else {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = "index.html"; return; }
      window.history.replaceState({}, "", `view.html?uid=${user.uid}`);
      await renderPortfolio(user.uid);
      hideLoader();
          setupNav();
    });
  }
}
init();

// ─── Render All ───────────────────────────────────────────────

async function renderPortfolio(uid) {
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

    renderProfile(
      profileSnap.exists() ? profileSnap.data() : {},
      linksSnap.exists()   ? linksSnap.data()   : {}
    );

    renderEducation(eduSnap.exists() ? eduSnap.data() : {});

    const skills = skillsSnap.exists() ? (skillsSnap.data().tags || []) : [];
    renderSkills(skills);

    const projects = [];
    projectsSnap.forEach(d => projects.push(d.data()));
    renderProjects(projects);

    const resumes = [];
    resumesSnap.forEach(d => resumes.push(d.data()));
    renderFiles(resumes, "resume-grid", "resume-section");

    const certs = [];
    certsSnap.forEach(d => certs.push(d.data()));
    renderFiles(certs, "cert-grid", "cert-section");

    // Increment view counter (only for external viewers, not the owner)
    onAuthStateChanged(auth, async (user) => {
      if (!user || user.uid !== uid) {
        try {
          const statsRef = doc(db, "users", uid, "data", "stats");
          await setDoc(statsRef, { viewCount: increment(1), lastViewedAt: serverTimestamp() }, { merge: true });
        } catch {}
      }
    });

  } catch (err) {
    console.error("Error loading portfolio:", err);
  }
}

// ─── Profile & Hero ───────────────────────────────────────────

function renderProfile(profile, links) {
  const name = profile.fullName || auth.currentUser?.displayName || "Portfolio";
  const bio  = profile.bio || "Welcome to my portfolio.";
  const dept = profile.department || "Student";

  // Split name for accent effect on last word
  const nameParts = name.trim().split(" ");
  const firstName = nameParts.slice(0, -1).join(" ");
  const lastName  = nameParts.slice(-1)[0];

  document.getElementById("hero-name").innerHTML =
    firstName
      ? `${firstName} <span class="name-accent">${lastName}</span>`
      : `<span class="name-accent">${lastName}</span>`;

  document.getElementById("hero-bio").textContent = bio;
  document.getElementById("hero-department").textContent = dept;
  document.getElementById("footer-name").textContent = name;
  document.title = `${name} — Portfolio`;

  // Meta items
  const metaEl = document.getElementById("hero-meta");
  const metaItems = [];
  if (profile.email) metaItems.push({ icon: "✉", text: profile.email });
  if (profile.phone) metaItems.push({ icon: "✆", text: profile.phone });
  if (dept)          metaItems.push({ icon: "◈", text: dept });

  metaEl.innerHTML = metaItems.map(m => `
    <div class="hero-meta-item">
      <span class="meta-icon">${m.icon}</span>
      <span>${m.text}</span>
    </div>
  `).join("");

  // Social Links
  const linksEl = document.getElementById("hero-links");
  const linkDefs = [
    { key: "github",   label: "GitHub",   icon: "⌥", url: links.github },
    { key: "linkedin", label: "LinkedIn", icon: "in", url: links.linkedin },
    { key: "leetcode", label: "LeetCode", icon: "{ }", url: links.leetcode },
  ];

  linksEl.innerHTML = linkDefs
    .filter(l => l.url)
    .map(l => `
      <a href="${l.url}" target="_blank" rel="noopener" class="hero-link">
        <span class="link-icon">${l.icon}</span>
        ${l.label}
      </a>
    `).join("");
}

// ─── Education ────────────────────────────────────────────────

function renderEducation(ed) {
  const timeline = document.getElementById("edu-timeline");
  const items = [];

  // 10th
  if (ed.school10?.name) {
    items.push({
      type: "school",
      badge: "10th Grade",
      institution: ed.school10.name,
      degree: `${ed.school10.board || ""}`,
      tags: [
        ed.school10.year   && `📅 ${ed.school10.year}`,
        ed.school10.grade  && `GPA / % : ${ed.school10.grade}`,
      ].filter(Boolean),
      gradeTag: ed.school10.grade
    });
  }

  // 12th
  if (ed.school12?.name) {
    items.push({
      type: "school",
      badge: "12th Grade",
      institution: ed.school12.name,
      degree: `${ed.school12.board || ""} ${ed.school12.stream ? "· " + ed.school12.stream : ""}`,
      tags: [
        ed.school12.year  && `📅 ${ed.school12.year}`,
        ed.school12.grade && `GPA / % : ${ed.school12.grade}`,
      ].filter(Boolean),
      gradeTag: ed.school12.grade
    });
  }

  // UG
  if (ed.ug?.collegeName) {
    items.push({
      type: "college",
      badge: ed.ug.degree || "Undergraduate",
      institution: ed.ug.collegeName,
      degree: `${ed.ug.branch || ""} ${ed.ug.startYear ? "· " + ed.ug.startYear : ""} – ${ed.ug.endYear || "Present"}`,
      tags: [
        ed.ug.grade && `CGPA / % : ${ed.ug.grade}`,
      ].filter(Boolean),
      gradeTag: ed.ug.grade
    });
  }

  // PG
  if (ed.pg?.collegeName) {
    items.push({
      type: "college",
      badge: ed.pg.degree || "Postgraduate",
      institution: ed.pg.collegeName,
      degree: `${ed.pg.branch || ""} ${ed.pg.startYear ? "· " + ed.pg.startYear : ""} – ${ed.pg.endYear || "Present"}`,
      tags: [
        ed.pg.grade && `CGPA / % : ${ed.pg.grade}`,
      ].filter(Boolean),
      gradeTag: ed.pg.grade
    });
  }

  if (items.length === 0) {
    document.getElementById("edu-section").style.display = "none";
    return;
  }

  timeline.innerHTML = items.map(item => `
    <div class="edu-item">
      <div class="edu-dot ${item.type}">
        ${item.type === "school" ? "🏫" : "🎓"}
      </div>
      <div class="edu-body">
        <span class="edu-level-badge">${item.badge}</span>
        <div class="edu-institution">${item.institution}</div>
        <div class="edu-degree">${item.degree}</div>
        <div class="edu-tags">
          ${item.tags.map(t => `<span class="edu-tag ${t.includes("CGPA") || t.includes("GPA") ? "grade" : ""}">${t}</span>`).join("")}
        </div>
      </div>
    </div>
  `).join("");
}

// ─── Projects ─────────────────────────────────────────────────

function renderProjects(projects) {
  const bento = document.getElementById("projects-bento");

  if (projects.length === 0) {
    document.getElementById("proj-section").style.display = "none";
    return;
  }

  bento.innerHTML = projects.map((proj, i) => `
    <div class="project-bento-card">
      <div class="project-bento-num">${String(i + 1).padStart(2, "0")}</div>
      <h3 class="project-bento-title">${proj.title}</h3>
      <p class="project-bento-desc">${proj.description || "No description provided."}</p>
      ${proj.techStack
        ? `<div class="project-bento-tech">
            ${proj.techStack.split(",").map(t =>
              `<span class="bento-tech-tag">${t.trim()}</span>`
            ).join("")}
           </div>`
        : ""}
      <div class="project-bento-links">
        ${proj.github
          ? `<a href="${proj.github}" target="_blank" rel="noopener" class="bento-link github">⌥ GitHub</a>`
          : ""}
        ${proj.demo
          ? `<a href="${proj.demo}" target="_blank" rel="noopener" class="bento-link demo">↗ Live Demo</a>`
          : ""}
      </div>
    </div>
  `).join("");
}

// ─── Files (Resumes & Certificates) ──────────────────────────

function renderFiles(files, gridId, sectionId) {
  const grid = document.getElementById(gridId);

  if (files.length === 0) {
    document.getElementById(sectionId).style.display = "none";
    return;
  }

  grid.innerHTML = files.map(file => {
    const sizeKB = (file.size / 1024).toFixed(1);
    const date   = file.uploadedAt?.toDate
      ? file.uploadedAt.toDate().toLocaleDateString()
      : "—";

    let iconClass = "doc";
    let iconEmoji = "📄";
    if (file.type?.includes("pdf")) { iconClass = "pdf"; iconEmoji = "📕"; }
    else if (file.type?.includes("image")) { iconClass = "img"; iconEmoji = "🖼"; }

    return `
      <div class="file-view-card">
        <div class="file-view-icon ${iconClass}">${iconEmoji}</div>
        <div>
          <div class="file-view-name">${file.name}</div>
          <div class="file-view-meta">${sizeKB} KB · ${date}</div>
        </div>
        ${file.url || file.downloadURL
          ? `<a href="${file.url || file.downloadURL}" target="_blank" rel="noopener" class="file-view-btn">
               ↓ View / Download
             </a>`
          : `<span class="file-view-btn" style="opacity:0.4;cursor:default;">Not available</span>`
        }
      </div>
    `;
  }).join("");
}

// ─── Skills ───────────────────────────────────────────────────

function renderSkills(tags) {
  const section = document.getElementById("skills-section");
  const grid    = document.getElementById("skills-grid");
  if (!tags || tags.length === 0) {
    if (section) section.style.display = "none";
    return;
  }
  if (section) section.style.display = "";
  if (grid) {
    grid.innerHTML = tags.map(tag =>
      `<span class="skill-view-tag">${tag}</span>`
    ).join("");
  }
}

// ─── Scroll Observer (section reveal) ─────────────────────────

function setupScrollReveal() {
  const sections = document.querySelectorAll(".port-section");
  sections.forEach(s => {
    s.style.opacity = "0";
    s.style.transform = "translateY(32px)";
    s.style.transition = "opacity 0.65s ease, transform 0.65s ease";
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -60px 0px" });

  sections.forEach(s => observer.observe(s));
}

// ─── Nav scroll effect ─────────────────────────────────────────

function setupNav() {
  const nav = document.getElementById("view-nav");

  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 60);
  });

  // Default to dark mode on view page (matches branding)
  const savedTheme = localStorage.getItem("portify-theme");
  const toggleBtn  = document.getElementById("theme-toggle");
  const icon       = toggleBtn.querySelector(".theme-icon");

  if (savedTheme === "dark" || !savedTheme) {
    document.documentElement.classList.add("dark");
    icon.textContent = "☀️";
  } else {
    icon.textContent = "🌙";
  }

  toggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    icon.textContent = isDark ? "☀️" : "🌙";
    localStorage.setItem("portify-theme", isDark ? "dark" : "light");
  });

  // Share button
  document.getElementById("share-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const toast = document.getElementById("toast");
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2500);
    });
  });


}

// ─── Loader ───────────────────────────────────────────────────

function hideLoader() {
  const loader = document.getElementById("loader-screen");
  setTimeout(() => {
    loader.classList.add("hidden");
    setupScrollReveal();
  }, 400);
}