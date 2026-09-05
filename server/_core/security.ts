import { safeLogError } from "./safeLog";
import type { Express, Request, Response, NextFunction } from "express";
import { ENV } from "./env";
import { consumeRateLimit } from "./requestLimits";
import { boundedInt } from "./limits";
import { captureException } from "./observability";

/**
 * Lightweight security middleware — no extra deps.
 *  - Sets sensible response headers
 *  - Shared persistent rate limits on /api/* (pseudonymous per-IP counters)
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

/** Only Express may resolve trusted proxy hops. Never accept the leftmost caller-supplied XFF. */
export function clientIpKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateScope(path: string): "auth" | "strict" | "general" {
  if (AUTH_ROUTES.some(p => path === p || path.startsWith(p + "/"))) return "auth";
  // A comma-separated tRPC batch must not bypass the expensive-route policy.
  const paths = path.startsWith("/api/trpc/")
    ? path.slice("/api/trpc/".length).split(",").map(p => `/api/trpc/${p}`)
    : [path];
  if (paths.some(p => STRICT_ROUTES.some(strict => p === strict || p.startsWith(strict + "/")))) return "strict";
  return "general";
}

async function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/") || ["/api/health", "/api/ready"].includes(req.path)) return next();
  if (req.method === "OPTIONS") return next();
  const scope = rateScope(req.path);
  const limit = scope === "auth" ? AUTH_RATE_LIMIT : scope === "strict" ? STRICT_RATE_LIMIT : RATE_LIMIT;
  try {
    // Reject an exhausted caller before charging shared capacity. Otherwise one
    // already-blocked IP can repeatedly drain the global allowance for everyone.
    const result = await consumeRateLimit(`api-${scope}`, clientIpKey(req), limit, RATE_WINDOW_MS);
    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfter);
      res.status(result.unavailable ? 503 : 429).json({ error: result.unavailable ? "Service temporarily unavailable" : "Too many requests" });
      return;
    }
    if (scope === "auth" || scope === "strict") {
      const global = await consumeRateLimit(`api-global-${scope}`, "all", scope === "auth" ? 120 : 300, RATE_WINDOW_MS);
      if (!global.allowed) {
        res.setHeader("Retry-After", global.retryAfter);
        res.status(global.unavailable ? 503 : 429).json({ error: global.unavailable ? "Service temporarily unavailable" : "Too many requests" });
        return;
      }
    }
    next();
  } catch (err) { next(err); }
}

export const UPLOAD_BODY_TIMEOUT_MS = 30_000;
const MAX_UPLOAD_JSON_BYTES = 21 * 1024 * 1024;

/** Authenticate before admitting/reading a large upload body. The final tRPC
 * route still checks the current session, ownership, edit state and staff MFA.
 * Admission is per account as well as per process; anonymous slow bodies never
 * occupy either of the two expensive upload slots.
 */
export function createUploadAdmission(
  authenticate: (req: Request) => Promise<{ id: number } | null>,
  options: { bodyTimeoutMs?: number } = {},
) {
  const users = new Set<number>();
  const bodyTimeout = Number.isFinite(options.bodyTimeoutMs)
    ? Math.max(25, Math.min(UPLOAD_BODY_TIMEOUT_MS, options.bodyTimeoutMs!)) : UPLOAD_BODY_TIMEOUT_MS;
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path !== "/api/trpc/application.uploadFile") return next();
    // Preflight must finish before JSON parsing; preserve split-host CORS.
    let continueRequest = false;
    corsForApi(req, res, () => { continueRequest = true; });
    if (!continueRequest) return;
    const reject = (status: number, error: string, retry = false) => {
      res.setHeader("Connection", "close");
      if (retry) res.setHeader("Retry-After", "5");
      res.status(status).json({ error });
    };
    if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return reject(405, "Upload requires POST"); }
    if (!isOriginAllowed(req)) return reject(403, "origin not allowed");
    if (!req.is("application/json")) return reject(415, "Upload requires application/json");
    const length = req.headers["content-length"];
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_UPLOAD_JSON_BYTES)) return reject(413, "Request body too large");
    let user: { id: number } | null;
    try { user = await authenticate(req); }
    catch { user = null; }
    if (req.aborted || res.destroyed || res.writableEnded) return;
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return reject(401, "Authentication required");
    if (users.has(user.id)) return reject(429, "Another upload for this account is in progress", true);
    if (users.size >= 2) return reject(503, "Upload service is busy", true);
    const userId = user.id;
    users.add(userId);
    let released = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bodyEnded = () => { clearTimeout(timer); };
    const release = () => {
      if (released) return;
      released = true;
      bodyEnded();
      users.delete(userId);
      req.off("end", bodyEnded);
      req.off("aborted", release);
      res.off("finish", release);
      res.off("close", release);
    };
    req.once("end", bodyEnded);
    req.once("aborted", release);
    res.once("finish", release);
    res.once("close", release);
    if (!req.complete) {
      timer = setTimeout(() => {
        if (!res.writableEnded && !res.destroyed) reject(408, "Upload body did not finish in time");
        release();
      }, bodyTimeout);
      timer.unref?.();
    }
    next();
  };
}

// CSP — strict baseline. The Vite dev pipeline injects inline scripts at
// runtime, so we relax script-src in dev only. Style 'unsafe-inline'
// stays because TailwindCSS + Radix UI rely on inline style props.
//
// connect-src in production is an explicit allowlist (SA-13). The previous
// `https:` wildcard would have let a stored-XSS exfiltrate to any host on the
// web. AI and literature requests stay server-side. The browser may contact only
// its own origin and its configured identity provider. ALLOWED_CONNECT_HOSTS (comma-sep)
// lets ops add their Sentry DSN or analytics endpoint without a code change.
function buildConnectSrc(): string {
  if (!ENV.isProduction) return "'self' https: ws: wss:";
  const base = [
    "'self'",

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
  return [...base, ...extra].join(" ");
}

function buildCsp(): string {
  const scriptSrc = ENV.isProduction
    ? "'self'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const imgHosts = (process.env.ALLOWED_IMG_HOSTS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const imgSrc = ENV.isProduction
    ? ["'self'", "data:", "blob:", "https://*.amazonaws.com", "https://*.cloudfront.net", ...imgHosts].join(" ")
    : "'self' data: blob: https:";
  return [
    "default-src 'self'",
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    `connect-src ${buildConnectSrc()}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function securityHeaders(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
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
 * Allowed: verified same-origin browser requests
 * AND any origin listed in ENV.allowedOrigins. The split deploy (SPA on
 * Vercel, API on Render) requires ENV.allowedOrigins to be set to the SPA
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
    return !ENV.isProduction && /^(127\.|::1$|::ffff:127\.)/.test(ip);
  }

  // Compare on origin only, not full URL — strip path/query.
  let claimedOrigin: string;
  try {
    const u = new URL(claimed);
    claimedOrigin = `${u.protocol}//${u.host}`;
  } catch {
    return false;
  }

  // Do not trust forwarded host/proto supplied by a direct client. The configured
  // public URL covers the split edge/API deployment; preview origins must be explicit.
  if (claimedOrigin === `${req.protocol}://${req.get("host") ?? ""}`) return true;
  if (ENV.publicAppUrl) {
    try { if (claimedOrigin === new URL(ENV.publicAppUrl).origin) return true; } catch { /* invalid configuration */ }
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
    res.vary("Origin");
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
  captureException(err, { request: { method: req.method, url: req.path } });
  console.error("[Server error]", safeLogError(err));
  if (res.headersSent) return _next(err);
  const code = (err as { type?: string; status?: number })?.type;
  const status = code === "entity.too.large" ? 413 : code === "entity.parse.failed" ? 400 : 500;
  const message = status === 413 ? "Request body too large" : status === 400 ? "Invalid JSON body" :
    ENV.isProduction || !(err instanceof Error) ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
}

export function registerSecurity(app: Express) {
  // Configure only the verified proxy topology; never blindly trust arbitrary XFF.
  app.set("trust proxy", boundedInt(process.env.TRUST_PROXY_HOPS, ENV.isProduction ? 1 : 0, 0, 5));
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
