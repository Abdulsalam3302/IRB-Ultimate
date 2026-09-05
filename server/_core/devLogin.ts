import { safeLogError } from "./safeLog";
import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { timingSafeEqual } from "node:crypto";

function openIdFromEmail(email: string): string {
  const norm = email.trim().toLowerCase();
  if (!norm.includes("@")) return `user-${norm.slice(0, 48)}`;
  return `email:${norm}`;
}

function signInPageHtml(title: string, intro: string, tokenField: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} — IRB Saudi Arabia</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:60px auto;padding:24px;background:#fafafa;color:#111}
  h1{font-size:22px;margin:0 0 8px}
  p{color:#555;margin:0 0 20px;line-height:1.5}
  .card{background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  label{display:block;margin:14px 0 6px;font-size:13px;color:#333}
  input{width:100%;padding:10px 12px;border:1px solid #d4d4d8;border-radius:8px;font-size:14px;background:#fff;box-sizing:border-box}
  button{margin-top:18px;width:100%;padding:11px 16px;background:#0a7c4a;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
  button:hover{background:#086239}
  .muted{font-size:12px;color:#888;margin-top:14px;line-height:1.45}
</style></head><body>
<h1>${title}</h1>
<p>${intro}</p>
<form class="card" method="POST" action="/api/sign-in">
  ${tokenField}
  <label>Full name</label>
  <input name="name" autocomplete="name" required placeholder="Dr. Jane Researcher">
  <label>Work email</label>
  <input type="email" name="email" autocomplete="email" required placeholder="researcher@institution.edu.sa">
  <button type="submit">Continue to platform</button>
  <div class="muted">Your account is tied to your email. Only the configured platform owner receives admin access automatically.</div>
</form></body></html>`;
}

/**
 * Local dev login + token-guarded pilot sign-in.
 *
 * - Dev: loopback-only when DEV_LOGIN_ENABLED=1 and not production.
 * - Pilot (demo deploys only): PILOT_LOGIN_ENABLED=1 with a strong token
 *   (>= 32 chars) distributed OUT OF BAND. The token is never embedded in
 *   the served page — visitors must type it. Only available when neither
 *   Supabase nor OAuth is configured.
 *
 * SECURITY: the former "public sign-in" mode (PUBLIC_SIGNIN_ENABLED) that
 * minted a session for any name+email with no proof of identity has been
 * removed. Production identity comes from Supabase, OAuth, or native
 * email/password (/api/auth/register + /api/auth/login).
 */
export function registerDevLoginRoutes(app: Express) {
  const pilotMode = ENV.pilotLoginEnabled && ENV.pilotLoginToken.length >= 32;
  const devMode =
    !ENV.isProduction &&
    ENV.devLoginEnabled &&
    (!ENV.oAuthServerUrl || ENV.oAuthServerUrl.trim() === "");

  const enabled = pilotMode || devMode;
  if (!enabled) {
    if (ENV.pilotLoginEnabled && ENV.pilotLoginToken.length < 32) {
      console.warn(
        "[PilotLogin] PILOT_LOGIN_ENABLED is set but PILOT_LOGIN_TOKEN is shorter than 32 chars — pilot sign-in stays DISABLED. Generate with: openssl rand -hex 24"
      );
    }
    return;
  }

  if (pilotMode) {
    console.log("[PilotLogin] Token-guarded sign-in at /api/sign-in (token required, never embedded).");
  } else {
    console.log("[DevLogin] Local dev sign-in at /api/sign-in (loopback only).");
  }

  const requireLoopbackUnlessPilot = (req: Request, res: Response): boolean => {
    if (pilotMode) return true;
    return requireLoopback(req, res);
  };

  const verifyAccessToken = (req: Request, res: Response): boolean => {
    const required = pilotMode ? ENV.pilotLoginToken : ENV.devLoginToken;
    if (!required) return true; // dev mode without an extra token
    const provided = String(req.body?.token || "");
    if (Buffer.byteLength(provided) !== Buffer.byteLength(required) || !timingSafeEqual(Buffer.from(provided), Buffer.from(required))) {
      res.status(401).json({ error: "login token mismatch" });
      return false;
    }
    return true;
  };

  const requireLoopback = (req: Request, res: Response): boolean => {
    const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
    res.status(403).json({ error: "dev login only available from loopback" });
    return false;
  };

  const roleForOpenId = (openId: string): "admin" | "user" =>
    ENV.ownerOpenId && openId === ENV.ownerOpenId ? "admin" : "user";

  const renderSignIn = (req: Request, res: Response) => {
    if (ENV.supabaseEnabled) {
      const base = ENV.publicAppUrl || `${req.protocol}://${req.get("host") ?? ""}`;
      res.redirect(302, `${base.replace(/\/$/, "")}/auth`);
      return;
    }
    if (!requireLoopbackUnlessPilot(req, res)) return;
    const title = pilotMode ? "Secure Sign In" : "Dev Sign In";
    const intro = pilotMode
      ? "Authorized pilot access only. Enter the access token you were given along with your institutional details."
      : "Local development only.";
    // The token is NEVER pre-filled — embedding it in a publicly served
    // page would hand it to every visitor and defeat the guard entirely.
    const tokenField = pilotMode || ENV.devLoginToken
      ? `<label>Access token</label><input name="token" type="password" autocomplete="off" required placeholder="Paste the access token you received">`
      : "";
    res.type("html").send(signInPageHtml(title, intro, tokenField));
  };

  app.get("/api/sign-in", renderSignIn);
  app.get("/api/dev/login", renderSignIn);

  const handleSignIn = async (req: Request, res: Response) => {
    if (!requireLoopbackUnlessPilot(req, res)) return;
    if (!verifyAccessToken(req, res)) return;
    try {
      const email = String(req.body?.email || "").trim().slice(0, 320);
      const name = String(req.body?.name || "Researcher").trim().slice(0, 255);
      // Pilot accounts are keyed to the email so two pilot testers never
      // share one identity. Dev mode keeps the fixed local id.
      const openId = pilotMode
        ? openIdFromEmail(email || "anonymous@pilot.local")
        : String(req.body?.openId || "dev-user-001").slice(0, 64);
      const role = roleForOpenId(openId);

      await db.upsertUser({
        openId,
        name,
        email: email || `${openId}@local.dev`,
        loginMethod: pilotMode ? "pilot" : "dev",
        role,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: SESSION_TTL_MS,
      });

      const wantsJson = (req.headers["content-type"] || "").includes("application/json");
      if (wantsJson) {
        res.json({ ok: true, openId, role });
      } else {
        res.redirect(302, "/");
      }
    } catch (error) {
      console.error("[SignIn] failed", safeLogError(error));
      res.status(500).json({ error: "sign in failed" });
    }
  };

  app.post("/api/sign-in", handleSignIn);
  app.post("/api/dev/login", handleSignIn);
}
