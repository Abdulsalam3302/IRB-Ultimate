import { assertSafeEgress } from "../_core/ssrfGuard";

/**
 * Tiny fetch wrapper with timeout — every literature source uses it
 * so a slow upstream can't stall the entire aggregator.
 *
 * Retries on 429 / 502 / 503 / 504 with exponential backoff. Semantic
 * Scholar and Elicit aggressively rate-limit anonymous and shared keys;
 * a single retry pair recovers most flakes without doubling the SLO.
 *
 * SA-38: every URL is SSRF-checked before fetch.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  await assertSafeEgress(url);
  const { timeoutMs = 8000, retries = 2, ...rest } = init;
  const RETRYABLE = new Set([429, 502, 503, 504]);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...rest, signal: controller.signal });
      clearTimeout(timer);
      if (RETRYABLE.has(resp.status) && attempt < retries) {
        // Honour Retry-After when the server provides one; otherwise
        // exponential backoff with jitter.
        const retryAfter = parseFloat(resp.headers.get("retry-after") ?? "");
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter < 30
          ? retryAfter * 1000
          : Math.min(8000, 600 * Math.pow(2, attempt) + Math.random() * 400);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const wait = Math.min(4000, 400 * Math.pow(2, attempt));
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("fetchWithTimeout: exhausted retries");
}

export function trim(s: string | undefined | null, n: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}
