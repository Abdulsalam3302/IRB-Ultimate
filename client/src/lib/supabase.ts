import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vite exposes environment values as strings; trim deployment whitespace once.
export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const publicKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
// The configured public key may be a legacy anon JWT or a modern sb_publishable_ key.
export const isSupabaseAuthEnabled = Boolean(supabaseUrl && publicKey);

export type SocialAuthProvider = "google" | "apple" | "linkedin_oidc";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseAuthEnabled) {
    throw new Error("Supabase auth is not configured");
  }
  if (!client) {
    client = createClient(supabaseUrl, publicKey, {
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
