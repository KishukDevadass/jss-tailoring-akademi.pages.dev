// POST /api/upload-url
//
// Issues a short-lived signed upload URL for Supabase Storage.
//
// Why this lives on the edge rather than in the browser: Row Level Security
// can gate *who* may write to a bucket, but it can't see a file's size, name
// or content type. This Worker checks all of that before handing back a URL,
// and it does so with the service-role key, which never reaches the client.
//
// Request : { bucket: "materials" | "submissions", name, size, type }
// Response: { path, token }  ->  client calls uploadToSignedUrl(path, token, file)
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_EXTENSIONS = [
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "txt", "md", "csv", "rtf",
  "png", "jpg", "jpeg", "gif", "webp", "svg",
  "zip", "mp4", "mov", "mp3",
];

// Which role owns which bucket.
const BUCKET_ROLE = {
  materials: "lecturer",
  submissions: "student",
};

export async function onRequestPost({ request, env }) {
  const missing = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (k) => !env[k]
  );
  if (missing.length) {
    return json({ error: `Server is missing: ${missing.join(", ")}` }, 500);
  }

  /* ---- 1. Who is asking? ---- */
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in." }, 401);

  const user = await getUser(env, token);
  if (!user) return json({ error: "Your session has expired — please sign in again." }, 401);

  /* ---- 2. What are they asking for? ---- */
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  const { bucket, name, size, type } = body || {};

  if (!BUCKET_ROLE[bucket]) return json({ error: "Unknown bucket." }, 400);
  if (typeof name !== "string" || !name.trim()) return json({ error: "Missing file name." }, 400);
  if (!Number.isFinite(size) || size <= 0) return json({ error: "Missing file size." }, 400);

  if (size > MAX_BYTES) {
    return json({ error: `That file is too large — the limit is ${MAX_BYTES / 1024 / 1024} MB.` }, 413);
  }

  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return json({ error: `.${ext} files aren't allowed.` }, 415);
  }

  /* ---- 3. Is their role allowed to write here? ---- */
  const role = await getRole(env, user.id);
  if (role !== BUCKET_ROLE[bucket]) {
    return json({ error: "You don't have permission to upload here." }, 403);
  }

  /* ---- 4. Mint the signed upload URL ---- */
  // The path is built server-side and always starts with the caller's user id,
  // which is what the storage read policies key off. The client can't choose it.
  const safeName =
    name
      .replace(/[^\w.\-]+/g, "_") // separators and anything exotic become "_"
      .replace(/\.{2,}/g, ".") // no ".." runs
      .slice(-80)
      .replace(/^[.\-_]+/, "") || "file";

  const path = `${user.id}/${Date.now()}_${safeName}`;

  const signed = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${encodeURI(path)}`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 120 }),
    }
  );

  if (!signed.ok) {
    const detail = await signed.text();
    console.error("Signed upload URL failed", signed.status, detail);
    return json({ error: "Could not prepare the upload. Please try again." }, 502);
  }

  // Supabase returns { url: "/object/upload/sign/<bucket>/<path>?token=<jwt>" }
  const { url } = await signed.json();
  const signToken = new URL(url, env.SUPABASE_URL).searchParams.get("token");

  if (!signToken) {
    return json({ error: "Could not prepare the upload. Please try again." }, 502);
  }

  return json({ path, token: signToken, contentType: type || "application/octet-stream" });
}

/* ------------------------------------------------------------------ */

/** Validate the caller's access token against Supabase and return the user. */
async function getUser(env, accessToken) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

/** Read the caller's role. Uses the service key so RLS can't hide the row. */
async function getRole(env, userId) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.role ?? null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
