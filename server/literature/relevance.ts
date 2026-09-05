import type { LiteratureItem } from "./types";

// Lightweight, deterministic relevance scoring — no LLM call.
// We need this to filter out items that the search APIs returned but
// that aren't actually relevant to the applicant's protocol. A real
// search-engine reranker is overkill; a token-overlap score with
// medical-stopword removal is an inexpensive lexical heuristic, not validated semantic relevance.

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from",
  "has", "have", "in", "is", "it", "its", "of", "on", "or", "that", "the", "this",
  "to", "was", "were", "will", "with", "we", "our", "us", "study", "research",
  "paper", "article", "review", "trial", "investigation", "report", "analysis",
  "methods", "method", "results", "result", "conclusion", "conclusions",
  "background", "objective", "objectives", "patients", "patient", "subjects",
  "subject", "participants", "participant", "data", "case", "cases", "between",
  "among", "after", "before", "using", "used", "use", "based", "during",
  "including", "such", "also", "however", "thus", "than", "may", "can", "could",
  "would", "should", "if", "when", "where", "all", "any", "some", "more", "most",
  "new", "two", "one", "three", "four", "five",
  "دراسة", "بحث", "على", "في", "من", "الى", "إلى", "عن", "بين", "التي", "الذي", "هذه", "هذا", "المرضى", "نتائج",
]);

function tokenize(s: string): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t))
  );
}

/**
 * Build the search query that we send to PubMed/CT/S2/OpenAlex/Elicit.
 * Strategy:
 *   - drop boilerplate filler words ("a study of", "investigation into",
 *     "an exploration of") so search engines weight on real content
 *   - keep numeric tokens (years, arm sizes, ICD-10-style codes)
 *   - keep multi-word noun phrases by joining intervention-condition pairs
 *
 * We do NOT try to be clever with Boolean operators because each
 * upstream parses them differently — clean keywords work better
 * than mixed Boolean syntax across all five sources.
 */
export function buildLiteratureQuery(rawTitle: string, rawObjectives?: string): string {
  const FILLER = [
    /^a (?:cross[- ]?sectional|prospective|retrospective|randomi[sz]ed|controlled|double[- ]?blind|placebo[- ]?controlled|multicent(?:re|er))\s+study of\s+/i,
    /^study of\s+/i,
    /^investigation (?:of|into)\s+/i,
    /^an? (?:exploration|examination|assessment|evaluation) of\s+/i,
    /^the (?:role|effect|impact) of\s+/i,
  ];
  let title = rawTitle.trim();
  for (const re of FILLER) title = title.replace(re, "");
  // Drop the trailing parenthetical (often dates or location)
  title = title.replace(/\s*\([^)]+\)\s*$/, "");

  const parts: string[] = [title];
  if (rawObjectives && rawObjectives.length > 4) {
    // Keep only the first sentence of objectives — the primary endpoint.
    const firstSentence = rawObjectives.split(/[.;\n]/)[0];
    if (firstSentence && firstSentence.length > 6) {
      parts.push(firstSentence);
    }
  }
  return parts.join(" — ").slice(0, 300);
}

/**
 * Score each item 0..1 based on token overlap with the query, with a
 * small bonus for items that have an abstract (more confident
 * relevance signal than a bare title).
 */
export function scoreRelevance(query: string, items: LiteratureItem[]): LiteratureItem[] {
  const qTokens = tokenize(query);
  if (qTokens.size === 0) return items.map(it => ({ ...it, relevance: 0 }));
  return items.map(it => {
    const docText = [it.title, it.abstract, it.venue].filter(Boolean).join(" ");
    const dTokens = tokenize(docText);
    let overlap = 0;
    qTokens.forEach(t => { if (dTokens.has(t)) overlap++; });
    const jaccard = overlap / Math.max(qTokens.size, 1);
    const abstractBonus = overlap > 0 && it.abstract && it.abstract.length > 50 ? 0.1 : 0;
    const relevance = Math.min(1, jaccard + abstractBonus);
    return { ...it, relevance: Number(relevance.toFixed(3)) };
  });
}

/**
 * Per-item accessibility verification — cheap structural checks only.
 *   - URL is well-formed
 *   - Required fields are non-empty
 *   - Trial entries have at least a status
 *
 * We do NOT HEAD-request every URL — that would multiply API call
 * count by 5 and slow the aggregator. Structural verification catches
 * the common upstream-bug failure modes (missing IDs, broken DOIs).
 */
export function verifyAccessibility(items: LiteratureItem[]): LiteratureItem[] {
  return items.map(it => {
    const issues: string[] = [];
    if (!it.title) issues.push("missing title");
    if (!it.id) issues.push("missing id");
    if (it.url) {
      try {
        const u = new URL(it.url);
        if (u.protocol !== "https:" || u.username || u.password) issues.push("unsafe URL");
      } catch {
        issues.push("malformed URL");
      }
    } else {
      issues.push("no URL");
    }
    if (it.source === "clinicaltrials" && !it.trialStatus) issues.push("trial missing status");
    const unsafe = issues.some(issue => ["unsafe URL", "malformed URL"].includes(issue));
    return { ...it, ...(unsafe ? { url: undefined } : {}), accessibilityIssues: issues.length > 0 ? issues : undefined };
  });
}

/**
 * Final filter + ordering. Drop items below the relevance floor, sort
 * descending by relevance, then by citation count, then by year.
 * Items with accessibility issues stay (the UI annotates them) but
 * sink to the bottom of their relevance band.
 */
export function rankAndFilter(
  items: LiteratureItem[],
  opts: { minRelevance?: number; perSourceCap?: number } = {}
): LiteratureItem[] {
  const min = opts.minRelevance ?? 0.08;
  const cap = opts.perSourceCap ?? 4;
  const filtered = items.filter(it => (it.relevance ?? 0) >= min);

  filtered.sort((a, b) => {
    const ra = a.relevance ?? 0;
    const rb = b.relevance ?? 0;
    if (rb !== ra) return rb - ra;
    const aIssues = a.accessibilityIssues?.length ?? 0;
    const bIssues = b.accessibilityIssues?.length ?? 0;
    if (aIssues !== bIssues) return aIssues - bIssues;
    const ca = a.citationCount ?? -1;
    const cb = b.citationCount ?? -1;
    if (cb !== ca) return cb - ca;
    return (b.year ?? 0) - (a.year ?? 0);
  });

  // Re-cap per source so one source can't dominate the bundle.
  const perSource: Record<string, number> = {};
  const out: LiteratureItem[] = [];
  for (const it of filtered) {
    perSource[it.source] = (perSource[it.source] ?? 0) + 1;
    if (perSource[it.source] <= cap) out.push(it);
  }
  return out;
}
