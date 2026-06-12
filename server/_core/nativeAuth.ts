import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { hashPassword, verifyPassword } from "./passwords";
import { clientIpKey } from "./security";

// ─── Validation ──────────────────────────────────────────────────────────────

// Pragmatic email shape check — we deliberately don't try to fully implement
// RFC 5322. Anything with a local part, an @, and a dotted domain passes; the
// 320-char cap matches the DB column.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const MAX_NAME = 255;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 320 || !EMAIL_RE.test(email)) return null;
  return email;
}

function cleanName(value: unknown, fallbackEmail: string): string {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, MAX_NAME);
  return fallbackEmail.split("@")[0]!.slice(0, MAX_NAME);
}

// ─── Account-scoped throttle (brute-force defence) ───────────────────────────
//
// Keyed by email — NOT solely by IP. Behind the Vercel→Railway proxy many
// legitimate users can share a single egress IP, so an IP-only lock would
// lock everyone out at once. Per-account locking caps password guessing
// against any one account while leaving honest users untouched.
const FAILED_WINDOW_MS = 15 * 60_000; // 15 minutes
const FAILED_MAX = 8; // failed logins per account per window
const REGISTER_WINDOW_MS = 60 * 60_000; // 1 hour
const REGISTER_MAX = 20; // new accounts per IP per window

type Bucket = { count: number; reset: number };
const failedLogins = new Map<string, Bucket>();
const registrations = new Map<string, Bucket>();

function hit(map: Map<string, Bucket>, key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || bucket.reset <= now) {
    map.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

function clearFailures(email: string) {
  failedLogins.delete(email);
}

// Bound memory — prune expired buckets every 5 minutes.
setInterval(() => {
  const now = Date.now();
  failedLogins.forEach((b, k) => {
    if (b.reset <= now) failedLogins.delete(k);
  });
  registrations.forEach((b, k) => {
    if (b.reset <= now) registrations.delete(k);
  });
}, 5 * 60_000).unref();

// A throwaway hash so a login attempt against a non-existent account spends
// roughly the same CPU as a real one — closes the timing side-channel that
// would otherwise let an attacker enumerate registered emails.
const DUMMY_HASH =
  "scrypt$32768$8$1$00000000000000000000000000000000$" + "0".repeat(128);

async function issueSession(req: Request, res: Response, openId: string, name: string) {
  const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export function registerNativeAuthRoutes(app: Express) {
  console.log("[NativeAuth] Email/password auth enabled at /api/auth/register and /api/auth/login");

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = normalizeEmail(body.email);
      if (!email) {
        res.status(400).json({ error: "Please enter a valid email address.", code: "INVALID_EMAIL" });
        return;
      }
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        res.status(400).json({
          error: `Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`,
          code: "WEAK_PASSWORD",
        });
        return;
      }

      // Real client IP — behind the Vercel rewrite every visitor shares the
      // proxy's egress IP, so keying on req.ip would cap sign-ups for the
      // whole site at REGISTER_MAX/hour.
      const ip = clientIpKey(req);
      if (!hit(registrations, ip, REGISTER_WINDOW_MS, REGISTER_MAX)) {
        res.status(429).json({ error: "Too many sign-ups from this network. Try again later.", code: "RATE_LIMITED" });
        return;
      }

      const existing = await db.getUserByEmail(email);
      if (existing) {
        res.status(409).json({
          error: "An account with this email already exists. Please sign in.",
          code: "EMAIL_EXISTS",
        });
        return;
      }

      const name = cleanName(body.name, email);
      const passwordHash = await hashPassword(password);
      const openId = `local:${nanoid()}`.slice(0, 64);
      const user = await db.createLocalUser({ openId, name, email, passwordHash });
      if (!user) {
        res.status(500).json({ error: "Could not create account. Please try again.", code: "SERVER_ERROR" });
        return;
      }

      await issueSession(req, res, user.openId, name);
      res.json({ ok: true, openId: user.openId, role: user.role });
    } catch (error) {
      console.error("[NativeAuth] register failed", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Could not create account. Please try again.", code: "SERVER_ERROR" });
      }
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";

      // Generic response for every credential failure — never reveal whether
      // the email exists or the password was wrong.
      const reject = () =>
        res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });

      if (!email || !password) {
        await verifyPassword(password || "x", DUMMY_HASH); // equalise timing
        reject();
        return;
      }

      if (!hit(failedLogins, email, FAILED_WINDOW_MS, FAILED_MAX)) {
        res.status(429).json({
          error: "Too many sign-in attempts for this account. Please wait a few minutes.",
          code: "RATE_LIMITED",
        });
        return;
      }

      const user = await db.getLocalUserByEmail(email);
      const ok = user
        ? await verifyPassword(password, user.passwordHash)
        : (await verifyPassword(password, DUMMY_HASH), false);

      if (!user || !ok) {
        reject();
        return;
      }

      clearFailures(email);
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      await issueSession(req, res, user.openId, user.name ?? email.split("@")[0]!);
      res.json({ ok: true, openId: user.openId, role: user.role });
    } catch (error) {
      console.error("[NativeAuth] login failed", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Sign-in failed. Please try again.", code: "SERVER_ERROR" });
      }
    }
  });
}
