import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseUrl = typeof url === "string" ? url.trim() : "";

export const isSupabaseAuthEnabled =
  typeof url === "string" &&
  url.length > 0 &&
  typeof anonKey === "string" &&
  anonKey.length > 0;

export type SocialAuthProvider = "google" | "apple" | "linkedin_oidc";

/** A reachable host does not prove an OAuth provider is enabled. */
export async function getAvailableAuthProviders(timeoutMs = 3500): Promise<SocialAuthProvider[]> {
  if (!isSupabaseAuthEnabled) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey! },
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) return [];
    const settings = await response.json() as { external?: Record<string, unknown> };
    return (["google", "apple", "linkedin_oidc"] as const).filter(provider => settings.external?.[provider] === true);
  } catch { return []; }
  finally { clearTimeout(timer); }
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
