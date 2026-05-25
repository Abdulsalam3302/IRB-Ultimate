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
const AUTH_RATE_LIMIT = 5;
const STRICT_ROUTES = [
  "/api/trpc/application.uploadFile",
  "/api/trpc/application.runStage1Review",
  "/api/trpc/application.runStage2Review",
  "/api/trpc/application.aiEnhanceStage1",
  "/api/trpc/application.aiAutoComplete",
  "/api/trpc/application.aiResolveField",
  "/api/trpc/application.fixAllComments",
];
const AUTH_ROUTES = [
  "/api/sign-in",
  "/api/dev/login",
  "/api/oauth/callback",
  "/api/oauth/start",
];

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) return next();
  // Health-check exempted so external monitors don't get 429s.
  if (req.path === "/api/health") return next();
  // Express's `req.ip` honours `trust proxy=1` set in registerSecurity().
  // Don't manually splice X-Forwarded-For — an attacker could pin it.
  const ip = req.ip || req.socket.remoteAddress || "unknown";
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
  return [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
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
function isOriginAllowed(req: Request): boolean {
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

  const ownHost = `${req.protocol}://${req.get("host") ?? ""}`;
  const allowlist = new Set<string>([ownHost, ...ENV.allowedOrigins]);

  // Compare on origin only, not full URL — strip path/query.
  let claimedOrigin: string;
  try {
    const u = new URL(claimed);
    claimedOrigin = `${u.protocol}//${u.host}`;
  } catch {
    return false;
  }
  return allowlist.has(claimedOrigin);
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
  if (origin && ENV.allowedOrigins.includes(origin)) {
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
