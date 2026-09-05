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

  it("exempts the appointed admin owner from MFA consistently across staff, admin and owner procedures", async () => {
    const { ownerProcedure, adminProcedure, staffProcedure, router } = await import("./_core/trpc");
    const routes = router({
      staff: staffProcedure.query(() => true),
      admin: adminProcedure.query(() => true),
      owner: ownerProcedure.query(() => true),
    });
    const caller = routes.createCaller(context(user(undefined, "aal1")));
    await expect(caller.staff()).resolves.toBe(true);
    await expect(caller.admin()).resolves.toBe(true);
    await expect(caller.owner()).resolves.toBe(true);
  });

  it("keeps required MFA for a secondary admin even with the owner's email", async () => {
    const { adminProcedure, staffProcedure, ownerProcedure, router } = await import("./_core/trpc");
    const routes = router({ staff: staffProcedure.query(() => true), admin: adminProcedure.query(() => true), owner: ownerProcedure.query(() => true) });
    const account = user("supabase:secondary-admin", "aal1", "admin", env.ownerEmail);
    const caller = routes.createCaller(context(account));
    await expect(caller.staff()).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("multi-factor") });
    await expect(caller.admin()).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("multi-factor") });
    await expect(caller.owner()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const verified = routes.createCaller(context({ ...account, authLevel: "aal2" }));
    await expect(verified.staff()).resolves.toBe(true);
    await expect(verified.admin()).resolves.toBe(true);
    await expect(verified.owner()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("never grants admin or owner access to an owner subject whose role was removed", async () => {
    const { adminProcedure, ownerProcedure, router } = await import("./_core/trpc");
    const routes = router({ admin: adminProcedure.query(() => true), owner: ownerProcedure.query(() => true) });
    const caller = routes.createCaller(context(user(undefined, "aal2", "user")));
    await expect(caller.admin()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.owner()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not retarget owner authority through a mid-process configuration mutation", async () => {
    const { isPlatformOwner } = await import("./_core/trpc");
    const { staffMfaRequired } = await import("./_core/staffAuth");
    env.ownerOpenId = "supabase:replacement";
    env.ownerEmail = "changed@example.invalid";
    expect(isPlatformOwner(user())).toBe(true);
    expect(staffMfaRequired(user(undefined, "aal1"))).toBe(false);
    expect(isPlatformOwner(user("supabase:replacement", "aal2", "admin", env.ownerEmail))).toBe(false);
    expect(staffMfaRequired(user("supabase:replacement", "aal1", "admin", env.ownerEmail))).toBe(true);
  });
});
