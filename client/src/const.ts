import { safeNextPath } from "@/lib/navigation";
import { isSupabaseAuthEnabled } from "@/lib/supabase";
export { COOKIE_NAME, ONE_YEAR_MS, SESSION_TTL_MS } from "@shared/const";

/**
 * The default /auth page opens directly to email and password sign-in.
 * Keep the legacy portal entry point when configured without connected auth;
 * its server route creates and validates the OAuth state nonce.
 * The optional destination is restricted to a safe same-origin path.
 */
export const getLoginUrl = (next?: string) => {
  const safeNext = safeNextPath(next, "");
  const legacyPortal = String(
    import.meta.env.VITE_OAUTH_PORTAL_URL || ""
  ).trim();
  const path =
    !isSupabaseAuthEnabled && legacyPortal ? "/api/oauth/start" : "/auth";
  const url = new URL(path, window.location.origin);
  if (safeNext) url.searchParams.set("next", safeNext);
  return url.toString();
};
