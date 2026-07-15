import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function loginMethodFromProvider(provider: unknown): string {
  if (typeof provider === "string" && provider.length > 0) return provider;
  return "supabase";
}

function displayName(payload: Record<string, unknown>): string {
  const meta = payload.user_metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    const full = m.full_name ?? m.name;
    if (typeof full === "string" && full.trim()) return full.trim().slice(0, 255);
  }
  const email = payload.email;
  if (typeof email === "string" && email.includes("@")) {
    return email.split("@")[0]!.slice(0, 255);
  }
  return "Researcher";
}

async function verifySupabaseAccessToken(token: string) {
  if (!ENV.supabaseUrl) throw new Error("Supabase not configured");
  const jwks = createRemoteJWKSet(
    new URL(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`)
  );
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1`,
    audience: "authenticated",
  });
  const sub = payload.sub;
  if (typeof sub !== "string" || !sub) {
    throw new Error("Invalid Supabase token: missing sub");
  }
  return payload as Record<string, unknown> & { sub: string };
}

/**
 * Returns admin only for OWNER_OPEN_ID, or one-time owner-email bootstrap
 * when no admin exists yet. Returns undefined when we must not touch role
 * (avoids demoting an existing admin on later logins).
 */
async function roleForUser(
  openId: string,
  email: string | null,
  emailVerified: boolean
): Promise<"admin" | undefined> {
  if (ENV.ownerOpenId && openId === ENV.ownerOpenId) return "admin";
  // Owner-by-email promotion only when Supabase has confirmed the address
  // AND no admin exists yet (matches native / upsertUser bootstrap).
  if (emailVerified && ENV.ownerEmail && email && email.toLowerCase() === ENV.ownerEmail) {
    if (!(await db.adminExists())) return "admin";
  }
  return undefined;
}

export function registerSupabaseAuthRoutes(app: Express) {
  if (!ENV.supabaseUrl) return;

  console.log("[SupabaseAuth] Session bridge enabled at POST /api/auth/supabase/session");

  app.post("/api/auth/supabase/session", async (req: Request, res: Response) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
      res.status(401).json({ error: "Missing Bearer token" });
      return;
    }

    try {
      const payload = await verifySupabaseAccessToken(token);
      const openId = `sb:${payload.sub}`.slice(0, 64);
      const email =
        typeof payload.email === "string" ? payload.email.trim().slice(0, 320) : null;
      const appMeta = payload.app_metadata;
      const provider =
        appMeta && typeof appMeta === "object" && !Array.isArray(appMeta)
          ? (appMeta as Record<string, unknown>).provider
          : payload.aal;
      const name = displayName(payload);
      const emailVerified =
        payload.email_confirmed_at != null ||
        (payload.user_metadata as Record<string, unknown> | undefined)?.email_verified === true;
      const role = await roleForUser(openId, email, Boolean(emailVerified));

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: loginMethodFromProvider(provider),
        ...(role ? { role } : {}),
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

      res.json({ ok: true, openId, role: role ?? "user" });
    } catch (error) {
      console.error("[SupabaseAuth] session bridge failed", error);
      res.status(401).json({ error: "Invalid Supabase session" });
    }
  });
}
