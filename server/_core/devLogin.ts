import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

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
 * Local dev login + production platform sign-in.
 *
 * - Dev: loopback-only when DEV_LOGIN_ENABLED=1 and not production.
 * - Production public sign-in: PUBLIC_SIGNIN_ENABLED=1 when OAuth is unset.
 * - Legacy pilot: PILOT_LOGIN_ENABLED=1 with token (deprecated — use OAuth or public sign-in).
 */
export function registerDevLoginRoutes(app: Express) {
  const publicSignIn = ENV.publicSignInEnabled;
  const pilotMode =
    ENV.pilotLoginEnabled && ENV.pilotLoginToken.length >= 16 && !publicSignIn;
  const devMode =
    !ENV.isProduction &&
    ENV.devLoginEnabled &&
    (!ENV.oAuthServerUrl || ENV.oAuthServerUrl.trim() === "");

  const enabled = publicSignIn || pilotMode || devMode;
  if (!enabled) return;

  if (publicSignIn) {
    console.log("[SignIn] Public platform sign-in enabled at /api/sign-in");
  } else if (pilotMode) {
    console.log("[PilotLogin] Token-guarded sign-in at /api/sign-in (legacy pilot mode).");
  } else {
    console.log("[DevLogin] Local dev sign-in at /api/sign-in (loopback only).");
  }

  const requireLoopbackUnlessPublic = (req: Request, res: Response): boolean => {
    if (publicSignIn || pilotMode) return true;
    return requireLoopback(req, res);
  };

  const verifyAccessToken = (req: Request, res: Response): boolean => {
    if (publicSignIn) return true;
    const required = pilotMode ? ENV.pilotLoginToken : ENV.devLoginToken;
    if (!required) return true;
    const provided = String(req.body?.token || req.query?.token || "");
    if (provided !== required) {
      res.status(401).json({ error: "login token mismatch" });
      return false;
    }
    return true;
  };

  const requireLoopback = (req: Request, res: Response): boolean => {
    const ip = (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
    res.status(403).json({ error: "dev login only available from loopback" });
    return false;
  };

  const roleForOpenId = (openId: string): "admin" | "user" =>
    ENV.ownerOpenId && openId === ENV.ownerOpenId ? "admin" : "user";

  const renderSignIn = (req: Request, res: Response) => {
    if (!requireLoopbackUnlessPublic(req, res)) return;
    const title = publicSignIn ? "Sign In" : pilotMode ? "Secure Sign In" : "Dev Sign In";
    const intro = publicSignIn
      ? "Access the IRB review platform with your institutional email. Secure sessions are issued after verification."
      : pilotMode
        ? "Authorized access only. Use your institutional credentials."
        : "Local development only.";
    const tokenField = pilotMode
      ? `<input type="hidden" name="token" value="${ENV.pilotLoginToken}">`
      : ENV.devLoginToken
        ? `<label>Access token</label><input name="token" value="${ENV.devLoginToken}" required>`
        : "";
    res.type("html").send(signInPageHtml(title, intro, tokenField));
  };

  app.get("/api/sign-in", renderSignIn);
  app.get("/api/dev/login", renderSignIn);

  const handleSignIn = async (req: Request, res: Response) => {
    if (!requireLoopbackUnlessPublic(req, res)) return;
    if (!verifyAccessToken(req, res)) return;
    try {
      const email = String(req.body?.email || "").trim().slice(0, 320);
      const name = String(req.body?.name || "Researcher").trim().slice(0, 255);
      const openId = publicSignIn
        ? openIdFromEmail(email || String(req.body?.openId || "anonymous@local.dev"))
        : String(req.body?.openId || "dev-user-001").slice(0, 64);
      const role = roleForOpenId(openId);

      await db.upsertUser({
        openId,
        name,
        email: email || `${openId}@local.dev`,
        loginMethod: publicSignIn ? "email" : "dev",
        role,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      const wantsJson = (req.headers["content-type"] || "").includes("application/json");
      if (wantsJson) {
        res.json({ ok: true, openId, role });
      } else {
        res.redirect(302, "/");
      }
    } catch (error) {
      console.error("[SignIn] failed", error);
      res.status(500).json({ error: "sign in failed" });
    }
  };

  app.post("/api/sign-in", handleSignIn);
  app.post("/api/dev/login", handleSignIn);
}
