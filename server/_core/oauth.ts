import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_DEV,
  OAUTH_STATE_TTL_MS,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { randomBytes, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function isSecure(req: Request): boolean {
  if (req.protocol === "https") return true;
  const xfp = req.headers["x-forwarded-proto"];
  if (!xfp) return false;
  const list = Array.isArray(xfp) ? xfp : xfp.split(",");
  return list.some(p => p.trim().toLowerCase() === "https");
}

function stateCookieName(req: Request): string {
  // __Host- prefix is only legal over HTTPS; use the unprefixed name in dev.
  return isSecure(req) ? OAUTH_STATE_COOKIE : OAUTH_STATE_COOKIE_DEV;
}

function clearStateCookie(req: Request, res: Response) {
  res.clearCookie(stateCookieName(req), { path: "/" });
}

function getOwnRedirectUri(req: Request): string {
  const proto = isSecure(req) ? "https" : req.protocol;
  if (ENV.publicAppUrl) {
    return `${ENV.publicAppUrl.replace(/\/$/, "")}/api/oauth/callback`;
  }
  return `${proto}://${req.get("host")}/api/oauth/callback`;
}

export function registerOAuthRoutes(app: Express) {
  /**
   * Begin the OAuth dance (SA-02).
   *
   * Server mints a random nonce, stores it in a __Host- cookie, and redirects
   * the user to the configured OAuth portal with that nonce as `state`. The
   * portal sends the user back to /api/oauth/callback with `code` + `state`;
   * we then require the state to match the cookie. Without this binding the
   * old design (state = atob(redirectUri)) had no CSRF protection.
   *
   * The optional `?next=/some/path` is captured into a separate
   * `oauth_dest` cookie. It MUST be a relative path beginning with "/" —
   * any absolute URL is rejected to close the open-redirect surface.
   */
  app.get("/api/oauth/start", (req: Request, res: Response) => {
    if (!ENV.oAuthPortalUrl) {
      res.status(503).type("text/plain").send("OAuth portal not configured");
      return;
    }
    const nonce = randomBytes(32).toString("hex");
    const dest = getQueryParam(req, "next") || "/";
    const safeDest = /^\/(?!\/)/.test(dest) ? dest : "/";

    const secure = isSecure(req);
    res.cookie(stateCookieName(req), nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: OAUTH_STATE_TTL_MS,
    });
    res.cookie("oauth_dest", safeDest, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: OAUTH_STATE_TTL_MS,
    });

    const redirectUri = getOwnRedirectUri(req);
    const url = new URL(`${ENV.oAuthPortalUrl.replace(/\/$/, "")}/app-auth`);
    url.searchParams.set("appId", ENV.appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", nonce);
    url.searchParams.set("type", "signIn");
    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Verify state against the cookie we set in /start. Reject if missing,
    // expired, or not a constant-time match. Always clear the cookie.
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expected = cookies[stateCookieName(req)] ?? "";
    clearStateCookie(req, res);
    if (!expected || expected.length !== state.length) {
      res.status(400).json({ error: "invalid oauth state" });
      return;
    }
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(state);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        res.status(400).json({ error: "invalid oauth state" });
        return;
      }
    } catch {
      res.status(400).json({ error: "invalid oauth state" });
      return;
    }

    try {
      const redirectUri = getOwnRedirectUri(req);
      const tokenResponse = await sdk.exchangeCodeForToken(code, redirectUri);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: SESSION_TTL_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: SESSION_TTL_MS,
      });

      // Recover the post-login destination from oauth_dest, then clear it.
      const dest = cookies["oauth_dest"] ?? "/";
      const safeDest = /^\/(?!\/)/.test(dest) ? dest : "/";
      res.clearCookie("oauth_dest", { path: "/" });
      res.redirect(302, safeDest);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
