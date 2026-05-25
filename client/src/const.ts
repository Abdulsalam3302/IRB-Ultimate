export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Login URL. SA-02: the SPA no longer constructs the OAuth URL itself —
 * that previously embedded a base64'd redirectUri in `state`, which gave
 * no CSRF protection. Now we link to /api/oauth/start, which mints a
 * server-side nonce, sets it as a __Host- cookie, and 302s to the portal.
 * The callback then verifies the nonce in constant time before issuing a
 * session.
 *
 * Optional `next` is appended as a relative path; the server rejects
 * anything that doesn't begin with "/".
 */
export const getLoginUrl = (next?: string) => {
  const safeNext = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (
    typeof supabaseUrl === "string" &&
    supabaseUrl.trim() &&
    typeof supabaseKey === "string" &&
    supabaseKey.trim()
  ) {
    const url = new URL("/auth", window.location.origin);
    if (safeNext) url.searchParams.set("next", safeNext);
    return url.toString();
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;

  if (!oauthPortalUrl || String(oauthPortalUrl).trim() === "") {
    const url = new URL("/auth", window.location.origin);
    if (safeNext) url.searchParams.set("next", safeNext);
    return url.toString();
  }

  const url = new URL("/api/oauth/start", window.location.origin);
  if (safeNext) url.searchParams.set("next", safeNext);
  return url.toString();
};
