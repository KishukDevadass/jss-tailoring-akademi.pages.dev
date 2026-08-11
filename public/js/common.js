// Shared helpers used by every page: auth guard, page chrome, formatting,
// toasts, and Supabase data/storage utilities.
import { supabase } from "./supabase-config.js";

export { supabase };

/* ------------------------------------------------------------------ *
 * Formatting                                                          *
 * ------------------------------------------------------------------ */

/** Escape a value for safe interpolation into innerHTML. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Postgres timestamptz -> "12 Aug 2026". */
export function fmtDate(value) {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Relative time, e.g. "2h ago". Falls back to a date for anything older. */
export function fmtRelative(value) {
  const d = toDate(value);
  if (!d) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  if (mins < 10080) return `${Math.round(mins / 1440)}d ago`;
  return fmtDate(value);
}

/** A due date is "overdue" once the day has fully passed. */
export function isOverdue(dueDate) {
  if (!dueDate) return false;
  const due = new Date(`${String(dueDate).slice(0, 10)}T23:59:59`);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

/** Render a date column as plain YYYY-MM-DD. */
export function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined || bytes === "") return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ------------------------------------------------------------------ *
 * Feedback                                                            *
 * ------------------------------------------------------------------ */

export function toast(message) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => node.classList.remove("show"), 2600);
}

/** Write a message into a form's inline status line. */
export function setMessage(el, text, kind = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("error", "success");
  if (kind) el.classList.add(kind);
}

/** Turn a Supabase/Postgres error into something a human can read. */
export function friendlyError(err) {
  const raw = String(err?.message || err || "Something went wrong.");
  const code = err?.code || "";

  if (code === "23505" || /duplicate key/i.test(raw)) {
    return "You've already submitted this one.";
  }
  if (code === "42501" || /row-level security|violates row-level/i.test(raw)) {
    return "You don't have permission to do that.";
  }
  if (/Invalid login credentials/i.test(raw)) return "Incorrect email or password.";
  if (/Email not confirmed/i.test(raw)) {
    return "Please confirm your email address first — check your inbox.";
  }
  if (/User already registered/i.test(raw)) {
    return "An account with that email already exists.";
  }
  if (/Password should be at least/i.test(raw)) {
    return "Password must be at least 6 characters.";
  }
  if (/Bucket not found/i.test(raw)) {
    return "File storage isn't set up yet — run schema.sql to create the buckets.";
  }
  if (/Failed to fetch|NetworkError/i.test(raw)) {
    return "Network problem — check your connection and Supabase URL.";
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * Auth guard + page chrome                                            *
 * ------------------------------------------------------------------ */

export function homeFor(role) {
  return role === "lecturer" ? "lecturer-dashboard.html" : "student-dashboard.html";
}

/**
 * Gate a page behind sign-in and (optionally) a role.
 * Resolves with { user, profile } once the visitor is allowed to be here;
 * otherwise redirects and never resolves.
 */
export async function requireAuth(requiredRole) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.replace("login.html");
    return new Promise(() => {});
  }

  const user = session.user;
  const profile = await loadProfile(user);

  if (!profile) {
    await supabase.auth.signOut();
    window.location.replace("login.html?error=profile");
    return new Promise(() => {});
  }

  if (requiredRole && profile.role !== requiredRole) {
    window.location.replace(homeFor(profile.role));
    return new Promise(() => {});
  }

  // Bounce to the login page if the session ends in another tab.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") window.location.replace("login.html");
  });

  paintChrome(user, profile);
  return { user, profile };
}

/**
 * Read the caller's profile row. The `handle_new_user` trigger normally
 * creates it at sign-up; if that trigger is missing we fall back to
 * building it from the user's auth metadata so the app still works.
 */
export async function loadProfile(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile", error);
    return null;
  }
  if (data) return data;

  const meta = user.user_metadata || {};
  const fallback = {
    id: user.id,
    full_name: meta.full_name || user.email,
    email: user.email,
    role: meta.role === "lecturer" ? "lecturer" : "student",
  };

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert(fallback)
    .select()
    .single();

  if (insertError) {
    console.error("Failed to create profile", insertError);
    return null;
  }
  return created;
}

/** Fill in the user chip, wire logout, highlight the active nav link. */
function paintChrome(user, profile) {
  const name = profile.full_name || user.email;

  document.querySelectorAll("[data-user-name]").forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll("[data-user-role]").forEach((el) => {
    el.textContent = profile.role === "lecturer" ? "Lecturer" : "Student";
  });
  document.querySelectorAll("[data-user-initials]").forEach((el) => {
    el.textContent = initials(name);
  });

  document.querySelectorAll("[data-logout]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      window.location.replace("login.html");
    });
  });

  const here = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === here);
  });

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
}

/* ------------------------------------------------------------------ *
 * Data helpers                                                        *
 * ------------------------------------------------------------------ */

/** Read a whole table, newest first. Throws so callers can show the error. */
export async function fetchAll(table, orderColumn = "created_at") {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order(orderColumn, { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Upload to a private bucket. Returns the columns to store on the row —
 * the path, not a URL, because links are signed on demand at download time.
 *
 * The upload is brokered by the /api/upload-url Worker, which checks the
 * caller's role and the file's size and extension before issuing a signed
 * URL, and picks the storage path itself. If Functions aren't running
 * (plain static hosting), this falls back to a direct RLS-guarded upload.
 */
export async function uploadFile(bucket, file) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ bucket, name: file.name, size: file.size, type: file.type }),
    }).catch(() => null);

    if (res?.ok) {
      const { path, token } = await res.json();
      const { error } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, file);
      if (error) throw error;
      return { file_path: path, file_name: file.name, file_size: file.size };
    }

    // The Worker ran and refused (too big, wrong type, wrong role) — surface
    // its reason rather than silently retrying a direct upload.
    if (res && res.status !== 404) {
      const { error: reason } = await res.json().catch(() => ({}));
      throw new Error(reason || "Upload was rejected.");
    }
  }

  // Fallback: no Functions runtime. Storage RLS still applies.
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${session?.user?.id || "anonymous"}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  return { file_path: path, file_name: file.name, file_size: file.size };
}

/** Mint a short-lived signed URL for a private file. */
export async function signedUrl(bucket, path, seconds = 120) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Wire up any `[data-file]` download buttons inside a container.
 * Each button carries the bucket and object path; the URL is signed on click
 * so nothing long-lived is ever embedded in the page.
 */
export function wireFileDownloads(container) {
  container.querySelectorAll("[data-file]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Preparing…";
      try {
        const url = await signedUrl(btn.dataset.bucket, btn.dataset.file);
        window.open(url, "_blank", "noopener");
      } catch (err) {
        toast(friendlyError(err));
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
}

/** Download a text note as a .txt file, no server round-trip needed. */
export function downloadText(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^\w.\- ]+/g, "_") || "notes.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Wire a drag & drop upload area to a hidden file input. */
export function initDropzone({ area, input, preview, nameEl, metaEl }) {
  if (!area || !input) return;

  const show = (file) => {
    if (!file) return;
    if (nameEl) nameEl.textContent = file.name;
    if (metaEl) metaEl.textContent = `${file.type || "Document"} · ${fmtBytes(file.size)}`;
    if (preview) preview.style.display = "block";
    area.classList.add("active");
  };

  area.addEventListener("click", (e) => {
    if (!e.target.closest("button, a")) input.click();
  });
  area.addEventListener("dragover", (e) => {
    e.preventDefault();
    area.classList.add("active");
  });
  area.addEventListener("dragleave", () => area.classList.remove("active"));
  area.addEventListener("drop", (e) => {
    e.preventDefault();
    area.classList.remove("active");
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      show(e.dataTransfer.files[0]);
    }
  });
  input.addEventListener("change", () => show(input.files[0]));
}
