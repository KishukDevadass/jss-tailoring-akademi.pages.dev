// Lecturer → upload and browse learning materials.
import {
  supabase,
  requireAuth,
  esc,
  fmtDate,
  fmtBytes,
  toast,
  setMessage,
  friendlyError,
  fetchAll,
  uploadFile,
  downloadText,
  wireFileDownloads,
  initDropzone,
} from "./common.js";

const form = document.getElementById("material-form");
const message = document.getElementById("material-message");
const submitBtn = document.getElementById("material-submit");
const listEl = document.getElementById("materials-list");
const searchEl = document.getElementById("material-search");
const fileInput = document.getElementById("file-input");
const preview = document.getElementById("file-preview");

const { user, profile } = await requireAuth("lecturer");

let materials = [];

initDropzone({
  area: document.getElementById("upload-area"),
  input: fileInput,
  preview,
  nameEl: document.getElementById("filename"),
  metaEl: document.getElementById("file-type"),
});
document.getElementById("browse-btn").addEventListener("click", () => fileInput.click());

form.addEventListener("reset", () => {
  preview.style.display = "none";
  setMessage(message, "");
  document.getElementById("upload-area").classList.remove("active");
});

/* ---------------- Create ---------------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("material-title").value.trim();
  const subject = document.getElementById("material-subject").value.trim();
  const description = document.getElementById("material-desc").value.trim();
  const content = document.getElementById("material-content").value.trim();
  const file = fileInput.files[0];

  if (!content && !file) {
    setMessage(message, "Add some notes or attach a file before publishing.", "error");
    return;
  }

  submitBtn.disabled = true;
  setMessage(message, file ? "Uploading file…" : "Publishing…");

  try {
    const fileData = file ? await uploadFile("materials", file) : {};

    const { error } = await supabase.from("materials").insert({
      title,
      subject,
      description,
      content,
      ...fileData,
      created_by: user.id,
      created_by_name: profile.full_name || user.email,
    });
    if (error) throw error;

    form.reset();
    preview.style.display = "none";
    setMessage(message, "");
    toast("Material published");
    await load();
  } catch (err) {
    setMessage(message, friendlyError(err), "error");
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- List ---------------- */
async function load() {
  try {
    materials = await fetchAll("materials");
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">${esc(friendlyError(err))}</div>`;
    return;
  }
  render();
}

function render() {
  const term = (searchEl.value || "").toLowerCase().trim();
  const rows = term
    ? materials.filter((m) =>
        [m.title, m.subject, m.description, m.content]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
    : materials;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">${
      materials.length ? "No materials match that search." : "No materials published yet."
    }</div>`;
    return;
  }

  listEl.innerHTML = rows.map(card).join("");

  listEl.querySelectorAll("[data-notes]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = materials.find((x) => x.id === btn.dataset.notes);
      if (m) downloadText(`${m.title || "notes"}.txt`, m.content);
    });
  });
  wireFileDownloads(listEl);
}

function card(m) {
  const kind = m.file_name ? m.file_name.split(".").pop().toUpperCase() : "Notes";
  return `
    <article class="material-card">
      <div class="hero-card-top">
        <span class="chip">${esc(m.subject || "General")}</span>
        <span class="chip chip-gold">${esc(kind)}</span>
      </div>
      <h3>${esc(m.title)}</h3>
      ${m.description ? `<p>${esc(m.description)}</p>` : ""}
      ${m.content ? `<pre class="note-body">${esc(m.content)}</pre>` : ""}
      <div class="breadcrumbs">${esc(m.created_by_name)} • ${fmtDate(m.created_at)}${
        m.file_size ? ` • ${fmtBytes(m.file_size)}` : ""
      }</div>
      <div class="quick-actions">
        ${
          m.file_path
            ? `<button class="btn btn-primary" data-file="${esc(m.file_path)}" data-bucket="materials">Download file</button>`
            : ""
        }
        ${m.content ? `<button class="btn btn-secondary" data-notes="${esc(m.id)}">Download notes</button>` : ""}
      </div>
    </article>`;
}

searchEl.addEventListener("input", render);
await load();
