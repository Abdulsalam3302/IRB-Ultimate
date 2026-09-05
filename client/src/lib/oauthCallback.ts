import type { SupabaseClient } from "@supabase/supabase-js";
import { bridgeSupabaseSession } from "./mfa";

type CallbackDependencies = {
  bridge?: (token: string) => Promise<void>;
  currentUrl?: () => string;
};
const failure = () => new Error("OAUTH_CALLBACK_FAILED");

/**
 * One callback attempt, including under repeated React effects. detectSessionInUrl
 * owns the PKCE exchange; manually exchanging after initialization reuses the code.
 */
export function createOAuthCallbackAttempt(
  client: Pick<SupabaseClient, "auth">,
  capturedUrl: string,
  {
    bridge = bridgeSupabaseSession,
    currentUrl = () => window.location.href,
  }: CallbackDependencies = {}
): () => Promise<void> {
  let attempt: Promise<void> | undefined;
  const complete = async () => {
    try {
      const original = new URL(capturedUrl);
      const fragment = new URLSearchParams(original.hash.slice(1));
      const codes = original.searchParams.getAll("code");
      if (
        codes.length !== 1 ||
        !codes[0].trim() ||
        codes[0].length > 4096 ||
        [original.searchParams, fragment].some(params =>
          [
            "error",
            "error_description",
            "error_code",
            "access_token",
            "refresh_token",
          ].some(key => params.has(key))
        ) ||
        fragment.has("code")
      )
        throw failure();

      // initialize() returns the existing initialization promise. Its error must be
      // checked: auth-js intentionally retains old sessions after a failed redirect.
      const initialized = await client.auth.initialize();
      if (initialized.error) throw failure();
      const current = new URL(currentUrl());
      // Missing PKCE verifiers can make initialization recover an old session with
      // error:null. A successful automatic exchange removes the original query code.
      if (
        current.origin !== original.origin ||
        current.pathname !== original.pathname ||
        current.searchParams.has("code")
      )
        throw failure();
      const session = await client.auth.getSession();
      if (
        session.error ||
        !session.data.session?.access_token ||
        !session.data.session.user?.id
      )
        throw failure();
      try {
        await bridge(session.data.session.access_token);
      } catch {
        // Clear the newly established provider session if the platform rejects it;
        // do not revoke sessions on other devices or claim application success.
        try {
          await client.auth.signOut({ scope: "local" });
        } catch {
          /* Generic failure below. */
        }
        throw failure();
      }
    } catch {
      // Never propagate provider messages, URL diagnostics or tokens to page content.
      throw failure();
    }
  };
  return () => (attempt ??= complete());
}

/** Remove callback credentials and provider diagnostics after the attempt settles. */
export function clearOAuthCallbackParameters(url: string): string {
  const cleaned = new URL(url);
  for (const key of [
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
    "code",
    "state",
    "sb_flow_id",
    "error",
    "error_code",
    "error_description",
  ])
    cleaned.searchParams.delete(key);
  cleaned.hash = "";
  return `${cleaned.pathname}${cleaned.search}`;
}
