// Lecturer → every submission, grouped under its assignment.
import {
  supabase,
  requireAuth,
  esc,
  fmtRelative,
  fmtBytes,
  dateOnly,
  friendlyError,
  fetchAll,
  wireFileDownloads,
} from "./common.js";

const listEl = document.getElementById("submissions-list");

await requireAuth("lecturer");

let assignments = [];
let submissions = [];

try {
  assignments = await fetchAll("assignments");
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  submissions = data || [];
} catch (err) {
  listEl.innerHTML = `<div class="empty-state">${esc(friendlyError(err))}</div>`;
  throw err;
}

/* ---------------- Metrics ---------------- */
const isLate = (s, a) =>
  !!a?.due_date && new Date(s.submitted_at) > new Date(`${dateOnly(a.due_date)}T23:59:59`);

const byAssignment = new Map(assignments.map((a) => [a.id, a]));
const lateCount = submissions.filter((s) => isLate(s, byAssignment.get(s.assignment_id))).length;

document.getElementById("metric-total").textContent = submissions.length;
document.getElementById("metric-assignments").textContent = assignments.length;
document.getElementById("metric-students").textContent = new Set(
  submissions.map((s) => s.student_id)
).size;
document.getElementById("metric-late").textContent = lateCount;

/* ---------------- Render ---------------- */
if (!assignments.length) {
  listEl.innerHTML = `<div class="empty-state">No assignments yet. Create one to start collecting work.</div>`;
} else {
  listEl.innerHTML = assignments.map(section).join("");
  wireFileDownloads(listEl);
}

function section(a) {
  const mine = submissions.filter((s) => s.assignment_id === a.id);

  const body = mine.length
    ? mine.map((s) => row(s, a)).join("")
    : `<div class="empty-state">No submissions for this assignment yet.</div>`;

  return `
    <section class="card" style="margin-bottom: 18px;">
      <div class="page-header">
        <h3>${esc(a.title)}</h3>
        <span class="status-pill ${mine.length ? "success" : "warning"}">
          ${mine.length} submission${mine.length === 1 ? "" : "s"}
        </span>
      </div>
      <div class="breadcrumbs" style="margin-bottom: 10px;">
        ${esc(a.subject || "General")} • Due ${a.due_date ? esc(dateOnly(a.due_date)) : "—"}
      </div>
      ${body}
    </section>`;
}

function row(s, a) {
  const late = isLate(s, a);
  return `
    <div class="submission-item">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
        <strong>${esc(s.student_name)}</strong>
        <span class="status-pill ${late ? "danger" : "success"}">
          ${late ? "Late" : "On time"} • ${fmtRelative(s.submitted_at)}
        </span>
      </div>
      ${s.content ? `<pre class="note-body">${esc(s.content)}</pre>` : ""}
      ${
        s.file_path
          ? `<div class="quick-actions">
               <button class="btn btn-secondary" data-file="${esc(s.file_path)}" data-bucket="submissions">
                 📎 ${esc(s.file_name)}${s.file_size ? ` (${fmtBytes(s.file_size)})` : ""}
               </button>
             </div>`
          : ""
      }
    </div>`;
}
