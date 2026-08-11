// Student → browse and download learning materials.
import {
  requireAuth,
  esc,
  fmtDate,
  fmtBytes,
  friendlyError,
  fetchAll,
  downloadText,
  wireFileDownloads,
  toast,
} from "./common.js";

const listEl = document.getElementById("materials-list");
const searchEl = document.getElementById("material-search");

await requireAuth("student");

let materials = [];

try {
  materials = await fetchAll("materials");
} catch (err) {
  listEl.innerHTML = `<div class="empty-state">${esc(friendlyError(err))}</div>`;
  throw err;
}

function render() {
  const term = (searchEl.value || "").toLowerCase().trim();
  const rows = term
    ? materials.filter((m) =>
        [m.title, m.subject, m.description, m.content, m.created_by_name]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
    : materials;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">${
      materials.length
        ? "No materials match that search."
        : "Your lecturers haven't published any materials yet."
    }</div>`;
    return;
  }

  listEl.innerHTML = rows.map(card).join("");

  listEl.querySelectorAll("[data-notes]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = materials.find((x) => x.id === btn.dataset.notes);
      if (!m) return;
      downloadText(`${m.title || "notes"}.txt`, m.content);
      toast("Notes downloaded");
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
      <div class="breadcrumbs">Lecturer • ${esc(m.created_by_name)} • ${fmtDate(m.created_at)}${
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
render();
