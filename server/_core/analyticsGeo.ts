import { createHmac } from "node:crypto";
import type { Request } from "express";
import { ENV } from "./env";
import { assertSafeEgress } from "./ssrfGuard";
import { clientIpKey } from "./security";

export type CoarseGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export function hashIp(ip: string): string {
  const secret = ENV.cookieSecret || "dev-analytics";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 64);
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

  const ip = clientIpKey(req);
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return { country: null, region: null, city: null };
  }

  // Soft geo via ipapi.co (HTTPS). SSRF-guarded; never block ingest on failure.
  try {
    const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
    await assertSafeEgress(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "irb-platform-analytics/1.1" },
    });
    clearTimeout(timer);
    if (!resp.ok) return { country: null, region: null, city: null };
    const data = (await resp.json()) as Record<string, unknown>;
    if (data.error) return { country: null, region: null, city: null };
    return {
      country: typeof data.country_code === "string" ? data.country_code.slice(0, 64) : null,
      region: typeof data.region === "string" ? data.region.slice(0, 96) : null,
      city: typeof data.city === "string" ? data.city.slice(0, 96) : null,
    };
  } catch {
    return { country: null, region: null, city: null };
  }
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
