import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { env } = vi.hoisted(() => ({ env: { ownerOpenId: "supabase:appointed-owner", ownerEmail: "owner@example.invalid", isProduction: true } }));
vi.mock("./_core/env", () => ({ ENV: env }));
vi.mock("./_core/budget", () => ({ reserveLlmCall: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  Object.assign(env, { ownerOpenId: "supabase:appointed-owner", ownerEmail: "owner@example.invalid", isProduction: true });
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
});
afterEach(() => vi.unstubAllEnvs());

function user(openId = "supabase:appointed-owner", authLevel = "aal2", role = "admin", email = "different-contact@example.invalid") {
  return { id: 10, openId, authLevel, role, email };
}
function context(account: ReturnType<typeof user> | null) { return { user: account, req: {}, res: {} } as unknown as TrpcContext; }

describe("explicit owner subject authority", () => {
  it("accepts only the configured admin subject regardless of contact-email changes", async () => {
    const { isPlatformOwner } = await import("./_core/trpc");
    expect(isPlatformOwner(user())).toBe(true);
    expect(isPlatformOwner(user("supabase:appointed-owner", "aal2", "user", env.ownerEmail))).toBe(false);
    expect(isPlatformOwner(null)).toBe(false);
  });

  it.each(["native:legacy-owner", "supabase:old-tenant-owner", "supabase:secondary-admin"])("matching email cannot promote %s into owner authority", async subject => {
    const { isPlatformOwner, ownerProcedure, router } = await import("./_core/trpc");
    const account = user(subject, "aal2", "admin", env.ownerEmail);
    expect(isPlatformOwner(account)).toBe(false);
    const caller = router({ privileged: ownerProcedure.mutation(() => ({ changed: true })) }).createCaller(context(account));
    await expect(caller.privileged()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed when only an owner email is configured", async () => {
    env.ownerOpenId = "";
    const { isPlatformOwner } = await import("./_core/trpc");
    expect(isPlatformOwner(user("native:admin", "aal2", "admin", env.ownerEmail))).toBe(false);
  });

  it("retains required staff MFA after matching the owner subject", async () => {
    const { ownerProcedure, router } = await import("./_core/trpc");
    const routes = router({ privileged: ownerProcedure.mutation(() => ({ changed: true })) });
    await expect(routes.createCaller(context(user(undefined, "aal1"))).privileged()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await routes.createCaller(context(user())).privileged()).toEqual({ changed: true });
  });

  it("does not retarget owner authority through a mid-process configuration mutation", async () => {
    const { isPlatformOwner } = await import("./_core/trpc");
    env.ownerOpenId = "supabase:replacement";
    env.ownerEmail = "changed@example.invalid";
    expect(isPlatformOwner(user())).toBe(true);
    expect(isPlatformOwner(user("supabase:replacement", "aal2", "admin", env.ownerEmail))).toBe(false);
  });
});
