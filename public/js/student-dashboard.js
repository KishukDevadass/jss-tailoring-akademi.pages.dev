// Student → overview of what's available and what's still outstanding.
import {
  supabase,
  requireAuth,
  esc,
  fmtDate,
  dateOnly,
  isOverdue,
  friendlyError,
  fetchAll,
} from "./common.js";

const { user } = await requireAuth("student");

const set = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const fill = (id, html) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
};

try {
  const [materials, assignments, subsResult] = await Promise.all([
    fetchAll("materials"),
    fetchAll("assignments"),
    supabase.from("submissions").select("assignment_id").eq("student_id", user.id),
  ]);

  if (subsResult.error) throw subsResult.error;

  const submittedIds = new Set((subsResult.data || []).map((s) => s.assignment_id));
  const pending = assignments.filter((a) => !submittedIds.has(a.id));

  set("metric-materials", materials.length);
  set("metric-assignments", assignments.length);
  set("metric-submitted", submittedIds.size);
  set("metric-pending", pending.length);

  /* Upcoming deadlines — outstanding work, soonest due date first. */
  const upcoming = [...pending].sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return String(a.due_date).localeCompare(String(b.due_date));
  });

  fill(
    "upcoming-assignments",
    upcoming.length
      ? upcoming
          .slice(0, 5)
          .map((a) => {
            const overdue = isOverdue(a.due_date);
            return `<li>
              <span>${esc(a.title)}<br /><span class="meta-line">${esc(
                a.subject || "General"
              )}</span></span>
              <span class="status-pill ${overdue ? "danger" : "warning"}">
                ${
                  overdue
                    ? "Overdue"
                    : a.due_date
                    ? `Due ${esc(dateOnly(a.due_date))}`
                    : "No due date"
                }
              </span>
            </li>`;
          })
          .join("")
      : `<li class="empty-state">Nothing outstanding — you're all caught up. 🎉</li>`
  );

  /* Latest materials */
  fill(
    "latest-materials",
    materials.length
      ? materials
          .slice(0, 5)
          .map(
            (m) => `<li>
              <span>${esc(m.title)}<br /><span class="meta-line">${esc(
                m.created_by_name
              )}</span></span>
              <span class="meta-line">${fmtDate(m.created_at)}</span>
            </li>`
          )
          .join("")
      : `<li class="empty-state">No materials published yet.</li>`
  );
} catch (err) {
  const msg = esc(friendlyError(err));
  ["upcoming-assignments", "latest-materials"].forEach((id) =>
    fill(id, `<li class="empty-state">${msg}</li>`)
  );
}
