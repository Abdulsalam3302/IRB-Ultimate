import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseAuthEnabled =
  typeof url === "string" &&
  url.length > 0 &&
  typeof anonKey === "string" &&
  anonKey.length > 0;

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
