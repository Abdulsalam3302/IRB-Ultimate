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
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const safeNext = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : "";

  if (!oauthPortalUrl || String(oauthPortalUrl).trim() === "") {
    return `${window.location.origin}/api/sign-in`;
  }

  const url = new URL("/api/oauth/start", window.location.origin);
  if (safeNext) url.searchParams.set("next", safeNext);
  return url.toString();
};
