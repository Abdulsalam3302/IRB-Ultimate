import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), safeJsonParse: JSON.parse }));
import { invokeLLM } from "./_core/llm";
import { runSwarmPanel, SWARM_LLM_CALLS_PER_RUN } from "./aiSwarmReview";
const response = (data: unknown) => ({ choices: [{ message: { content: JSON.stringify(data) } }] } as never);
const domain = () => ({ score: 90, votesApprove: 1, votesRevise: 0, votesReject: 0, keyFindings: ["Evidence documented"], redFlags: [], requiredChanges: [], dissentingOpinions: [] });
beforeEach(() => vi.clearAllMocks());
describe("advisory swarm provenance", () => {
  it("counts real domain calls without inventing simulated committee quorum", async () => {
    vi.mocked(invokeLLM).mockImplementation(async args => args.response_format && JSON.stringify(args.response_format).includes('"swarm_chair"')
      ? response({ score: 90, summary: "Needs authorized committee decision", strengths: [], weaknesses: [], requiredChanges: [] })
      : response(domain()));
    const result = await runSwarmPanel({ researchTitle: "Test protocol" } as never, 0);
    expect(result.totalAgents).toBe(6);
    expect(result.votes.approve).toBe(6);
    expect(result.summary).toContain("No human committee votes or ethics authorization");
    expect(invokeLLM).toHaveBeenCalledTimes(7);
    expect(SWARM_LLM_CALLS_PER_RUN).toBe(14);
  });
  it("treats invented or inconsistent vote counts as unavailable, never normalized approval", async () => {
    vi.mocked(invokeLLM).mockResolvedValue(response({ ...domain(), votesApprove: 85 }));
    const result = await runSwarmPanel({ researchTitle: "Test" } as never, 0);
    expect(result.unavailable).toBe(true);
    expect(result.verdict).toBe("fail");
  });
});
