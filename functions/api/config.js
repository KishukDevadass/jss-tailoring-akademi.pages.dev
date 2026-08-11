// GET /api/config
//
// Hands the browser the Supabase project URL and anon key from Pages
// environment variables, so they don't have to be committed to the repo.
// Neither value is secret — Row Level Security is what protects the data —
// but keeping them in env means the same build works across environments.

export function onRequestGet({ env }) {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return json(
      { error: "SUPABASE_URL and SUPABASE_ANON_KEY are not set for this environment." },
      500
    );
  }

  return json({ url, anonKey }, 200, {
    // Config changes rarely; let the browser reuse it for a minute.
    "Cache-Control": "public, max-age=60",
  });
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
