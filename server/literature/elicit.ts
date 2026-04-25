import type { LiteratureItem } from "./types";
import { fetchWithTimeout, trim } from "./http";

/**
 * Elicit research synthesis API.
 *
 * Elicit's public API contract is partner-gated and varies by plan. We
 * leave the endpoint configurable via ELICIT_API_URL so once the user
 * confirms the right path with Elicit support, this lights up without
 * any code change. The aggregator already tolerates failure here, so
 * an unconfigured or wrongly-configured Elicit silently degrades.
 */
export async function searchElicit(
  query: string,
  limit: number,
  apiKey: string | undefined,
  apiUrl: string | undefined
): Promise<{ items: LiteratureItem[]; total: number }> {
  if (!apiKey || !apiUrl) {
    throw new Error("Elicit not configured (ELICIT_API_KEY + ELICIT_API_URL required)");
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const res = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, limit }),
    timeoutMs: 10000,
  });
  if (!res.ok) throw new Error(`Elicit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any;
  const arr: any[] = json?.papers ?? json?.results ?? json?.data ?? [];

  const items: LiteratureItem[] = arr
    .slice(0, limit)
    .map((p: any) => {
      const id = String(p.id ?? p.paperId ?? p.doi ?? Math.random().toString(36).slice(2));
      return {
        source: "elicit" as const,
        id,
        title: trim(p.title, 250) || id,
        authors: Array.isArray(p.authors) ? p.authors.slice(0, 3).map(String) : [],
        year: typeof p.year === "number" ? p.year : undefined,
        venue: trim(p.venue || p.journal, 120),
        doi: p.doi,
        url: p.url || (p.doi ? `https://doi.org/${p.doi}` : undefined),
        abstract: trim(p.abstract || p.summary || p.tldr, 400),
        citationCount:
          typeof p.citationCount === "number" ? p.citationCount : undefined,
      };
    });

  return { items, total: json?.total ?? items.length };
}
