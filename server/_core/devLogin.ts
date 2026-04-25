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
  const enabled =
    !ENV.isProduction &&
    (!ENV.oAuthServerUrl || ENV.oAuthServerUrl.trim() === "");

  if (!enabled) return;

  console.log(
    "[DevLogin] Local-dev login enabled at /api/dev/login (no OAUTH_SERVER_URL set)"
  );

  app.get("/api/dev/login", (_req: Request, res: Response) => {
    res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Dev Login — IRB Ultimate</title>
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
<h1>IRB Ultimate — Dev Login</h1>
<p>Local-dev only. Disabled when <code>NODE_ENV=production</code> or <code>OAUTH_SERVER_URL</code> is set.</p>
<form class="card" method="POST" action="/api/dev/login">
  <label>Display name</label>
  <input name="name" value="Dr. Abdulsalam Aleid" required>
  <label>Email</label>
  <input type="email" name="email" value="owner@irb-ultimate.local" required>
  <div class="row">
    <div>
      <label>OpenID</label>
      <input name="openId" value="dev-owner-001" required>
    </div>
    <div>
      <label>Role</label>
      <select name="role"><option value="admin" selected>admin</option><option value="user">user</option></select>
    </div>
  </div>
  <button type="submit">Sign in</button>
  <div class="muted">Tip: set <code>OWNER_OPEN_ID</code> in <code>.env</code> to your openId so admin features auto-grant.</div>
</form></body></html>`);
  });

  app.post("/api/dev/login", async (req: Request, res: Response) => {
    try {
      const openId = String(req.body?.openId || "dev-user-001").slice(0, 64);
      const name = String(req.body?.name || "Dev User").slice(0, 255);
      const email = String(req.body?.email || `${openId}@local.dev`).slice(0, 320);
      const role = req.body?.role === "admin" ? "admin" : "user";

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
