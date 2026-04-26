import { ENV } from "../_core/env";
import type { LiteratureBundle, LiteratureItem } from "./types";
import { searchPubMed } from "./pubmed";
import { searchClinicalTrials } from "./clinicalTrials";
import { searchSemanticScholar } from "./semanticScholar";
import { searchOpenAlex } from "./openAlex";
import { searchElicit } from "./elicit";
import { LruTtlCache } from "./cache";
import {
  buildLiteratureQuery,
  scoreRelevance,
  verifyAccessibility,
  rankAndFilter,
} from "./relevance";

export type { LiteratureBundle, LiteratureItem } from "./types";
export { buildLiteratureQuery } from "./relevance";

export interface LiteratureSearchOptions {
  /** How many raw hits to ask each source for. We over-fetch and
   *  then re-rank/filter so the final bundle is more relevant. */
  perSource?: number; // default 6
  /** Final cap per source after relevance filtering. */
  perSourceCap?: number; // default 4
  /** Minimum relevance score (0..1) for an item to survive the
   *  filter. Bumping this lower lets noisier sources through. */
  minRelevance?: number; // default 0.08
  sources?: Array<LiteratureItem["source"]>;
  noCache?: boolean;
}

// Over-fetch so we have room to throw away the noisy results.
const DEFAULT_PER_SOURCE = 6;
const DEFAULT_PER_SOURCE_CAP = 4;
const DEFAULT_MIN_RELEVANCE = 0.08;

// 1-hour TTL, hold up to 256 distinct (query, perSource, sources) bundles.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new LruTtlCache<string, LiteratureBundle>(256, CACHE_TTL_MS);

function cacheKey(query: string, opts: LiteratureSearchOptions): string {
  const perSource = opts.perSource ?? DEFAULT_PER_SOURCE;
  const sources = (opts.sources ?? ["pubmed", "clinicaltrials", "semanticscholar", "openalex", "elicit"])
    .slice()
    .sort()
    .join(",");
  return `${perSource}|${sources}|${query.trim().toLowerCase()}`;
}

/**
 * Hits all configured literature sources in parallel.
 * Each source has its own try/catch so a single failure (rate limit,
 * DNS, schema drift) never breaks the bundle. Failed sources show up
 * in `errors`, the rest in `items`.
 */
export async function searchLiterature(
  query: string,
  opts: LiteratureSearchOptions = {}
): Promise<LiteratureBundle> {
  const limit = opts.perSource ?? DEFAULT_PER_SOURCE;
  const which = new Set(opts.sources ?? ["pubmed", "clinicaltrials", "semanticscholar", "openalex", "elicit"]);

  const key = cacheKey(query, opts);
  if (!opts.noCache) {
    const cached = cache.get(key);
    if (cached) return { ...cached, fetchedAt: cached.fetchedAt };
  }

  const tasks: Array<Promise<{ source: string; items: LiteratureItem[]; total: number } | { source: string; error: string }>> = [];

  if (which.has("pubmed")) {
    tasks.push(
      searchPubMed(query, limit, ENV.pubmedApiKey)
        .then(r => ({ source: "pubmed", ...r }))
        .catch(e => ({ source: "pubmed", error: String(e?.message ?? e).slice(0, 200) }))
    );
  }
  if (which.has("clinicaltrials")) {
    tasks.push(
      searchClinicalTrials(query, limit)
        .then(r => ({ source: "clinicaltrials", ...r }))
        .catch(e => ({ source: "clinicaltrials", error: String(e?.message ?? e).slice(0, 200) }))
    );
  }
  if (which.has("semanticscholar")) {
    tasks.push(
      searchSemanticScholar(query, limit, ENV.semanticScholarApiKey)
        .then(r => ({ source: "semanticscholar", ...r }))
        .catch(e => ({ source: "semanticscholar", error: String(e?.message ?? e).slice(0, 200) }))
    );
  }
  if (which.has("openalex")) {
    tasks.push(
      searchOpenAlex(query, limit, ENV.openAlexApiKey)
        .then(r => ({ source: "openalex", ...r }))
        .catch(e => ({ source: "openalex", error: String(e?.message ?? e).slice(0, 200) }))
    );
  }
  if (which.has("elicit") && ENV.elicitApiKey) {
    tasks.push(
      searchElicit(query, limit, ENV.elicitApiKey, ENV.elicitApiUrl)
        .then(r => ({ source: "elicit", ...r }))
        .catch(e => ({ source: "elicit", error: String(e?.message ?? e).slice(0, 200) }))
    );
  }

  const results = await Promise.all(tasks);

  const rawItems: LiteratureItem[] = [];
  const totals: Record<string, number> = {};
  const rawCounts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const r of results) {
    if ("error" in r) {
      errors[r.source] = r.error;
    } else {
      rawItems.push(...r.items);
      totals[r.source] = r.total;
      rawCounts[r.source] = r.items.length;
    }
  }

  // Verification + relevance pipeline:
  //   1) Score every item against the query (token overlap).
  //   2) Annotate accessibility issues (malformed URL, missing id, etc.).
  //   3) Drop items below the minRelevance floor.
  //   4) Re-cap per source so one noisy upstream can't dominate.
  const minRelevance = opts.minRelevance ?? DEFAULT_MIN_RELEVANCE;
  const perSourceCap = opts.perSourceCap ?? DEFAULT_PER_SOURCE_CAP;
  const scored = verifyAccessibility(scoreRelevance(query, rawItems));
  const items = rankAndFilter(scored, { minRelevance, perSourceCap });

  const bundle: LiteratureBundle = {
    query,
    fetchedAt: new Date().toISOString(),
    totals,
    items,
    errors,
    rawCounts,
    filtered: scored.length - items.length,
    relevanceFloor: minRelevance,
  };
  // Only cache responses that produced any items — never cache total
  // failures (DNS down, all upstreams 429, etc.) so the next call retries.
  if (items.length > 0) cache.set(key, bundle);
  return bundle;
}

export function clearLiteratureCache(): void {
  cache.clear();
}

/**
 * Build a tight, AI-friendly literature context block. Keep it under
 * ~2.5k chars so it doesn't crowd out the rest of the Stage 2 prompt.
 */
export function formatLiteratureForPrompt(bundle: LiteratureBundle): string {
  if (bundle.items.length === 0) return "";

  const lines: string[] = [];
  lines.push("LITERATURE & PRIOR-ART CONTEXT");
  lines.push("(Use this to flag duplication, cite precedent, and assess novelty.)");
  lines.push("");

  // Group by source for legibility
  const bySource: Record<string, LiteratureItem[]> = {};
  for (const it of bundle.items) {
    (bySource[it.source] ||= []).push(it);
  }

  const ORDER: Array<LiteratureItem["source"]> = [
    "clinicaltrials",
    "pubmed",
    "semanticscholar",
    "openalex",
    "elicit",
  ];
  for (const src of ORDER) {
    const list = bySource[src];
    if (!list || list.length === 0) continue;
    const heading = {
      clinicaltrials: "Active / completed registered trials (ClinicalTrials.gov)",
      pubmed: "Peer-reviewed studies (PubMed)",
      semanticscholar: "Citation-graph results (Semantic Scholar)",
      openalex: "Open scholarly index (OpenAlex)",
      elicit: "Synthesised findings (Elicit)",
    }[src];
    lines.push(`▎${heading} — ${bundle.totals[src] ?? list.length} hits, top ${list.length} after relevance filter`);
    for (const it of list) {
      const trial =
        it.trialStatus || it.trialPhase
          ? ` [${[it.trialStatus, it.trialPhase, it.trialEnrollment ? `n=${it.trialEnrollment}` : ""]
              .filter(Boolean)
              .join(", ")}]`
          : "";
      const cites =
        typeof it.citationCount === "number" ? ` (${it.citationCount} cites)` : "";
      const yearV = [it.year, it.venue].filter(Boolean).join(" · ");
      const auth = it.authors.length > 0 ? `${it.authors.slice(0, 2).join(", ")}${it.authors.length > 2 ? " et al." : ""}` : "";
      const rel = typeof it.relevance === "number" ? ` rel=${it.relevance.toFixed(2)}` : "";
      const issues = it.accessibilityIssues && it.accessibilityIssues.length > 0
        ? ` ⚠ ${it.accessibilityIssues.join(", ")}`
        : "";
      lines.push(`  • ${it.title}${rel}${issues}`);
      lines.push(`    ${[auth, yearV].filter(Boolean).join(" — ")}${trial}${cites}${it.doi ? `  doi:${it.doi}` : ""}`);
      if (it.abstract) {
        lines.push(`    ${it.abstract}`);
      }
    }
    lines.push("");
  }

  if (typeof bundle.filtered === "number" && bundle.filtered > 0) {
    lines.push(`(${bundle.filtered} low-relevance items filtered out at floor=${bundle.relevanceFloor ?? "?"})`);
  }
  if (Object.keys(bundle.errors).length > 0) {
    lines.push(`(unavailable sources: ${Object.keys(bundle.errors).join(", ")})`);
  }
  return lines.join("\n").slice(0, 2500);
}
