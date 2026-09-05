import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { env } = vi.hoisted(() => ({ env: { ownerOpenId: "sb:appointed-owner", ownerEmail: "owner@example.invalid", isProduction: true } }));
vi.mock("./_core/env", () => ({ ENV: env }));
vi.mock("./_core/budget", () => ({ reserveLlmCall: vi.fn(), inspectLlmBudget: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));

beforeEach(() => {
  vi.resetModules();
  Object.assign(env, { ownerOpenId: "sb:appointed-owner", ownerEmail: "owner@example.invalid", isProduction: true });
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
});
afterEach(() => vi.unstubAllEnvs());

function account(openId = "sb:appointed-owner", role = "admin") {
  return { id: 17, openId, role, authLevel: "aal1", email: env.ownerEmail, passwordHash: "synthetic-private-hash" };
}
function context(user: ReturnType<typeof account> | null) {
  return { user, req: { headers: {} }, res: {} } as unknown as TrpcContext;
}

describe("owner MFA policy returned by auth.me", () => {
  it.each([
    ["sb:appointed-owner", "admin", true],
    ["sb:secondary-admin", "admin", false],
    ["sb:reviewer", "committee_member", false],
    ["sb:appointed-owner", "user", false],
    ["native:appointed-owner", "admin", false],
    ["sb:APPOINTED-OWNER", "admin", false],
  ] as const)("matches enforcement for authenticated subject %s with role %s", async (openId, role, isOwner) => {
    const { appRouter } = await import("./routers");
    const { assertStaffMfa, staffMfaRequired } = await import("./_core/staffAuth");
    const user = account(openId, role);
    const me = await appRouter.createCaller(context(user)).auth.me();
    expect(me).toMatchObject({ openId, role, isOwner, staffMfaRequired: !isOwner, authLevel: "aal1" });
    expect(me).not.toHaveProperty("passwordHash");
    expect(staffMfaRequired(user)).toBe(me!.staffMfaRequired);
    if (isOwner) expect(() => assertStaffMfa(user)).not.toThrow();
    else expect(() => assertStaffMfa(user)).toThrow(/multi-factor/);
  });

  it("never grants an MFA exemption from matching contact email when no owner subject is configured", async () => {
    env.ownerOpenId = "";
    const { appRouter } = await import("./routers");
    const { assertStaffMfa } = await import("./_core/staffAuth");
    const user = account();
    expect(await appRouter.createCaller(context(user)).auth.me()).toMatchObject({ isOwner: false, staffMfaRequired: true });
    expect(() => assertStaffMfa(user)).toThrow(/multi-factor/);
  });

  it("reports the explicit pilot override consistently without changing owner authority", async () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "false");
    const { appRouter } = await import("./routers");
    const { assertStaffMfa } = await import("./_core/staffAuth");
    const user = account("sb:secondary-admin");
    expect(await appRouter.createCaller(context(user)).auth.me()).toMatchObject({ isOwner: false, staffMfaRequired: false });
    expect(() => assertStaffMfa(user)).not.toThrow();
  });

  it("returns no account or policy for an anonymous caller", async () => {
    const { appRouter } = await import("./routers");
    expect(await appRouter.createCaller(context(null)).auth.me()).toBeNull();
  });
});
