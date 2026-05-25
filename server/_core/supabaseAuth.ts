import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
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
  });
  const sub = payload.sub;
  if (typeof sub !== "string" || !sub) {
    throw new Error("Invalid Supabase token: missing sub");
  }
  return payload as Record<string, unknown> & { sub: string };
}

function roleForUser(openId: string, email: string | null): "admin" | "user" {
  if (ENV.ownerOpenId && openId === ENV.ownerOpenId) return "admin";
  if (ENV.ownerEmail && email && email.toLowerCase() === ENV.ownerEmail) return "admin";
  return "user";
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
      const role = roleForUser(openId, email);

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: loginMethodFromProvider(provider),
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

      res.json({ ok: true, openId, role });
    } catch (error) {
      console.error("[SupabaseAuth] session bridge failed", error);
      res.status(401).json({ error: "Invalid Supabase session" });
    }
  });
}
