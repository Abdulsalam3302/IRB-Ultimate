import type { Express, Request, Response, NextFunction } from "express";
import { ENV } from "./env";

/**
 * Lightweight security middleware — no extra deps.
 *  - Sets sensible response headers
 *  - Naive in-memory rate limit on /api/* (per IP)
 *  - Top-level error handler that hides stack traces in production
 */

const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT = 120; // requests per window per IP for /api/*
// Tighter limit for expensive / sensitive routes.
const STRICT_RATE_LIMIT = 12;
const STRICT_ROUTES = [
  "/api/trpc/application.uploadFile",
  "/api/trpc/application.runStage1Review",
  "/api/trpc/application.runStage2Review",
  "/api/trpc/application.aiEnhanceStage1",
  "/api/trpc/application.aiAutoComplete",
  "/api/trpc/application.aiResolveField",
  "/api/trpc/application.fixAllComments",
  "/api/dev/login",
  "/api/oauth/callback",
];

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) return next();
  // OAuth callback excluded from STANDARD limit only — we'll apply
  // a strict limit further down.
  // Express's `req.ip` honours `trust proxy=1` set in registerSecurity().
  // Don't manually splice X-Forwarded-For — an attacker could pin it.
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  // Bucket per ip + per scope ("strict" vs "std") so a strict limit on
  // an expensive route doesn't drain the user's general budget and vice
  // versa.
  const isStrict = STRICT_ROUTES.some(p => req.path === p || req.path.startsWith(p + "/"));
  const limit = isStrict ? STRICT_RATE_LIMIT : RATE_LIMIT;
  const key = `${isStrict ? "s" : "g"}:${ip}`;
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
    "connect-src 'self' https: ws: wss:",
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

export function registerErrorHandler(app: Express) {
  app.use(errorHandler);
}
