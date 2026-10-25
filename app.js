(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.SLH_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("PASTE_") && !config.SUPABASE_ANON_KEY.includes("PASTE_");
  const client = configured && window.supabase ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  let currentUser = null, isAdmin = false, notes = [], timerInterval = null, seconds = 25 * 60;

  $("year").textContent = new Date().getFullYear();
  $("menuToggle").addEventListener("click", () => $("nav").classList.toggle("open"));
  $("nav").querySelectorAll("a").forEach(a => a.addEventListener("click", () => $("nav").classList.remove("open")));

  function status(message, isError=false) {
    $("authStatus").textContent = message;
    $("authStatus").style.color = isError ? "#b42318" : "";
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function showSignedIn(user) {
    currentUser = user;
    $("signInBtn").classList.toggle("hidden", !!user);
    $("signOutBtn").classList.toggle("hidden", !user);
    if (user) status(`Signed in as ${user.email || "Google user"}.`);
    updateSavedCount();
  }
  async function checkAdmin() {
    isAdmin = false;
    if (!client || !currentUser) return;
    const { data, error } = await client.from("admins").select("user_id").eq("user_id", currentUser.id).maybeSingle();
    if (!error && data) isAdmin = true;
    $("adminSection").classList.toggle("hidden", !isAdmin);
    if (isAdmin) renderAdminNotes();
  }
  async function loadNotes() {
    if (!client) {
      $("notesGrid").innerHTML = '<div class="empty-state"><b>Setup required</b><br>Connect Supabase using SETUP.md to load published notes. Student tools work without an account.</div>';
      $("notesCount").textContent = "0";
      return;
    }
    const { data, error } = await client.from("notes").select("id,title,course,semester,subject,description,file_path,created_at").eq("published", true).order("created_at", { ascending: false });
    if (error) {
      $("notesGrid").innerHTML = '<div class="empty-state">Study library could not load. Check the Supabase setup and database policies.</div>';
      console.error(error);
      return;
    }
    notes = data || [];
    $("notesCount").textContent = String(notes.length);
    renderNotes();
    if (isAdmin) renderAdminNotes();
  }
  function renderNotes() {
    const q = $("searchInput").value.trim().toLowerCase();
    const course = $("courseFilter").value, semester = $("semesterFilter").value;
    const filtered = notes.filter(n => (!course || n.course === course) && (!semester || n.semester === semester) &&
      [n.title,n.subject,n.description,n.course,n.semester].some(v => String(v || "").toLowerCase().includes(q)));
    if (!filtered.length) {
      $("notesGrid").innerHTML = `<div class="empty-state">${notes.length ? "No notes match your search." : "No notes published yet. The Admin can add the first PDF from the Admin Panel."}</div>`;
      return;
    }
    $("notesGrid").innerHTML = filtered.map(n => `<article class="note-card"><div class="note-icon">▤</div><div class="note-meta"><span class="pill">${escapeHTML(n.course)}</span><span class="pill">${escapeHTML(n.semester)}</span></div><h3>${escapeHTML(n.title)}</h3><p>${escapeHTML(n.description || n.subject || "Study resource")}</p><p><b>Subject:</b> ${escapeHTML(n.subject)}</p><button class="btn btn-primary" data-open-note="${escapeHTML(n.id)}">Open PDF ↗</button></article>`).join("");
    $("notesGrid").querySelectorAll("[data-open-note]").forEach(btn => btn.addEventListener("click", () => openNote(btn.dataset.openNote)));
  }
  async function openNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note || !client) return;
    const { data, error } = await client.storage.from("notes-pdfs").createSignedUrl(note.file_path, 60);
    if (error || !data?.signedUrl) { alert("PDF could not be opened. Please contact the site admin."); console.error(error); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  function getSaved() { try { return JSON.parse(localStorage.getItem("slh_saved_notes") || "[]"); } catch { return []; } }
  function updateSavedCount() { $("savedCount").textContent = String(getSaved().length); }
  async function signIn() {
    if (!client) { alert("First follow SETUP.md to connect Supabase. Do not put any secret/service_role key in config.js."); return; }
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
    if (error) alert("Google sign-in could not start: " + error.message);
  }
  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) alert("Sign out failed: " + error.message);
    showSignedIn(null); isAdmin = false; $("adminSection").classList.add("hidden");
  }
  async function handleUpload(event) {
    event.preventDefault();
    if (!client || !currentUser || !isAdmin) { alert("Admin access required."); return; }
    const file = $("noteFile").files[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { alert("Please choose a PDF file."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("PDF must be 10 MB or smaller."); return; }
    const button = $("uploadBtn"); button.disabled = true; button.textContent = "Uploading…"; $("uploadStatus").textContent = "";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
    try {
      const upload = await client.storage.from("notes-pdfs").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw upload.error;
      const insert = await client.from("notes").insert({
        title: $("noteTitle").value.trim(), course: $("noteCourse").value,
        semester: $("noteSemester").value, subject: $("noteSubject").value.trim(),
        description: $("noteDescription").value.trim(), file_path: path,
        uploaded_by: currentUser.id, published: true
      });
      if (insert.error) {
        await client.storage.from("notes-pdfs").remove([path]);
        throw insert.error;
      }
      $("uploadForm").reset(); $("uploadStatus").textContent = "PDF uploaded and published.";
      await loadNotes();
    } catch (err) {
      console.error(err); $("uploadStatus").textContent = "Upload failed. Check SETUP.md, storage policies and file size.";
      alert("Upload failed: " + (err.message || "Please check setup."));
    } finally { button.disabled = false; button.textContent = "Upload and publish PDF"; }
  }
  async function renderAdminNotes() {
    if (!isAdmin || !client) return;
    const host = $("adminNotesList");
    host.innerHTML = '<p class="status">Loading notes…</p>';
    const { data, error } = await client.from("notes").select("id,title,course,semester,subject,file_path").order("created_at", { ascending: false });
    if (error) { host.textContent = "Could not load admin notes. Check admin policies."; return; }
    if (!data?.length) { host.innerHTML = '<div class="empty-state">No notes to manage yet.</div>'; return; }
    host.innerHTML = data.map(n => `<div class="admin-note-row"><div><b>${escapeHTML(n.title)}</b><small>${escapeHTML(n.course)} · ${escapeHTML(n.semester)} · ${escapeHTML(n.subject)}</small></div><button class="delete-btn" data-delete-note="${escapeHTML(n.id)}">Delete</button></div>`).join("");
    host.querySelectorAll("[data-delete-note]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Delete this note and its PDF? This cannot be undone.")) return;
      const note = data.find(n => n.id === btn.dataset.deleteNote);
      const { error: dbErr } = await client.from("notes").delete().eq("id", note.id);
      if (dbErr) { alert("Delete failed. Check Admin policies."); console.error(dbErr); return; }
      const { error: storageErr } = await client.storage.from("notes-pdfs").remove([note.file_path]);
      if (storageErr) console.error("Storage cleanup failed:", storageErr);
      await loadNotes(); await renderAdminNotes();
    }));
  }
  $("signInBtn").addEventListener("click", signIn);
  $("signOutBtn").addEventListener("click", signOut);
  $("uploadForm").addEventListener("submit", handleUpload);
  ["searchInput","courseFilter","semesterFilter"].forEach(id => $(id).addEventListener(id === "searchInput" ? "input" : "change", renderNotes));

  $("calcPercent").addEventListener("click", () => {
    const got = Number($("marksObtained").value), total = Number($("marksTotal").value);
    $("percentResult").textContent = total > 0 && got >= 0 && got <= total ? `${(got/total*100).toFixed(2)}%` : "Enter valid marks (obtained must not exceed total).";
  });
  $("calcAttendance").addEventListener("click", () => {
    const got = Number($("classesAttended").value), total = Number($("classesHeld").value);
    $("attendanceResult").textContent = total > 0 && got >= 0 && got <= total ? `${(got/total*100).toFixed(2)}% attendance` : "Enter valid class counts.";
  });
  function renderTimer() { $("timerDisplay").textContent = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`; }
  $("timerStart").addEventListener("click", () => {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; $("timerStart").textContent = "Resume"; $("timerStatus").textContent = "Paused"; return; }
    $("timerStart").textContent = "Pause"; $("timerStatus").textContent = "Focus time — you can do it.";
    timerInterval = setInterval(() => { seconds--; renderTimer(); if (seconds <= 0) { clearInterval(timerInterval); timerInterval = null; $("timerStart").textContent = "Start again"; $("timerStatus").textContent = "Session complete. Take a short break."; } }, 1000);
  });
  $("timerReset").addEventListener("click", () => { clearInterval(timerInterval); timerInterval = null; seconds = 25*60; renderTimer(); $("timerStart").textContent = "Start"; $("timerStatus").textContent = ""; });
  renderTimer(); updateSavedCount();

  if (!client) {
    status("Setup needed: connect Supabase using SETUP.md.", true);
    $("notesGrid").innerHTML = '<div class="empty-state"><b>Supabase setup required</b><br>Follow SETUP.md to enable Google login, database and Admin PDF uploads. Calculators and timer work now.</div>';
    $("notesCount").textContent = "0";
  } else {
    client.auth.getSession().then(({ data }) => {
      showSignedIn(data.session?.user || null);
      return checkAdmin();
    }).then(loadNotes);
    client.auth.onAuthStateChange((_event, session) => {
      // Defer database work so it does not run inside the auth callback.
      setTimeout(async () => { showSignedIn(session?.user || null); await checkAdmin(); await loadNotes(); }, 0);
    });
  }
})();
