import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { status, invoke, budget } = vi.hoisted(() => ({ status: vi.fn(), invoke: vi.fn(), budget: vi.fn() }));
vi.mock("./_core/env", () => ({ ENV: { isProduction: true, ownerOpenId: "native:scanner-owner" } }));
vi.mock("./services/remoteScanner", () => ({ remoteScannerStatus: status }));
vi.mock("./_core/llm", () => ({ invokeLLM: invoke }));
vi.mock("./_core/budget", () => ({ reserveLlmCall: budget, inspectLlmBudget: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("./aiReview", () => ({ describeAiOutage: vi.fn() }));
import { systemRouter } from "./_core/systemRouter";

const syntheticToken = "a".repeat(64);
function context(openId = "native:scanner-owner", role = "admin"): TrpcContext {
  return { user: { id: 1, openId, role, authLevel: "aal1" }, req: {}, res: {} } as TrpcContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
  vi.stubEnv("UPLOAD_SCANNER_MODE", "remote");
  vi.stubEnv("UPLOAD_SCAN_REQUIRED", "true");
  vi.stubEnv("SCANNER_WORKER_TOKENS", JSON.stringify({ primary: syntheticToken }));
  vi.stubEnv("CLAMAV_HOST", "");
  status.mockReturnValue({ connected: 2, available: 2, active: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("owner scanner-status snapshot", () => {
  it.each([
    ["native:secondary-admin", "admin"],
    ["native:scanner-owner", "user"],
  ])("rejects unauthorized subject %s with role %s before reading the broker", async (openId, role) => {
    await expect(systemRouter.createCaller(context(openId, role)).scannerStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(status).not.toHaveBeenCalled();
  });

  it("rejects anonymous access before reading the broker", async () => {
    await expect(systemRouter.createCaller({ ...context(), user: null }).scannerStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(status).not.toHaveBeenCalled();
  });

  it.each([
    [{ connected: 2, available: 2, active: 0 }, "ready"],
    [{ connected: 2, available: 1, active: 1 }, "ready"],
    [{ connected: 2, available: 0, active: 2 }, "busy"],
    [{ connected: 2, available: 0, active: 1 }, "unavailable"],
    [{ connected: 0, available: 0, active: 0 }, "unavailable"],
  ])("reports actual broker counts %j as %s without a provider probe", async (counts, state) => {
    status.mockReturnValue(counts);
    const before = Date.now();
    const result = await systemRouter.createCaller(context()).scannerStatus();
    expect(result).toMatchObject({ ...counts, state, configured: true, required: true, mode: "remote" });
    expect(Date.parse(result.checkedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.checkedAt)).toBeLessThanOrEqual(Date.now());
    expect(JSON.stringify(result)).not.toContain(syntheticToken);
    expect(invoke).not.toHaveBeenCalled();
    expect(budget).not.toHaveBeenCalled();
  });

  it("does not imply uploads are scanned when the policy disables scanning", async () => {
    vi.stubEnv("UPLOAD_SCAN_REQUIRED", "false");
    await expect(systemRouter.createCaller(context()).scannerStatus()).resolves.toMatchObject({ state: "disabled", required: false, available: 2 });
  });

  it("reports missing remote configuration separately from live worker availability", async () => {
    vi.stubEnv("SCANNER_WORKER_TOKENS", "");
    status.mockReturnValue({ connected: 0, available: 0, active: 0 });
    await expect(systemRouter.createCaller(context()).scannerStatus()).resolves.toMatchObject({ state: "not_configured", configured: false, available: 0 });
  });

  it("keeps unprobed private-daemon counts unknown rather than reporting zero", async () => {
    vi.stubEnv("UPLOAD_SCANNER_MODE", "clamav");
    vi.stubEnv("CLAMAV_HOST", "private-daemon");
    await expect(systemRouter.createCaller(context()).scannerStatus()).resolves.toMatchObject({ state: "not_monitored", configured: true, connected: null, available: null, active: null });
    expect(status).not.toHaveBeenCalled();
  });

  it("returns a generic failure rather than successful zero counts when diagnostics fail", async () => {
    status.mockImplementation(() => { throw new Error(`internal token=${syntheticToken}`); });
    await expect(systemRouter.createCaller(context()).scannerStatus()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "Scanner status is temporarily unavailable." });
  });
});
