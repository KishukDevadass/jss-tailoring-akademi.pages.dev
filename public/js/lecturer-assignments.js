// Lecturer → create assignments and see how many students have submitted.
import {
  supabase,
  requireAuth,
  esc,
  fmtDate,
  dateOnly,
  isOverdue,
  toast,
  setMessage,
  friendlyError,
  fetchAll,
} from "./common.js";

const form = document.getElementById("assignment-form");
const message = document.getElementById("assignment-message");
const submitBtn = document.getElementById("assignment-submit");
const listEl = document.getElementById("assignments-list");

const { user, profile } = await requireAuth("lecturer");

/* ---------------- Create ---------------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("assignment-title").value.trim();
  const subject = document.getElementById("assignment-subject").value.trim();
  const description = document.getElementById("assignment-desc").value.trim();
  const dueDate = document.getElementById("assignment-due").value;
  const marksRaw = document.getElementById("assignment-marks").value;

  submitBtn.disabled = true;
  setMessage(message, "Creating assignment…");

  try {
    const { error } = await supabase.from("assignments").insert({
      title,
      subject,
      description,
      due_date: dueDate || null,
      total_marks: marksRaw ? Number(marksRaw) : null,
      created_by: user.id,
      created_by_name: profile.full_name || user.email,
    });
    if (error) throw error;

    form.reset();
    setMessage(message, "");
    toast("Assignment created");
    await load();
  } catch (err) {
    setMessage(message, friendlyError(err), "error");
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- List ---------------- */
async function load() {
  let assignments;
  let submissions = [];

  try {
    assignments = await fetchAll("assignments");
    const { data, error } = await supabase.from("submissions").select("assignment_id");
    if (error) throw error;
    submissions = data || [];
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">${esc(friendlyError(err))}</div>`;
    return;
  }

  if (!assignments.length) {
    listEl.innerHTML = `<div class="empty-state">No assignments yet — create your first one above.</div>`;
    return;
  }

  const counts = submissions.reduce((acc, s) => {
    acc[s.assignment_id] = (acc[s.assignment_id] || 0) + 1;
    return acc;
  }, {});

  listEl.innerHTML = assignments.map((a) => card(a, counts[a.id] || 0)).join("");
}

function card(a, count) {
  const overdue = isOverdue(a.due_date);
  const pill = `<span class="status-pill ${overdue ? "danger" : "success"}">${
    overdue ? "Closed" : "Open"
  }</span>`;

  return `
    <article class="assignment-card">
      <div class="hero-card-top">
        <span class="chip">${esc(a.subject || "General")}</span>
        ${pill}
      </div>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.description)}</p>
      <div class="breadcrumbs">
        Due ${a.due_date ? esc(dateOnly(a.due_date)) : "—"}
        ${a.total_marks ? ` • ${esc(a.total_marks)} marks` : ""}
        • Created ${fmtDate(a.created_at)}
      </div>
      <div class="quick-actions">
        <span class="status-pill ${count ? "success" : "warning"}">
          ${count} submission${count === 1 ? "" : "s"}
        </span>
        <a class="btn btn-secondary" href="lecturer-submissions.html">Review</a>
      </div>
    </article>`;
}

await load();
