import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./http", async () => ({ ...await vi.importActual<typeof import("./http")>("./http"), fetchWithTimeout: vi.fn() }));
import { fetchWithTimeout } from "./http";
import { searchClinicalTrials } from "./clinicalTrials";
import { searchPubMed } from "./pubmed";
import { searchElicit } from "./elicit";
beforeEach(() => vi.clearAllMocks());
describe("source result provenance", () => {
  it("uses ClinicalTrials totalCount, not the current page length", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response(JSON.stringify({ studies: [], totalCount: 1234 })));
    expect((await searchClinicalTrials("synthetic query", 3)).total).toBe(1234);
    expect(vi.mocked(fetchWithTimeout).mock.calls[0][0]).toContain("countTotal=true");
  });
  it("marks missing response containers as unavailable instead of empty evidence", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("{}"));
    await expect(searchClinicalTrials("query", 3)).rejects.toThrow("Invalid ClinicalTrials search response");
  });
  it("URL-encodes source credentials and leaves unknown PubMed totals unavailable", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response(JSON.stringify({ esearchresult: { idlist: [] } })));
    expect((await searchPubMed("query", 3, "fixture&other=value")).total).toBeUndefined();
    expect(vi.mocked(fetchWithTimeout).mock.calls[0][0]).toContain("api_key=fixture%26other%3Dvalue");
  });
  it("does not echo Elicit response bodies containing private input", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("PRIVATE PATIENT api_key=secret", { status: 503 }));
    await expect(searchElicit("query", 3, "fixture", undefined)).rejects.toThrow("Elicit unavailable (HTTP 503)");
  });
});
