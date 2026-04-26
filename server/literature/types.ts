/**
 * Unified shape every literature source maps into. Keep small —
 * the AI prompt has a token budget.
 */
export interface LiteratureItem {
  source: "pubmed" | "clinicaltrials" | "semanticscholar" | "openalex" | "elicit";
  id: string; // PMID / NCT / S2 paperId / OpenAlex W-id / Elicit id
  title: string;
  authors: string[]; // truncated to first 3
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string; // truncated to ~400 chars
  citationCount?: number;
  trialStatus?: string; // ClinicalTrials only
  trialPhase?: string;
  trialEnrollment?: number;
  /** 0..1 relevance score against the search query (token overlap). */
  relevance?: number;
  /** Structural-check issues found by the verifier. UI shows a warning
   *  pill on items that have any. */
  accessibilityIssues?: string[];
}

export interface LiteratureBundle {
  query: string;
  fetchedAt: string;
  totals: Record<string, number>;
  items: LiteratureItem[];
  errors: Record<string, string>;
  /** Per-source raw hit counts before relevance filtering. */
  rawCounts?: Record<string, number>;
  /** Number of items dropped by the relevance filter. */
  filtered?: number;
  /** Minimum relevance threshold actually used. */
  relevanceFloor?: number;
}
