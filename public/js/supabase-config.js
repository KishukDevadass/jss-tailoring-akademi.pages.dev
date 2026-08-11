// Supabase client.
//
// On Cloudflare Pages the project URL and anon key come from `/api/config`,
// which reads them from the Pages environment variables — so nothing has to
// be committed here. When the site is served as plain static files (no
// Functions running), it falls back to the constants below.
//
// Neither value is secret: Row Level Security is what protects the data.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Used only when /api/config isn't available (e.g. `npx serve .`).
const FALLBACK_URL = "https://YOUR_PROJECT_REF.supabase.co";
const FALLBACK_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";

async function resolveConfig() {
  try {
    const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (res.ok) {
      const { url, anonKey } = await res.json();
      if (url && anonKey) return { url, anonKey };
    }
  } catch {
    // No Functions runtime — fall through to the constants.
  }
  return { url: FALLBACK_URL, anonKey: FALLBACK_ANON_KEY };
}

const { url, anonKey } = await resolveConfig();

export const supabase = createClient(url, anonKey);
