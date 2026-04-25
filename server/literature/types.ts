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
}

export interface LiteratureBundle {
  query: string;
  fetchedAt: string;
  totals: Record<string, number>;
  items: LiteratureItem[];
  errors: Record<string, string>;
}
