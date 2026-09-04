import type { Express, Request, Response, NextFunction } from "express";
import { ENV } from "./env";

/**
 * Lightweight security middleware — no extra deps.
 *  - Sets sensible response headers
 *  - Naive in-memory rate limit on /api/* (per IP)
 *  - Top-level error handler that hides stack traces in production
 */

const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT = 200; // requests per window per IP for /api/*
// Tighter limit for expensive routes (LLM, upload).
const STRICT_RATE_LIMIT = 30;
// Hardest limit for auth surfaces — these need brute-force resistance not
// throughput. 5/min/IP is generous for legitimate humans but kills code-
// stuffing scripts (SA-03).
// Production stays tight; local/e2e needs headroom for multi-role sweeps.
const AUTH_RATE_LIMIT = ENV.isProduction ? 5 : 60;
const STRICT_ROUTES = [
  "/api/trpc/application.uploadFile",
  "/api/trpc/application.runStage1Review",
  "/api/trpc/application.runStage2Review",
  "/api/trpc/application.aiEnhanceStage1",
  "/api/trpc/application.aiAutoComplete",
  "/api/trpc/application.aiResolveField",
  "/api/trpc/application.fixAllComments",
  // Public/expensive endpoints: literature fans out to 5 external APIs;
  // support.create is an anonymous write; /api/export/* launches Chromium /
  // runs an LLM for proposal DOCX. Prefix match below covers all export verbs.
  "/api/trpc/literature.search",
  "/api/trpc/support.create",
  "/api/trpc/chatApplication.sendMessage",
  "/api/trpc/application.sendChatMessage",
  "/api/mcp",
  "/api/irb",
  "/api/chat",
  "/api/trpc/analytics.ingest",
  "/api/export",
];
const AUTH_ROUTES = [
  "/api/sign-in",
  "/api/dev/login",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/supabase/session",
  "/api/oauth/callback",
  "/api/oauth/start",
];

/**
 * Best-effort real client IP for rate-limit bucket keys.
 *
 * Behind the split deploy (browser → Vercel rewrite → Render → app),
 * `req.ip` with trust proxy=1 resolves to Vercel's egress IP — shared by
 * every visitor — so one busy hour of legitimate users would exhaust a
 * single bucket and 429 everyone at once. The leftmost X-Forwarded-For
 * entry is the browser's IP as recorded by the first proxy.
 *
 * A direct (non-proxied) caller can forge X-Forwarded-For to rotate
 * buckets, which weakens per-IP limiting to roughly what an IP-rotating
 * client could do anyway; account-scoped throttles in nativeAuth remain
 * the backstop for credential attacks. Never use this value for authz.
 */
export function clientIpKey(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  if (first && first.length <= 64 && /^[0-9a-fA-F.:]+$/.test(first)) return first;
  return req.ip || req.socket.remoteAddress || "unknown";
}

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) return next();
  // Health-check exempted so external monitors don't get 429s.
  if (req.path === "/api/health") return next();
  const ip = clientIpKey(req);
  const now = Date.now();
  // Three independent buckets per IP (g / s / a) so a strict-route burst
  // doesn't drain the general budget, and an auth-route brute-force
  // attempt doesn't drain either. Auth gets the tightest cap.
  const isAuth = AUTH_ROUTES.some(p => req.path === p || req.path.startsWith(p + "/"));
  const isStrict = !isAuth && STRICT_ROUTES.some(p => req.path === p || req.path.startsWith(p + "/"));
  const scope = isAuth ? "a" : isStrict ? "s" : "g";
  const limit = isAuth ? AUTH_RATE_LIMIT : isStrict ? STRICT_RATE_LIMIT : RATE_LIMIT;
  const key = `${scope}:${ip}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return next();
  }

  if (bucket.count >= limit) {
    res.setHeader("Retry-After", Math.ceil((bucket.reset - now) / 1000));
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  bucket.count += 1;
  next();
}

// Periodically prune stale buckets (memory bound)
setInterval(() => {
  const now = Date.now();
  buckets.forEach((b, key) => {
    if (b.reset <= now) buckets.delete(key);
  });
}, RATE_WINDOW_MS).unref();

// CSP — strict baseline. The Vite dev pipeline injects inline scripts at
// runtime, so we relax script-src in dev only. Style 'unsafe-inline'
// stays because TailwindCSS + Radix UI rely on inline style props.
//
// connect-src in production is an explicit allowlist (SA-13). The previous
// `https:` wildcard would have let a stored-XSS exfiltrate to any host on the
// web. AI + literature endpoints are listed so the SPA's tRPC calls and any
// browser-side fetches stay on-allowlist. ALLOWED_CONNECT_HOSTS (comma-sep)
// lets ops add their Sentry DSN or analytics endpoint without a code change.
function gtmContainerId(): string {
  const id = (process.env.VITE_GTM_ID || process.env.GTM_ID || "").trim();
  return /^GTM-[A-Z0-9]+$/i.test(id) ? id : "";
}

function buildConnectSrc(): string {
  if (!ENV.isProduction) return "'self' https: ws: wss:";
  const base = [
    "'self'",
    "https://api.openai.com",
    "https://api.anthropic.com",
    "https://api.minimax.io",
    "https://eutils.ncbi.nlm.nih.gov",
    "https://api.semanticscholar.org",
    "https://api.openalex.org",
    "https://clinicaltrials.gov",
  ];
  if (ENV.supabaseUrl) {
    try {
      base.push(new URL(ENV.supabaseUrl).origin);
    } catch {
      /* ignore malformed URL */
    }
  }
  const extra = (process.env.ALLOWED_CONNECT_HOSTS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (gtmContainerId()) {
    extra.push("https://www.googletagmanager.com", "https://www.google-analytics.com");
  }
  return [...base, ...extra].join(" ");
}

function buildCsp(): string {
  const gtm = Boolean(gtmContainerId());
  const scriptSrc = ENV.isProduction
    ? (gtm ? "'self' https://www.googletagmanager.com" : "'self'")
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const imgHosts = (process.env.ALLOWED_IMG_HOSTS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (gtm) imgHosts.push("https://www.googletagmanager.com", "https://www.google-analytics.com");
  const imgSrc = ENV.isProduction
    ? ["'self'", "data:", "blob:", "https://*.amazonaws.com", "https://*.cloudfront.net", ...imgHosts].join(" ")
    : "'self' data: blob: https:";
  return [
    "default-src 'self'",
    `img-src ${imgSrc}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src ${scriptSrc}`,
    `connect-src ${buildConnectSrc()}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()"
  );
  res.setHeader("Content-Security-Policy", buildCsp());
  if (ENV.isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  next();
}

/**
 * Origin / Referer allowlist for state-changing requests (SA-01).
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site POSTs
 * from sending it. This middleware is a belt-and-braces second check that
 * also catches:
 *  - same-site subdomain attacks (Lax allows top-level same-site POST)
 *  - non-browser callers (Postman, curl) that need to be on-allowlist
 *
 * Allowed: same-origin requests (no Origin header, or Origin === own host)
 * AND any origin listed in ENV.allowedOrigins. The split deploy (SPA on
 * Vercel, API on Railway) requires ENV.allowedOrigins to be set to the SPA
 * domain in prod.
 */
/** Compile an ALLOWED_ORIGINS entry. Entries may contain `*` wildcards
 *  (e.g. https://myapp-*-team.vercel.app) — each * matches one DNS label's
 *  worth of [A-Za-z0-9-] characters, never a dot, so a wildcard scoped to
 *  a project prefix can't be widened to a sibling domain. */
const wildcardCache = new Map<string, RegExp>();
function originMatches(entry: string, origin: string): boolean {
  if (!entry.includes("*")) return entry === origin;
  let re = wildcardCache.get(entry);
  if (!re) {
    const pattern = entry
      .split("*")
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[A-Za-z0-9-]+");
    re = new RegExp(`^${pattern}$`);
    wildcardCache.set(entry, re);
  }
  return re.test(origin);
}

export function isOriginAllowed(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = (req.headers.origin as string | undefined) ?? "";
  const referer = (req.headers.referer as string | undefined) ?? "";
  const claimed = origin || referer;

  // No Origin/Referer + non-browser client. Allow only on loopback; otherwise
  // reject. (curl scripts can opt in via ALLOWED_ORIGINS.)
  if (!claimed) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return /^(127\.|::1|::ffff:127\.)/.test(ip);
  }

  // Compare on origin only, not full URL — strip path/query.
  let claimedOrigin: string;
  try {
    const u = new URL(claimed);
    claimedOrigin = `${u.protocol}//${u.host}`;
  } catch {
    return false;
  }

  // Hosts this request was addressed to. Behind the Vercel→Railway split
  // deploy the browser talks to the Vercel domain (any deployment URL) and
  // the rewrite proxies to Railway: Host becomes the Railway domain while
  // X-Forwarded-Host carries the domain the browser actually used. A
  // request whose Origin matches the host it was sent to is same-origin
  // from the browser's point of view — exactly what this guard exists to
  // verify. Browsers cannot forge X-Forwarded-Host, and a non-browser
  // caller that sets it could just as easily set Origin, so this adds no
  // new surface while making every Vercel preview/alias domain work.
  const protoHeader = (req.headers["x-forwarded-proto"] as string | undefined)
    ?.split(",")[0]
    ?.trim();
  const proto = protoHeader || req.protocol;
  const ownHosts = [req.get("host") ?? ""];
  const xfh = req.headers["x-forwarded-host"];
  for (const h of (Array.isArray(xfh) ? xfh.join(",") : xfh ?? "").split(",")) {
    if (h.trim()) ownHosts.push(h.trim());
  }
  for (const host of ownHosts) {
    if (host && claimedOrigin === `${proto}://${host}`) return true;
  }

  return ENV.allowedOrigins.some(entry => originMatches(entry, claimedOrigin));
}

function originGuard(req: Request, res: Response, next: NextFunction) {
  if (isOriginAllowed(req)) return next();
  res.status(403).json({ error: "origin not allowed" });
}

/**
 * CORS for the split deploy (SA-20). Only mounted on /api/*. Reflects the
 * Origin header if (and only if) it's on the allowlist, and pairs that with
 * credentials:true so the session cookie is sent. Origins not on the list
 * get no CORS headers at all — the browser then refuses the call.
 */
function corsForApi(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin as string | undefined;
  if (origin && ENV.allowedOrigins.some(entry => originMatches(entry, origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-csrf"
    );
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("[Server error]", err);
  // Forward to Sentry if configured (no-op otherwise).
  // Lazy require so a circular import can't break the security module.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const obs = require("./observability");
    obs.captureException(err, {
      request: { method: req.method, url: req.originalUrl, headers: { "user-agent": req.headers["user-agent"] } },
    });
  } catch { /* observability optional */ }
  if (res.headersSent) return;
  const message =
    ENV.isProduction || !(err instanceof Error)
      ? "Internal server error"
      : err.message;
  res.status(500).json({ error: message });
}

export function registerSecurity(app: Express) {
  // Trust proxy so X-Forwarded-For works behind reverse proxies
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(rateLimit);
}

/**
 * Mount /api/*-scoped middlewares: CORS for browser-issued cross-origin
 * requests, then origin allowlist for state-changing methods. Call AFTER
 * the body parsers but BEFORE the tRPC mount.
 *
 * Health check is excluded so external monitors (which won't send a
 * matching Origin) can still poll it.
 */
export function registerApiGuards(app: Express) {
  app.use("/api", (req, res, next) => {
    if (req.path === "/health") return next();
    return corsForApi(req, res, () => originGuard(req, res, next));
  });
}

export function registerErrorHandler(app: Express) {
  app.use(errorHandler);
}
