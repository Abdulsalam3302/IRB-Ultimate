import type { LiteratureItem } from "./types";
import { fetchWithTimeout, trim, sourceTotal } from "./http";

/**
 * OpenAlex — open scholarly database. Free, no key required for the
 * generous default tier; an api_key gets you the higher quota lane.
 */
export async function searchOpenAlex(
  query: string,
  limit: number,
  apiKey?: string
): Promise<{ items: LiteratureItem[]; total?: number }> {
  const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(
    query
  )}&per-page=${limit}${keyParam}`;

  const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  const json = (await res.json()) as any;
  if (!Array.isArray(json?.results)) throw new Error("Invalid OpenAlex search response");
  const results: any[] = Array.isArray(json?.results) ? json.results.slice(0, limit) : [];

  const items: LiteratureItem[] = results
    .map((w: any): LiteratureItem | null => {
      const id: string | undefined = w.id;
      if (typeof id !== "string" || !/^https:\/\/openalex\.org\/W\d+$/.test(id)) return null;
      const shortId = id.split("/").pop() || id;
      // OpenAlex returns abstract as inverted index — reconstruct.
      const inv = w.abstract_inverted_index;
      let abstract: string | undefined;
      if (inv && typeof inv === "object") {
        const positioned: { pos: number; word: string }[] = [];
        for (const [word, positions] of Object.entries(inv).slice(0, 2000)) {
          if (!Array.isArray(positions)) continue;
          for (const pos of positions.slice(0, 100)) {
            if (Number.isInteger(pos) && pos >= 0 && pos < 5000) positioned.push({ pos, word: word.slice(0, 100) });
          }
        }
        positioned.sort((a, b) => a.pos - b.pos);
        abstract = positioned.map(p => p.word).join(" ");
      }
      return {
        source: "openalex" as const,
        id: shortId,
        title: trim(w.title, 250) || shortId,
        authors: (w.authorships ?? [])
          .slice(0, 3)
          .map((a: any) => a?.author?.display_name)
          .filter(Boolean),
        year: typeof w.publication_year === "number" ? w.publication_year : undefined,
        venue: trim(
          w.primary_location?.source?.display_name || w.host_venue?.display_name,
          120
        ),
        doi: w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//, "") : undefined,
        url: w.id || (w.doi ? `https://doi.org/${w.doi}` : undefined),
        abstract: trim(abstract, 400),
        citationCount:
          typeof w.cited_by_count === "number" ? w.cited_by_count : undefined,
      };
    })
    .filter((x): x is LiteratureItem => Boolean(x));

  return { items, total: sourceTotal(json?.meta?.count) };
}
