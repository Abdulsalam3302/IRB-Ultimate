import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSupabaseAuthEnabled,
  supabaseUrl,
  type SocialAuthProvider,
} from "./supabase";
import { bridgeSupabaseSession } from "./mfa";

export type InstitutionalAuthCapabilities = {
  available: boolean;
  email: boolean;
  socialProviders: SocialAuthProvider[];
};

const unavailable: InstitutionalAuthCapabilities = {
  available: false,
  email: false,
  socialProviders: [],
};

/** Only advertised, enabled methods are offered; provider reachability alone is insufficient. */
export async function getInstitutionalAuthCapabilities(
  timeoutMs = 3500
): Promise<InstitutionalAuthCapabilities> {
  if (!isSupabaseAuthEnabled) return unavailable;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY.trim() },
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) return unavailable;
    const settings = (await response.json()) as {
      external?: Record<string, unknown>;
    };
    return {
      available: true,
      email: settings.external?.email === true,
      socialProviders: (["google", "apple", "linkedin_oidc"] as const).filter(
        provider => settings.external?.[provider] === true
      ),
    };
  } catch {
    return unavailable;
  } finally {
    clearTimeout(timer);
  }
}

export type InstitutionalSignInResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "INVALID_CREDENTIALS"
        | "RATE_LIMITED"
        | "NETWORK_ERROR"
        | "SESSION_BRIDGE_FAILED"
        | "SIGNIN_FAILED";
    };

/** Signs in an existing provider identity. It never registers, links, or assigns a platform role. */
export async function signInInstitutional(
  client: Pick<SupabaseClient, "auth">,
  email: string,
  password: string,
  bridge: (token: string) => Promise<void> = bridgeSupabaseSession
): Promise<InstitutionalSignInResult> {
  let result;
  try {
    result = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
  if (result.error) {
    // Never reflect provider messages, account details, or request contents into the UI.
    const code =
      result.error.status === 429
        ? "RATE_LIMITED"
        : result.error.code === "invalid_credentials"
          ? "INVALID_CREDENTIALS"
          : "SIGNIN_FAILED";
    return { ok: false, code };
  }
  const session = result.data.session;
  if (
    !session?.access_token ||
    !session.user?.id ||
    session.user.id !== result.data.user?.id
  ) {
    return { ok: false, code: "SIGNIN_FAILED" };
  }
  try {
    // The server validates the user JWT, issuer and AAL before issuing the application cookie.
    await bridge(session.access_token);
    return { ok: true };
  } catch {
    // Avoid leaving the browser signed into a new identity after the application rejected it.
    try {
      await client.auth.signOut({ scope: "local" });
    } catch {
      /* No platform success was reported. */
    }
    return { ok: false, code: "SESSION_BRIDGE_FAILED" };
  }
}
