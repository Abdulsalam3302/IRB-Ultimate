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

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0];
  return req.socket.remoteAddress || "unknown";
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) return next();
  // Skip rate-limit for static assets, OAuth callback, dev-login GET form
  if (req.path === "/api/oauth/callback") return next();

  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.reset <= now) {
    buckets.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return next();
  }

  if (bucket.count >= RATE_LIMIT) {
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
  buckets.forEach((b, ip) => {
    if (b.reset <= now) buckets.delete(ip);
  });
}, RATE_WINDOW_MS).unref();

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
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
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("[Server error]", err);
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
