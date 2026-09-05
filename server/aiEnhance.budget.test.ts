import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ application: vi.fn(), update: vi.fn(), reserve: vi.fn(), model: vi.fn() }));
vi.mock("./db", () => ({ getApplicationById: mocks.application, updateEditableApplication: mocks.update, addAuditLog: vi.fn(), getDb: vi.fn(async () => null) }));
vi.mock("./_core/budget", () => ({ reserveLlmCall: mocks.reserve, inspectLlmBudget: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.model, safeJsonParse: JSON.parse }));
// Both real AI helpers execute; only their external provider boundary is mocked.
import { appRouter } from "./routers";

const fields = {
  researchTitle: "Prospective observational study of synthetic outcomes", principalInvestigator: "Synthetic investigator",
  piInstitution: "Synthetic institution", piDepartment: "Research", fundingSource: "Self-funded", estimatedDuration: "Six months",
};
const application = { id: 1, applicantId: 2, status: "stage1_failed", researchType: "observational", irbCategory: "expedited", ...fields };
const reviewFields = ["researchType", "irbCategory", "researchTitle", "principalInvestigator", "piInstitution", "piDepartment", "fundingSource", "estimatedDuration"];
const context = { user: { id: 2, openId: "synthetic:2", role: "user" }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
const run = () => appRouter.createCaller(context).application.aiEnhanceStage1({ id: 1 });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.application.mockResolvedValue({ ...application });
  mocks.update.mockImplementation(async (_id, _userId, patch) => ({ ...application, ...patch }));
  mocks.reserve.mockResolvedValue({ ok: true, userRemaining: 38, globalRemaining: 498 });
  mocks.model.mockImplementation(async params => {
    expect(mocks.reserve).toHaveBeenCalledTimes(2);
    const result = params.response_format.json_schema.name === "stage1_enhance" ? fields : {
      score: 90, feedback: "Synthetic advisory assessment", recommendations: [], hasRedFlags: false,
      fieldScores: reviewFields.map(field => ({ field, score: 90, feedback: "Provided", suggestion: "" })),
    };
    return { choices: [{ message: { content: JSON.stringify(result) } }] };
  });
});

describe("enhance/re-review reserves its complete provider fanout", () => {
  it("reserves exactly two calls before the two real helper invocations", async () => {
    await run();
    expect(mocks.reserve.mock.calls).toEqual([[2], [2]]);
    expect(mocks.model).toHaveBeenCalledTimes(2);
    expect(mocks.model.mock.calls.map(([params]) => params.response_format.json_schema.name)).toEqual(["stage1_enhance", "stage1_review"]);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
  it.each(["user", "global"])("denies insufficient %s allowance before either provider or draft mutation", async reason => {
    mocks.reserve.mockResolvedValueOnce({ ok: true, userRemaining: 1, globalRemaining: 1 })
      .mockResolvedValueOnce({ ok: false, reason, resetAt: "2026-09-06T00:00:00.000Z" });
    await expect(run()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("fails closed when accounting becomes unavailable for the second reservation", async () => {
    mocks.reserve.mockResolvedValueOnce({ ok: true, userRemaining: 1, globalRemaining: 1 })
      .mockRejectedValueOnce(new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Accounting unavailable" }));
    await expect(run()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not take the extra reservation when application ownership fails", async () => {
    mocks.application.mockResolvedValue({ ...application, applicantId: 99 });
    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Existing aiProcedure middleware reservation is retained; no second cost.
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.model).not.toHaveBeenCalled();
  });
  it("does not take the extra reservation for an application locked against editing", async () => {
    mocks.application.mockResolvedValue({ ...application, status: "approved" });
    await expect(run()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.reserve).toHaveBeenCalledTimes(1); expect(mocks.model).not.toHaveBeenCalled();
  });
});
