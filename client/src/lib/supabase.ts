import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseUrl = typeof url === "string" ? url.trim() : "";

export const isSupabaseAuthEnabled =
  typeof url === "string" &&
  url.length > 0 &&
  typeof anonKey === "string" &&
  anonKey.length > 0;

/**
 * Probe whether the configured Supabase project actually exists and responds.
 * Used to decide whether to show the Google/Apple buttons — a deleted/paused
 * project (or a typo'd ref) should never render a dead-end social button. The
 * project's /auth/v1/health endpoint is public; a `no-cors` GET resolves for a
 * live host and rejects (DNS/network) for a dead one.
 */
export async function isSupabaseReachable(timeoutMs = 3500): Promise<boolean> {
  if (!isSupabaseAuthEnabled) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, {
      method: "GET",
      mode: "no-cors",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseAuthEnabled) {
    throw new Error("Supabase auth is not configured");
  }
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseAuthEnabled) return;
  try {
    await getSupabase().auth.signOut();
  } catch {
    /* session may already be cleared */
  }
}
