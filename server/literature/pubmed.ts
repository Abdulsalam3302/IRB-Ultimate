import type { LiteratureItem } from "./types";
import { fetchWithTimeout, trim } from "./http";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export async function searchPubMed(
  query: string,
  limit: number,
  apiKey?: string
): Promise<{ items: LiteratureItem[]; total: number }> {
  const keyParam = apiKey ? `&api_key=${apiKey}` : "";

  // 1) esearch — get PMIDs
  const searchUrl = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    query
  )}&retmax=${limit}&retmode=json&sort=relevance${keyParam}`;
  const searchRes = await fetchWithTimeout(searchUrl, { timeoutMs: 8000 });
  if (!searchRes.ok) throw new Error(`PubMed esearch ${searchRes.status}`);
  const searchJson = (await searchRes.json()) as any;
  const ids: string[] = searchJson?.esearchresult?.idlist ?? [];
  const total: number = parseInt(searchJson?.esearchresult?.count ?? "0", 10);
  if (ids.length === 0) return { items: [], total };

  // 2) esummary — get titles/authors/year/journal
  const summaryUrl = `${BASE}/esummary.fcgi?db=pubmed&id=${ids.join(
    ","
  )}&retmode=json${keyParam}`;
  const summaryRes = await fetchWithTimeout(summaryUrl, { timeoutMs: 8000 });
  if (!summaryRes.ok) throw new Error(`PubMed esummary ${summaryRes.status}`);
  const summaryJson = (await summaryRes.json()) as any;
  const result = summaryJson?.result ?? {};

  const items: LiteratureItem[] = ids
    .map((id): LiteratureItem | null => {
      const r = result[id];
      if (!r) return null;
      const authors: string[] = (r.authors ?? [])
        .slice(0, 3)
        .map((a: any) => a?.name)
        .filter(Boolean);
      const doi = (r.elocationid ?? "")
        .replace(/^doi:\s*/i, "")
        .trim() || undefined;
      const year = r.pubdate ? parseInt(String(r.pubdate).slice(0, 4), 10) : undefined;
      return {
        source: "pubmed" as const,
        id,
        title: trim(r.title, 250) || `PMID:${id}`,
        authors,
        year: Number.isFinite(year) ? year : undefined,
        venue: trim(r.fulljournalname || r.source, 120),
        doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    })
    .filter((x): x is LiteratureItem => Boolean(x));

  return { items, total };
}
