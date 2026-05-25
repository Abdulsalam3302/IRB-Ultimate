import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

/**
 * Dev-mode login bypass.
 *
 * Active only when NODE_ENV !== "production" AND OAUTH_SERVER_URL is empty.
 * Lets you sign in locally without a remote OAuth provider so you can
 * exercise the full app end-to-end. Disabled in production.
 *
 * Routes:
 *   GET  /api/dev/login                   — pick-a-user landing page (HTML)
 *   POST /api/dev/login   {openId,name,email,role}  — set session cookie
 */
export function registerDevLoginRoutes(app: Express) {
  const pilotMode = ENV.pilotLoginEnabled && ENV.pilotLoginToken.length >= 16;
  // Dev-login is OFF in production unless pilot mode is explicitly enabled.
  const devMode =
    !ENV.isProduction &&
    ENV.devLoginEnabled &&
    (!ENV.oAuthServerUrl || ENV.oAuthServerUrl.trim() === "");

  const enabled = pilotMode || devMode;
  if (!enabled) return;

  if (pilotMode) {
    console.log("[PilotLogin] Enabled at /api/dev/login (token required, demo/pilot only).");
  } else if (ENV.devLoginToken) {
    console.log(
      `[DevLogin] Enabled at /api/dev/login (loopback only, token required: ${ENV.devLoginToken}).`
    );
  } else {
    console.log(
      "[DevLogin] Enabled at /api/dev/login (loopback only). " +
      "Set DEV_LOGIN_TOKEN to require a shared secret on POST."
    );
  }

  const requireLoopbackUnlessPilot = (req: Request, res: Response): boolean => {
    if (pilotMode) return true;
    return requireLoopback(req, res);
  };

  const verifyAccessToken = (req: Request, res: Response): boolean => {
    const required = pilotMode ? ENV.pilotLoginToken : ENV.devLoginToken;
    if (!required) return true;
    const provided = String(req.body?.token || req.query?.token || "");
    if (provided !== required) {
      res.status(401).json({ error: "login token mismatch" });
      return false;
    }
    return true;
  };

  // Refuse dev-login from non-loopback clients. Anything else is too
  // risky on a shared LAN / staging tunnel / forwarded port.
  const requireLoopback = (req: Request, res: Response): boolean => {
    const ip = (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
    res.status(403).json({ error: "dev login only available from loopback" });
    return false;
  };

  // Server-side role mapping. The browser can't set role anymore —
  // promotion to admin happens automatically for the configured
  // OWNER_OPEN_ID. This kills the "POST role=admin" privilege-escalation
  // path that any unauth attacker could use over a forwarded dev port.
  const roleForOpenId = (openId: string): "admin" | "user" =>
    ENV.ownerOpenId && openId === ENV.ownerOpenId ? "admin" : "user";

  app.get("/api/dev/login", (req: Request, res: Response) => {
    if (!requireLoopbackUnlessPilot(req, res)) return;
    const tokenField = pilotMode
      ? `<input type="hidden" name="token" value="${ENV.pilotLoginToken}">`
      : ENV.devLoginToken
        ? `<label>Pilot / dev token</label><input name="token" value="${ENV.devLoginToken}" required>`
        : "";
    res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${pilotMode ? "Pilot Login" : "Dev Login"} — IRB Saudi Arabia</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:60px auto;padding:24px;background:#fafafa;color:#111}
  h1{font-size:22px;margin:0 0 8px}
  p{color:#555;margin:0 0 20px}
  .card{background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  label{display:block;margin:14px 0 6px;font-size:13px;color:#333}
  input,select{width:100%;padding:10px 12px;border:1px solid #d4d4d8;border-radius:8px;font-size:14px;background:#fff}
  button{margin-top:18px;width:100%;padding:11px 16px;background:#0a7c4a;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
  button:hover{background:#086239}
  .muted{font-size:12px;color:#888;margin-top:14px}
  .row{display:flex;gap:8px}.row > *{flex:1}
</style></head><body>
<h1>IRB Saudi Arabia — ${pilotMode ? "Pilot Login" : "Dev Login"}</h1>
<p>${pilotMode ? "Public pilot environment. Do not submit real participant PHI." : "Local-dev only. Disabled when <code>NODE_ENV=production</code> unless pilot mode is enabled."}</p>
<form class="card" method="POST" action="/api/dev/login">
  ${tokenField}
  <label>Display name</label>
  <input name="name" value="Dr. Abdulsalam Aleid" required>
  <label>Email</label>
  <input type="email" name="email" value="owner@irb-ultimate.local" required>
  <label>OpenID</label>
  <input name="openId" value="dev-owner-001" required>
  <button type="submit">Sign in</button>
  <div class="muted">Role is server-controlled: only the configured <code>OWNER_OPEN_ID</code> is granted admin. All other openIds receive role=user.</div>
</form></body></html>`);
  });

  app.post("/api/dev/login", async (req: Request, res: Response) => {
    if (!requireLoopbackUnlessPilot(req, res)) return;
    if (!verifyAccessToken(req, res)) return;
    try {
      const openId = String(req.body?.openId || "dev-user-001").slice(0, 64);
      const name = String(req.body?.name || "Dev User").slice(0, 255);
      const email = String(req.body?.email || `${openId}@local.dev`).slice(0, 320);
      const role = roleForOpenId(openId);

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "dev",
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

      // If form posted, redirect; if JSON posted (test/curl), return ok.
      const wantsJson = (req.headers["content-type"] || "").includes(
        "application/json"
      );
      if (wantsJson) {
        res.json({ ok: true, openId, role });
      } else {
        res.redirect(302, "/");
      }
    } catch (error) {
      console.error("[DevLogin] failed", error);
      res.status(500).json({ error: "dev login failed" });
    }
  });
}
