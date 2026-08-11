// Lecturer → overview metrics and recent activity, all from live data.
import {
  supabase,
  requireAuth,
  esc,
  fmtDate,
  fmtRelative,
  dateOnly,
  isOverdue,
  friendlyError,
  fetchAll,
} from "./common.js";

await requireAuth("lecturer");

const set = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const fill = (id, html) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
};

try {
  const [materials, assignments, subsResult, studentsResult] = await Promise.all([
    fetchAll("materials"),
    fetchAll("assignments"),
    supabase.from("submissions").select("*").order("submitted_at", { ascending: false }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student"),
  ]);

  if (subsResult.error) throw subsResult.error;
  const submissions = subsResult.data || [];

  set("metric-materials", materials.length);
  set("metric-assignments", assignments.length);
  set("metric-submissions", submissions.length);
  set("metric-students", studentsResult.count ?? 0);

  /* Recent submissions */
  fill(
    "recent-submissions",
    submissions.length
      ? submissions
          .slice(0, 5)
          .map(
            (s) => `<li>
              <span>${esc(s.student_name)}<br /><span class="meta-line">${esc(
                s.assignment_title || "Assignment"
              )}</span></span>
              <span class="meta-line">${fmtRelative(s.submitted_at)}</span>
            </li>`
          )
          .join("")
      : `<li class="empty-state">No submissions yet.</li>`
  );

  /* Assignments with submission counts */
  const counts = submissions.reduce((acc, s) => {
    acc[s.assignment_id] = (acc[s.assignment_id] || 0) + 1;
    return acc;
  }, {});

  fill(
    "recent-assignments",
    assignments.length
      ? assignments
          .slice(0, 5)
          .map((a) => {
            const n = counts[a.id] || 0;
            const closed = isOverdue(a.due_date);
            return `<li>
              <span>${esc(a.title)}<br /><span class="meta-line">Due ${
                a.due_date ? esc(dateOnly(a.due_date)) : "—"
              }</span></span>
              <span class="status-pill ${closed ? "danger" : n ? "success" : "warning"}">
                ${closed ? "Closed" : `${n} in`}
              </span>
            </li>`;
          })
          .join("")
      : `<li class="empty-state">No assignments yet.</li>`
  );

  /* Latest materials */
  fill(
    "recent-materials",
    materials.length
      ? materials
          .slice(0, 5)
          .map(
            (m) => `<li>
              <span>${esc(m.title)}<br /><span class="meta-line">${esc(
                m.subject || "General"
              )}</span></span>
              <span class="meta-line">${fmtDate(m.created_at)}</span>
            </li>`
          )
          .join("")
      : `<li class="empty-state">No materials yet.</li>`
  );
} catch (err) {
  const msg = esc(friendlyError(err));
  ["recent-submissions", "recent-assignments", "recent-materials"].forEach((id) =>
    fill(id, `<li class="empty-state">${msg}</li>`)
  );
}
