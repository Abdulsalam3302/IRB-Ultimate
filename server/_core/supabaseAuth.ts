import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { assertSupabaseIdentityActive } from "../services/storageDeletionIdentity";

const BOOT_OWNER_OPEN_ID = ENV.ownerOpenId;

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

const jwks = ENV.supabaseUrl ? createRemoteJWKSet(new URL(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`)) : null;

async function verifySupabaseAccessToken(token: string) {
  if (!ENV.supabaseUrl) throw new Error("Supabase not configured");
  const { payload } = await jwtVerify(token, jwks!, {
    issuer: `${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1`,
    audience: "authenticated",
  });
  const sub = payload.sub;
  if (typeof sub !== "string" || !/^[A-Za-z0-9-]{1,36}$/.test(sub)) {
    throw new Error("Invalid Supabase token: missing sub");
  }
  return payload as Record<string, unknown> & { sub: string };
}

/**
 * Only the explicitly configured subject may receive owner bootstrap authority.
 * Matching an email, including a provider-verified address, grants no privilege.
 * Undefined preserves an existing role assigned through the staff workflow.
 */
function roleForUser(openId: string): "admin" | undefined {
  if (BOOT_OWNER_OPEN_ID && openId === BOOT_OWNER_OPEN_ID) return "admin";
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
      const openId = `sb:${payload.sub}`;
      const identityIssuer = `${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1`;
      await assertSupabaseIdentityActive(openId, identityIssuer);
      const email =
        typeof payload.email === "string" ? payload.email.trim().slice(0, 320) : null;
      const appMeta = payload.app_metadata;
      const provider =
        appMeta && typeof appMeta === "object" && !Array.isArray(appMeta)
          ? (appMeta as Record<string, unknown>).provider
          : payload.aal;
      const name = displayName(payload);
      const role = roleForUser(openId);

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: loginMethodFromProvider(provider),
        identityIssuer,
        ...(role ? { role } : {}),
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: SESSION_TTL_MS,
        authLevel: payload.aal === "aal2" ? "aal2" : "aal1",
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: SESSION_TTL_MS,
      });

      res.json({ ok: true, openId, role: role ?? "user" });
    } catch (error) {
      console.error("[SupabaseAuth] invalid session");
      res.status(401).json({ error: "Invalid Supabase session" });
    }
  });
}
