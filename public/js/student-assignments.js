// Student → read assignments and submit work (text and/or a file).
import {
  supabase,
  requireAuth,
  esc,
  fmtRelative,
  dateOnly,
  isOverdue,
  toast,
  setMessage,
  friendlyError,
  fetchAll,
  uploadFile,
  wireFileDownloads,
  initDropzone,
} from "./common.js";

const listEl = document.getElementById("assignments-list");
const modal = document.getElementById("submit-modal");
const modalTitle = document.getElementById("modal-title");
const submitForm = document.getElementById("submit-form");
const submitText = document.getElementById("submit-text");
const submitBtn = document.getElementById("submit-btn");
const submitMessage = document.getElementById("submit-message");
const fileInput = document.getElementById("file-input");
const preview = document.getElementById("file-preview");

const { user, profile } = await requireAuth("student");

let assignments = [];
let mySubmissions = [];
let activeAssignment = null;

initDropzone({
  area: document.getElementById("upload-area"),
  input: fileInput,
  preview,
  nameEl: document.getElementById("filename"),
  metaEl: document.getElementById("file-type"),
});
document.getElementById("browse-btn").addEventListener("click", () => fileInput.click());

/* ---------------- Load ---------------- */
async function load() {
  try {
    assignments = await fetchAll("assignments");
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("student_id", user.id);
    if (error) throw error;
    mySubmissions = data || [];
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">${esc(friendlyError(err))}</div>`;
    return;
  }
  render();
}

function render() {
  if (!assignments.length) {
    listEl.innerHTML = `<div class="empty-state">No assignments have been set yet.</div>`;
    return;
  }

  const byId = new Map(mySubmissions.map((s) => [s.assignment_id, s]));
  listEl.innerHTML = `<div class="grid-2">${assignments
    .map((a) => card(a, byId.get(a.id)))
    .join("")}</div>`;

  listEl.querySelectorAll("[data-submit]").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.submit));
  });
  wireFileDownloads(listEl);
}

function card(a, submission) {
  const overdue = isOverdue(a.due_date);

  let status;
  if (submission) status = `<span class="status-pill success">✓ Submitted</span>`;
  else if (overdue) status = `<span class="status-pill danger">Overdue</span>`;
  else status = `<span class="status-pill warning">To do</span>`;

  let action;
  if (submission) {
    action = `
      <div class="submission-item">
        <span class="meta-line">Turned in ${fmtRelative(submission.submitted_at)}</span>
        ${submission.content ? `<pre class="note-body">${esc(submission.content)}</pre>` : ""}
        ${
          submission.file_path
            ? `<div class="quick-actions">
                 <button class="btn btn-secondary" data-file="${esc(submission.file_path)}" data-bucket="submissions">
                   📎 ${esc(submission.file_name)}
                 </button>
               </div>`
            : ""
        }
      </div>`;
  } else {
    action = `<div class="quick-actions">
        <button class="btn btn-primary" data-submit="${esc(a.id)}">Submit work</button>
      </div>`;
  }

  return `
    <article class="assignment-card">
      <div class="hero-card-top">
        <span class="chip">${esc(a.subject || "General")}</span>
        ${status}
      </div>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.description)}</p>
      <div class="breadcrumbs">
        ${esc(a.created_by_name)} • Due ${a.due_date ? esc(dateOnly(a.due_date)) : "—"}
        ${a.total_marks ? ` • ${esc(a.total_marks)} marks` : ""}
      </div>
      ${action}
    </article>`;
}

/* ---------------- Modal ---------------- */
function openModal(assignmentId) {
  activeAssignment = assignments.find((a) => a.id === assignmentId);
  if (!activeAssignment) return;

  modalTitle.textContent = `Submit: ${activeAssignment.title}`;
  submitForm.reset();
  preview.style.display = "none";
  setMessage(submitMessage, "");
  modal.classList.add("open");
  submitText.focus();
}

function closeModal() {
  modal.classList.remove("open");
  activeAssignment = null;
}

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
});

/* ---------------- Submit ---------------- */
submitForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeAssignment) return;

  const text = submitText.value.trim();
  const file = fileInput.files[0];

  if (!text && !file) {
    setMessage(submitMessage, "Write an answer or attach a file before submitting.", "error");
    return;
  }

  submitBtn.disabled = true;
  setMessage(submitMessage, file ? "Uploading your work…" : "Submitting…");

  try {
    const fileData = file ? await uploadFile("submissions", file) : {};

    const { error } = await supabase.from("submissions").insert({
      assignment_id: activeAssignment.id,
      assignment_title: activeAssignment.title,
      student_id: user.id,
      student_name: profile.full_name || user.email,
      content: text,
      ...fileData,
    });
    if (error) throw error;

    closeModal();
    toast("Submission received");
    await load();
  } catch (err) {
    setMessage(submitMessage, friendlyError(err), "error");
  } finally {
    submitBtn.disabled = false;
  }
});

await load();
