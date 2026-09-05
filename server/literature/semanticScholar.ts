import type { LiteratureItem } from "./types";
import { fetchWithTimeout, trim, sourceTotal } from "./http";

/**
 * Semantic Scholar Graph API. Strong abstract search + citation counts.
 * Auth via x-api-key header.
 */
export async function searchSemanticScholar(
  query: string,
  limit: number,
  apiKey?: string
): Promise<{ items: LiteratureItem[]; total?: number }> {
  const fields = [
    "title",
    "abstract",
    "year",
    "venue",
    "authors.name",
    "citationCount",
    "externalIds",
    "url",
  ].join(",");
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    query
  )}&limit=${limit}&fields=${fields}`;

  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetchWithTimeout(url, { timeoutMs: 8000, headers });
  if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`);
  const json = (await res.json()) as any;
  if (!Array.isArray(json?.data)) throw new Error("Invalid Semantic Scholar search response");
  const data: any[] = Array.isArray(json?.data) ? json.data.slice(0, limit) : [];

  const items: LiteratureItem[] = data
    .map((p: any): LiteratureItem | null => {
      const id = p.paperId;
      if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(id)) return null;
      return {
        source: "semanticscholar" as const,
        id,
        title: trim(p.title, 250) || id,
        authors: (p.authors ?? [])
          .slice(0, 3)
          .map((a: any) => a?.name)
          .filter(Boolean),
        year: typeof p.year === "number" ? p.year : undefined,
        venue: trim(p.venue, 120),
        doi: p.externalIds?.DOI,
        url: p.url || `https://www.semanticscholar.org/paper/${id}`,
        abstract: trim(p.abstract, 400),
        citationCount:
          typeof p.citationCount === "number" ? p.citationCount : undefined,
      };
    })
    .filter((x): x is LiteratureItem => Boolean(x));

  return { items, total: sourceTotal(json.total) };
}
