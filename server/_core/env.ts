const isProduction = process.env.NODE_ENV === "production";

// Guard rails — fail fast in production rather than silently boot with an
// empty/placeholder secret that any attacker can forge tokens against.
const PLACEHOLDER_SECRETS = new Set([
  "",
  "change-me",
  "change-me-to-a-strong-random-secret",
  "secret",
  "dev",
  "password",
]);
const rawJwtSecret = process.env.JWT_SECRET ?? "";
if (isProduction) {
  if (PLACEHOLDER_SECRETS.has(rawJwtSecret.trim()) || rawJwtSecret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 chars of strong randomness in production. " +
      "Generate with: openssl rand -hex 48"
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production");
  }
  if (!process.env.VITE_APP_ID) {
    throw new Error("VITE_APP_ID is required in production");
  }
}
if (!isProduction && rawJwtSecret.length < 16) {
  console.warn(
    "[env] JWT_SECRET is short (<16 chars). Set a strong secret before deploying."
  );
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: rawJwtSecret,
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  // OAuth portal the user is redirected to for the consent dance. Server-side
  // mirror of VITE_OAUTH_PORTAL_URL, used by /api/oauth/start so the SPA no
  // longer has to know the portal URL. Falls back to VITE_OAUTH_PORTAL_URL
  // when not separately set — same value in both is fine.
  oAuthPortalUrl: (process.env.OAUTH_PORTAL_URL ?? process.env.VITE_OAUTH_PORTAL_URL ?? "").trim(),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerEmail: (process.env.OWNER_EMAIL ?? "").trim().toLowerCase(),
  supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim(),
  supabaseEnabled: Boolean(
    (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim()
  ),
  isProduction,
  // SA-17: dev-login is OFF by default — devs must set DEV_LOGIN_ENABLED=1
  // explicitly. Previous code treated "unset" as enabled which made an SSH
  // port-forward a privilege-escalation surface. In production the flag is
  // always off regardless of env.
  devLoginEnabled: !isProduction && process.env.DEV_LOGIN_ENABLED === "1",
  // Optional shared secret required even from loopback. Set to anything
  // non-empty for an extra barrier against accidental tunnel exposure.
  // The POST /api/dev/login body must include `token: <this value>` when
  // set; the GET landing page reads it from a hidden field.
  devLoginToken: (process.env.DEV_LOGIN_TOKEN ?? "").trim(),
  // Token-guarded pilot/demo login for controlled pilots. Requires
  // PILOT_LOGIN_ENABLED=1 and a strong PILOT_LOGIN_TOKEN (>= 32 chars,
  // enforced in devLogin.ts). Only active when neither Supabase nor OAuth
  // is configured. NOTE: the former PUBLIC_SIGNIN_ENABLED mode (open
  // passwordless sign-in in production) has been removed for security —
  // use Supabase, OAuth, or native email/password auth instead.
  pilotLoginEnabled:
    isProduction &&
    process.env.PILOT_LOGIN_ENABLED === "1" &&
    !((process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim()) &&
    (!process.env.OAUTH_SERVER_URL || process.env.OAUTH_SERVER_URL.trim() === ""),
  pilotLoginToken: (process.env.PILOT_LOGIN_TOKEN ?? "").trim(),
  // Canonical public URL (Vercel) — used for OAuth redirect URIs behind split deploy.
  publicAppUrl: (process.env.PUBLIC_APP_URL ?? process.env.VITE_PUBLIC_SITE_URL ?? "").trim(),
  // Optional explicit allow-list for CORS / origin validation on
  // cookie-bound endpoints. Comma-separated list of origins.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),

  // Forge gateway — used for non-LLM features (S3 proxy, data API,
  // push notifications, maps). Keep set to your Forge install.
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // LLM endpoint — falls back to forge* when LLM_* aren't set.
  // This lets you point AI review at MiniMax / OpenAI / Anthropic
  // while keeping Forge for everything else.
  llmApiUrl:
    process.env.LLM_API_URL?.trim() || process.env.BUILT_IN_FORGE_API_URL || "",
  llmApiKey:
    process.env.LLM_API_KEY?.trim() || process.env.BUILT_IN_FORGE_API_KEY || "",
  llmModel: process.env.LLM_MODEL ?? "MiniMax-M2",
  llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS ?? "8192", 10),
  llmProvider: (process.env.LLM_PROVIDER ?? "openai").toLowerCase(),

  // Literature & evidence sources — used to cross-check submitted
  // protocols against existing trials and prior art. All optional;
  // any missing source silently degrades.
  pubmedApiKey: process.env.PUBMED_API_KEY?.trim() || undefined,
  semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY?.trim() || undefined,
  openAlexApiKey: process.env.OPENALEX_API_KEY?.trim() || undefined,
  elicitApiKey: process.env.ELICIT_API_KEY?.trim() || undefined,
  // Elicit endpoint is partner-gated; provide once support confirms.
  elicitApiUrl: process.env.ELICIT_API_URL?.trim() || undefined,
};
