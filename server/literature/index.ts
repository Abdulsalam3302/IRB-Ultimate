import { ENV } from "../_core/env";
import type { LiteratureBundle, LiteratureItem } from "./types";
import { searchPubMed } from "./pubmed";
import { searchClinicalTrials } from "./clinicalTrials";
import { searchSemanticScholar } from "./semanticScholar";
import { searchOpenAlex } from "./openAlex";
import { searchElicit } from "./elicit";

export type { LiteratureBundle, LiteratureItem } from "./types";

export interface LiteratureSearchOptions {
  perSource?: number; // default 4
  sources?: Array<LiteratureItem["source"]>; // default: all
}

const DEFAULT_PER_SOURCE = 4;

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
  if (which.has("elicit") && ENV.elicitApiKey && ENV.elicitApiUrl) {
    tasks.push(
      searchElicit(query, limit, ENV.elicitApiKey, ENV.elicitApiUrl)
        .then(r => ({ source: "elicit", ...r }))
        .catch(e => ({ source: "elicit", error: String(e?.message ?? e).slice(0, 200) }))
    );
  }

  const results = await Promise.all(tasks);

  const items: LiteratureItem[] = [];
  const totals: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const r of results) {
    if ("error" in r) {
      errors[r.source] = r.error;
    } else {
      items.push(...r.items);
      totals[r.source] = r.total;
    }
  }

  return {
    query,
    fetchedAt: new Date().toISOString(),
    totals,
    items,
    errors,
  };
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
    lines.push(`▎${heading} — ${bundle.totals[src] ?? list.length} hits, top ${list.length}`);
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
      lines.push(`  • ${it.title}`);
      lines.push(`    ${[auth, yearV].filter(Boolean).join(" — ")}${trial}${cites}${it.doi ? `  doi:${it.doi}` : ""}`);
      if (it.abstract) {
        lines.push(`    ${it.abstract}`);
      }
    }
    lines.push("");
  }

  if (Object.keys(bundle.errors).length > 0) {
    lines.push(`(unavailable sources: ${Object.keys(bundle.errors).join(", ")})`);
  }
  return lines.join("\n").slice(0, 2500);
}
