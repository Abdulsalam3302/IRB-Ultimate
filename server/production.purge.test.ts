import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { env, mocks } = vi.hoisted(() => ({
  env: {
    ownerOpenId: "sb:synthetic-appointed-owner",
    ownerEmail: "contact@example.invalid",
    isProduction: true,
  },
  mocks: { purge: vi.fn(), audit: vi.fn() },
}));

vi.mock("./_core/env", () => ({ ENV: env }));
vi.mock("./db", () => ({
  purgeExampleTestAccounts: mocks.purge,
  addAuditLog: mocks.audit,
  getDb: vi.fn(async () => null),
}));
vi.mock("./_core/budget", () => ({
  reserveLlmCall: vi.fn(),
  inspectLlmBudget: vi.fn(),
}));

import { appRouter } from "./routers";

function context(
  user: { openId: string; role: string; authLevel: string } | null = {
    openId: "sb:synthetic-appointed-owner",
    role: "admin",
    authLevel: "aal2",
  }
) {
  return {
    user: user ? { id: 91, email: env.ownerEmail, ...user } : null,
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext;
}

beforeEach(() => {
  vi.resetAllMocks();
  env.isProduction = true;
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
  mocks.purge.mockResolvedValue({ users: 2, applications: 3 });
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("development account purge cannot bypass production erasure", () => {
  it("denies even the appointed, MFA-verified production owner before any deletion", async () => {
    await expect(
      appRouter.createCaller(context()).admin.purgeTestAccounts()
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("disabled in production"),
    });
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("still denies production purge when the operator has explicitly disabled staff MFA", async () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "false");
    await expect(
      appRouter.createCaller(context()).admin.purgeTestAccounts()
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("disabled in production"),
    });
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps the scoped maintenance action available to the appointed development owner", async () => {
    env.isProduction = false;
    expect(
      await appRouter.createCaller(context()).admin.purgeTestAccounts()
    ).toEqual({ users: 2, applications: 3 });
    expect(mocks.purge).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
      userId: 91,
      action: "test_accounts_purged",
      details: "Removed 2 @example.com test account(s) and 3 application(s).",
    });
  });

  it.each([
    null,
    { openId: "native:other-admin", role: "admin", authLevel: "aal2" },
    { openId: "sb:synthetic-appointed-owner", role: "user", authLevel: "aal2" },
  ])(
    "preserves owner authority in development for unauthorized caller %j",
    async user => {
      env.isProduction = false;
      await expect(
        appRouter.createCaller(context(user)).admin.purgeTestAccounts()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.purge).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  );
});
