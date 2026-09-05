import { createHmac } from "node:crypto";
import type { Request } from "express";
import { ENV } from "./env";
import { clientIpKey } from "./security";

export type CoarseGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export function hashIp(ip: string): string {
  const secret = ENV.cookieSecret || "dev-analytics";
  return createHmac("sha256", secret).update(`analytics:${new Date().toISOString().slice(0, 10)}:${ip}`).digest("hex").slice(0, 64);
}

export function classifyUa(ua: string | undefined): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|bingpreview/i.test(s)) return "bot";
  if (/mobile|android|iphone|ipad/i.test(s)) return "mobile";
  if (/tablet/i.test(s)) return "tablet";
  return "desktop";
}

/** Prefer edge headers; optional best-effort public geo lookup (fail soft). */
export async function resolveCoarseGeo(req: Request): Promise<CoarseGeo> {
  const cf = typeof req.headers["cf-ipcountry"] === "string" ? req.headers["cf-ipcountry"] : "";
  if (cf && cf.length === 2 && cf.toUpperCase() !== "XX") {
    return { country: cf.toUpperCase(), region: null, city: null };
  }

  // Do not disclose visitor IPs to a third-party geolocation service.
  return { country: null, region: null, city: null };
}

export function stripPath(raw: string): string {
  try {
    if (raw.startsWith("http")) {
      const u = new URL(raw);
      return (u.pathname || "/").slice(0, 255);
    }
  } catch {
    /* fall through */
  }
  const bare = (raw.split("?")[0] || "/").slice(0, 255);
  return bare.startsWith("/") ? bare : `/${bare}`;
}

export function requestIpHash(req: Request): string {
  return hashIp(clientIpKey(req));
}
