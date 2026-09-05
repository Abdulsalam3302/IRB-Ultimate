import type { LiteratureItem } from "./types";
import { fetchWithTimeout, trim, sourceTotal } from "./http";

/**
 * Elicit Search API. Per Elicit docs (docs.elicit.com):
 *   POST https://elicit.com/api/v1/search
 *   Body: { query: string, limit?: number }
 *   Auth: Bearer <elk_live_…>
 *   Response: { papers: [{ elicitId, title, authors, year, abstract, doi, pmid, venue, citedByCount, urls }] }
 *
 * ELICIT_API_URL defaults to that path when only the host is given,
 * so users can set just `https://elicit.com` and it still works.
 */
export async function searchElicit(
  query: string,
  limit: number,
  apiKey: string | undefined,
  apiUrl: string | undefined
): Promise<{ items: LiteratureItem[]; total?: number }> {
  if (!apiKey) {
    throw new Error("Elicit not configured (ELICIT_API_KEY required)");
  }
  // Default to documented endpoint when only a base or nothing is provided.
  const endpoint = (() => {
    const raw = (apiUrl ?? "").trim();
    if (!raw) return "https://elicit.com/api/v1/search";
    if (/\/api\/v\d+\/search$/.test(raw)) return raw;
    return `${raw.replace(/\/$/, "")}/api/v1/search`;
  })();

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit }),
    timeoutMs: 12000,
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Elicit unavailable (HTTP ${res.status})`);
  }
  const json = (await res.json()) as any;
  const raw = json?.papers ?? json?.results ?? json?.data;
  if (!Array.isArray(raw)) throw new Error("Invalid Elicit search response");
  const arr: any[] = Array.isArray(raw) ? raw : [];

  const items: LiteratureItem[] = arr
    .slice(0, limit)
    .map((p: any): LiteratureItem | null => {
      const id = String(p.elicitId ?? p.id ?? p.paperId ?? p.doi ?? "");
      if (!id) return null;
      const url =
        (Array.isArray(p.urls) && p.urls[0]) ||
        p.url ||
        (p.doi ? `https://doi.org/${p.doi}` : undefined) ||
        (p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : undefined);
      return {
        source: "elicit",
        id,
        title: trim(p.title, 250) || id,
        authors: Array.isArray(p.authors) ? p.authors.slice(0, 3).map(String) : [],
        year: typeof p.year === "number" ? p.year : undefined,
        venue: trim(p.venue || p.journal, 120),
        doi: p.doi,
        url,
        abstract: trim(p.abstract || p.summary || p.tldr, 400),
        citationCount:
          typeof p.citedByCount === "number"
            ? p.citedByCount
            : typeof p.citationCount === "number"
              ? p.citationCount
              : undefined,
      };
    })
    .filter((x): x is LiteratureItem => Boolean(x));

  return { items, total: sourceTotal(json?.total) };
}
