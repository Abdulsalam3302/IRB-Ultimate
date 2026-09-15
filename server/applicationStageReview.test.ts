import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Application } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), audit: vi.fn(), reserve: vi.fn(), model: vi.fn() }));
vi.mock("./db", () => ({ getApplicationById: mocks.get, updateEditableApplication: mocks.update, addAuditLog: mocks.audit, getDb: vi.fn(async () => null) }));
vi.mock("./_core/budget", () => ({ reserveLlmCall: mocks.reserve, inspectLlmBudget: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.model, safeJsonParse: JSON.parse }));
vi.mock("./literature", () => ({ searchLiterature: vi.fn(async () => ({ items: [] })), formatLiteratureForPrompt: vi.fn(() => ""), buildLiteratureQuery: vi.fn(() => "synthetic") }));
import { STAGE2_FIELDS } from "./services/irb.validation";
import { STAGE1_REVIEW_FIELDS } from "./aiReview";
import { runApplicationStageReview } from "./services/applicationStageReview";
import { appRouter } from "./routers";

let app: Application;
function assessment(stage: 1 | 2 = 2, changes = {}) {
  return { score: 90, feedback: "Advisory assessment of supplied study details.", recommendations: [], hasRedFlags: false,
    fieldScores: (stage === 1 ? STAGE1_REVIEW_FIELDS : STAGE2_FIELDS).map(field => ({ field, score: 90, feedback: "Supplied evidence reviewed", suggestion: "" })), ...changes };
}
const response = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
const run = (stage: 1 | 2 = 2, userId = 2) => runApplicationStageReview(stage, 1, userId);
beforeEach(() => {
  vi.resetAllMocks();
  app = { id: 1, applicantId: 2, status: "stage2_pending", researchType: "retrospective", irbCategory: "expedited", researchTitle: "Synthetic retrospective records review", principalInvestigator: "Synthetic investigator", piInstitution: "Synthetic institution", piDepartment: "Research", fundingSource: "", estimatedDuration: "", ...Object.fromEntries(STAGE2_FIELDS.map(field => [field, `Verified applicant information for ${field}.`])) } as unknown as Application;
  mocks.get.mockImplementation(async () => structuredClone(app));
  mocks.update.mockImplementation(async (_id, _user, patch, expected) => {
    if (JSON.stringify(app) !== JSON.stringify(expected)) throw new TRPCError({ code: "CONFLICT", message: "Application changed during this request." });
    app = { ...app, ...patch }; return structuredClone(app);
  });
  mocks.reserve.mockResolvedValue({ ok: true, userRemaining: 35, globalRemaining: 490 });
  mocks.model.mockImplementation(async params => response(assessment(params.response_format.json_schema.name === "stage1_review" ? 1 : 2)));
});

describe("stage review outcomes and model accounting", () => {
  it("does not call a provider or charge for actual missing fields", async () => {
    app.methodology = "  ";
    expect(await run()).toMatchObject({ status: "needs_information", score: null, passed: false, issues: [{ field: "methodology", reason: "empty" }], fieldScores: [] });
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("identifies12 populated unresolved fields without calling them empty", async () => {
    for (const field of STAGE2_FIELDS) app[field] = `Existing meaningful study text. [MISSING — verified ${field} required]`;
    const result = await run();
    expect(result.status).toBe("needs_information"); expect(result.score).toBeNull();
    expect(result.issues).toEqual(STAGE2_FIELDS.map(field => ({ field, reason: "unresolved_placeholder" })));
    expect(result.feedback).not.toContain("are empty"); expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("a two-character sample size is present and still receives a scientific assessment", async () => {
    app.sampleSize = "50";
    const result = await run();
    expect(result).toMatchObject({ status: "completed", score: 90, passed: true, issues: [] });
    expect(mocks.model).toHaveBeenCalledTimes(1); expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(app.status).toBe("stage2_pending"); // AI pass does not lock or submit a draft.
    const parameters = mocks.model.mock.calls[0][0];
    expect(parameters.maxTokens).toBeLessThanOrEqual(3584); expect(parameters.timeoutMs).toBeLessThanOrEqual(24_000);
    expect(Buffer.byteLength(JSON.stringify(parameters.messages))).toBeLessThan(12_000);
  });
  it("optional Stage1 funding and duration do not become mandatory blank failures", async () => {
    expect(await run(1)).toMatchObject({ status: "completed", passed: true });
    expect(mocks.model).toHaveBeenCalledTimes(1);
  });
  it("an oversized protocol is not silently truncated or scored", async () => {
    app.methodology = "س".repeat(45_000);
    expect(await run()).toMatchObject({ status: "unavailable", unavailableReason: "input_too_large", score: null });
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("outage preserves prior completed review and returns no zero score or red flags", async () => {
    app.stage2AiScore = 85; app.stage2AiFeedback = JSON.stringify({ ...assessment(), score: 85 });
    const saved = structuredClone(app);
    mocks.model.mockRejectedValue(new Error("LLM provider unavailable (HTTP 503)"));
    expect(await run()).toMatchObject({ status: "unavailable", score: null, hasRedFlags: false, fieldScores: [] });
    expect(mocks.model).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled(); expect(app).toEqual(saved);
  });
  it.each(["401", "403", "429"])("does not retry provider HTTP%s authentication/quota rejection", async status => {
    mocks.model.mockRejectedValue(new Error(`LLM provider unavailable (HTTP ${status})`));
    expect(await run()).toMatchObject({ status: "unavailable", score: null, retryable: false });
    expect(mocks.model).toHaveBeenCalledTimes(1); expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });
  it("retries invalid structured output once and reserves each provider attempt", async () => {
    mocks.model.mockResolvedValueOnce({ choices: [{ message: { content: "{truncated" } }] });
    expect(await run()).toMatchObject({ status: "completed", score: 90 });
    expect(mocks.model).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect(mocks.model.mock.calls[1][0].timeoutMs).toBeLessThanOrEqual(10_000);
  });
  it("does not disguise repeated invalid output as a protocol failure", async () => {
    mocks.model.mockResolvedValue(response({ score: 100, feedback: "Approved!" }));
    expect(await run()).toMatchObject({ status: "unavailable", unavailableReason: "invalid_response", score: null });
    expect(mocks.model).toHaveBeenCalledTimes(2); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([0, 40, 100])("contradictory overall score%s remains an invalid assessment rather than a protocol failure", async score => {
    mocks.model.mockResolvedValue(response(assessment(2, { score })));
    expect(await run()).toMatchObject({ status: "unavailable", unavailableReason: "invalid_response", score: null, fieldScores: [] });
    expect(mocks.model).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(2); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("budget exhaustion before any attempt causes no provider call or write", async () => {
    mocks.reserve.mockResolvedValue({ ok: false, resetAt: "2026-09-16T00:00:00Z" });
    await expect(run()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not start a provider attempt when slow accounting has exhausted the review deadline", async () => {
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    mocks.reserve.mockImplementation(async () => { now += 39_000; return { ok: true }; });
    try {
      expect(await run()).toMatchObject({ status: "unavailable", unavailableReason: "timeout", score: null });
      expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it.each(["exhausted", "unavailable"])("retry accounting %s returns original unavailable result without a free attempt", async reason => {
    mocks.model.mockRejectedValue(new Error("LLM request timed out"));
    if (reason === "exhausted") mocks.reserve.mockResolvedValueOnce({ ok: true }).mockResolvedValue({ ok: false });
    else mocks.reserve.mockResolvedValueOnce({ ok: true }).mockRejectedValue(new Error("Accounting unavailable"));
    expect(await run()).toMatchObject({ status: "unavailable", unavailableReason: "timeout", score: null });
    expect(mocks.model).toHaveBeenCalledTimes(1); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("a critical field still blocks preparation even if the model omits its red flag", async () => {
    const review = assessment(); review.fieldScores.find(field => field.field === "riskAssessment")!.score = 20;
    review.score = Math.round(review.fieldScores.reduce((sum, field) => sum + field.score, 0) / review.fieldScores.length);
    mocks.model.mockResolvedValue(response(review));
    expect(await run()).toMatchObject({ status: "completed", passed: false, hasRedFlags: true });
    expect(app.stage2Passed).toBe(false); expect(app.status).toBe("stage2_failed");
  });
});

describe("stage review cache, coalescing, authorization and stale results", () => {
  it.each(["submitted", "resubmission_required"])("permits %s preparation without treating an old draft as a committee submission", async status => {
    app.status = status as Application["status"];
    app.submittedAt = status === "submitted" ? null : new Date();
    expect(await run()).toMatchObject({ status: "completed", passed: true });
    expect(mocks.model).toHaveBeenCalledTimes(1);
  });
  it("rejects a timestamped legacy submitted record before cache, allowance, or provider access", async () => {
    app.status = "submitted"; app.submittedAt = new Date();
    await expect(run()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("reuses only a validated result for exact current content without another paid call", async () => {
    await run();
    expect(await run()).toMatchObject({ status: "completed", cached: true, score: 90 });
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.model).toHaveBeenCalledTimes(1); expect(mocks.update).toHaveBeenCalledTimes(1);
    app.methodology += " Newly supplied procedure.";
    expect(await run()).toMatchObject({ cached: false });
    expect(mocks.model).toHaveBeenCalledTimes(2);
  });
  it("invalid cached field assessment cannot claim a pass", async () => {
    await run(); const saved = JSON.parse(app.stage2AiFeedback!); saved.fieldScores = []; app.stage2AiFeedback = JSON.stringify(saved);
    expect(await run()).toMatchObject({ cached: false }); expect(mocks.model).toHaveBeenCalledTimes(2);
  });
  it("coalesces concurrent identical requests into one model call and one persistence operation", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => { release = resolve; }); mocks.model.mockReturnValueOnce(pending);
    const first = run(); const second = run();
    await vi.waitFor(() => expect(mocks.model).toHaveBeenCalledTimes(1));
    release(response(assessment()));
    expect((await Promise.all([first, second])).every(result => result.status === "completed")).toBe(true);
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("passes the original snapshot to the durable guard and rejects a concurrent applicant edit", async () => {
    mocks.model.mockImplementation(async () => { app.methodology = "Newer applicant edit"; return response(assessment()); });
    await expect(run()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(app.methodology).toBe("Newer applicant edit"); expect(app.stage2AiScore).toBeUndefined();
  });
  it("checks ownership before cache, accounting or AI", async () => {
    await expect(run(2, 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("router aliases use shared preflight without middleware charging", async () => {
    app.methodology = "";
    const caller = appRouter.createCaller({ user: { id: 2, openId: "synthetic:2", role: "user" }, req: { headers: {} }, res: {} } as unknown as TrpcContext);
    expect(await caller.application.runStage2Review({ id: 1 })).toMatchObject({ status: "needs_information", score: null });
    app.principalInvestigator = "";
    expect(await caller.application.runStage1Review({ id: 1 })).toMatchObject({ status: "needs_information", score: null });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
