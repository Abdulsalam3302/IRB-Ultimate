export const COOKIE_NAME = "app_session_id";
// OAuth state-binding nonce cookie. The __Host- prefix forces Secure + no
// Domain attribute + Path=/, so this cookie can only be set/read on HTTPS
// over an exact host match — exactly what we want for CSRF state binding.
// In non-HTTPS local dev we drop the prefix (browsers reject __Host- without
// Secure) — see oauth.ts for the dev-only "oauth_state" fallback name.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";
export const OAUTH_STATE_COOKIE_DEV = "oauth_state";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Legacy alias — prefer SESSION_TTL_MS for new auth paths. */
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const APP_VERSION = "2.1.0";
/** Session lifetime (stateless JWT). Shorter than a year reduces stolen-cookie impact. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
/** Short-lived public certificate download URLs (S3/Forge). */
export const CERT_DOWNLOAD_TTL_SEC = 5 * 60;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
