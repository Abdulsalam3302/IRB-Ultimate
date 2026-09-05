import { assertSafeEgress } from "../_core/ssrfGuard";
import { readBoundedText } from "../_core/httpSafety";
import { Semaphore } from "../_core/concurrency";
const literatureHttpWork = new Semaphore(6, 18, 3000);

/**
 * Tiny fetch wrapper with timeout — every literature source uses it
 * so a slow upstream can't stall the entire aggregator.
 *
 * At most one retry for read-only GETs on transient provider errors.
 * Metered POST operations never retry automatically. Full bodies are bounded.
 *
 * SA-38: every URL is SSRF-checked before fetch.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  return literatureHttpWork.run(async () => {
  if (new URL(url).protocol !== "https:") throw new Error("Literature transport requires HTTPS");
  await assertSafeEgress(url);
  const { timeoutMs: requestedTimeout = 8000, retries: requestedRetries = 1, ...rest } = init;
  const timeoutMs = Math.max(100, Math.min(12000, Number.isFinite(requestedTimeout) ? requestedTimeout : 8000));
  // Retrying a metered POST can duplicate charges. Only bounded read-only GETs retry.
  const retries = (!rest.method || rest.method === "GET") && Number.isInteger(requestedRetries) ? Math.max(0, Math.min(1, requestedRetries)) : 0;
  const RETRYABLE = new Set([429, 502, 503, 504]);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...rest, redirect: "error", signal: rest.signal ? AbortSignal.any([rest.signal, controller.signal]) : controller.signal });
      if (RETRYABLE.has(resp.status) && attempt < retries) {
        // Honour Retry-After when the server provides one; otherwise
        // exponential backoff with jitter.
        const retryAfter = parseFloat(resp.headers.get("retry-after") ?? "");
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter < 30
          ? retryAfter * 1000
          : Math.min(8000, 600 * Math.pow(2, attempt) + Math.random() * 400);
        await resp.body?.cancel();
        clearTimeout(timer);
        await new Promise(r => setTimeout(r, Math.min(wait, 2000)));
        continue;
      }
      const text = await readBoundedText(resp, 2_000_000);
      clearTimeout(timer);
      const headers = new Headers(resp.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response([204, 205, 304].includes(resp.status) ? null : text, { status: resp.status, statusText: resp.statusText, headers });
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
  throw lastErr ?? new Error("Literature request unavailable");
  });
}

export function trim(s: unknown, n: number): string | undefined {
  if (typeof s !== "string" || !s) return undefined;
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

/** Total counts are reported only when the upstream supplied valid evidence. */
export function sourceTotal(value: unknown): number | undefined {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
