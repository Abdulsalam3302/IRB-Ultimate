import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./pubmed", () => ({ searchPubMed: vi.fn() }));
vi.mock("./clinicalTrials", () => ({ searchClinicalTrials: vi.fn() }));
vi.mock("./semanticScholar", () => ({ searchSemanticScholar: vi.fn() }));
vi.mock("./openAlex", () => ({ searchOpenAlex: vi.fn() }));
vi.mock("./elicit", () => ({ searchElicit: vi.fn() }));
import { searchPubMed } from "./pubmed";
import { clearLiteratureCache, formatLiteratureForPrompt, searchLiterature } from "./index";
import { scoreRelevance, verifyAccessibility } from "./relevance";
import type { LiteratureItem } from "./types";
const item = (title = "diabetes insulin trial"): LiteratureItem => ({ source: "pubmed", id: "1", title, authors: [], url: "https://pubmed.ncbi.nlm.nih.gov/1/" });
beforeEach(() => { vi.clearAllMocks(); clearLiteratureCache(); vi.mocked(searchPubMed).mockResolvedValue({ items: [item()], total: 7 }); });
describe("literature evidence integrity", () => {
  it("includes relevance and per-source output caps in the cache identity", async () => {
    await searchLiterature("diabetes", { sources: ["pubmed"], minRelevance: 0.1, perSourceCap: 4 });
    await searchLiterature("diabetes", { sources: ["pubmed"], minRelevance: 0.9, perSourceCap: 1 });
    expect(searchPubMed).toHaveBeenCalledTimes(2);
  });
  it("coalesces concurrent identical requests and never shares mutable cached data", async () => {
    const [a, b] = await Promise.all([searchLiterature("diabetes", { sources: ["pubmed"] }), searchLiterature("diabetes", { sources: ["pubmed"] })]);
    expect(searchPubMed).toHaveBeenCalledTimes(1);
    a.items[0].title = "MUTATED";
    expect(b.items[0].title).not.toBe("MUTATED");
    expect((await searchLiterature("diabetes", { sources: ["pubmed"] })).items[0].title).not.toBe("MUTATED");
  });
  it("never exposes provider errors or treats unavailable source totals as zero", async () => {
    vi.mocked(searchPubMed).mockRejectedValue(new Error("api_key=PRIVATE and private protocol text"));
    const failed = await searchLiterature("diabetes", { sources: ["pubmed"] });
    expect(JSON.stringify(failed)).not.toContain("PRIVATE");
    expect(failed.totals).not.toHaveProperty("pubmed");
    vi.mocked(searchPubMed).mockResolvedValue({ items: [item()] });
    const unknown = await searchLiterature("diabetes", { sources: ["pubmed"] });
    expect(unknown.totals).not.toHaveProperty("pubmed");
    expect(formatLiteratureForPrompt(unknown)).toContain("total unavailable");
  });
  it("retains Arabic lexical terms and gives unrelated abstracts no free relevance pass", () => {
    expect(scoreRelevance("السكري الأنسولين", [item("السكري الأنسولين")])[0].relevance).toBe(1);
    expect(scoreRelevance("diabetes insulin", [{ ...item("planetary astronomy"), abstract: "Completely unrelated words ".repeat(10) }])[0].relevance).toBe(0);
  });
  it("removes dangerous source links instead of leaving a clickable unsafe URL", () => {
    for (const url of ["javascript:alert(1)", "https://user:secret@example.com/", "httpx://example.com"]) {
      const checked = verifyAccessibility([{ ...item(), url }])[0];
      expect(checked.url).toBeUndefined();
      expect(checked.accessibilityIssues?.length).toBeGreaterThan(0);
    }
  });
});
