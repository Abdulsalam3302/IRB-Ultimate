import type { Express, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  env: { supabaseUrl: "https://synthetic-project.supabase.co", ownerOpenId: "sb:appointed-owner", ownerEmail: "owner@example.invalid", isProduction: true },
  jwtVerify: vi.fn(), upsertUser: vi.fn(), adminExists: vi.fn(), createSessionToken: vi.fn(),
  identityActive: vi.fn(),
}));
vi.mock("./_core/env", () => ({ ENV: fixture.env }));
vi.mock("jose", () => ({ createRemoteJWKSet: vi.fn(() => "synthetic-jwks"), jwtVerify: fixture.jwtVerify }));
vi.mock("./db", () => ({ upsertUser: fixture.upsertUser, adminExists: fixture.adminExists }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: fixture.createSessionToken } }));
vi.mock("./services/storageDeletionIdentity", () => ({ assertSupabaseIdentityActive: fixture.identityActive }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  Object.assign(fixture.env, { ownerOpenId: "sb:appointed-owner", ownerEmail: "owner@example.invalid" });
  fixture.adminExists.mockResolvedValue(false);
  fixture.upsertUser.mockResolvedValue(undefined);
  fixture.identityActive.mockResolvedValue(undefined);
  fixture.createSessionToken.mockResolvedValue("synthetic-platform-cookie");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function bridge() {
  let handler!: (req: Request, res: Response) => Promise<void>;
  const { registerSupabaseAuthRoutes } = await import("./_core/supabaseAuth");
  registerSupabaseAuthRoutes({ post: (_path: string, callback: typeof handler) => { handler = callback; } } as unknown as Express);
  return async (payload: Record<string, unknown>) => {
    fixture.jwtVerify.mockResolvedValue({ payload });
    const res = { status: vi.fn(), json: vi.fn(), cookie: vi.fn() };
    res.status.mockReturnValue(res);
    await handler({ protocol: "https", headers: { authorization: "Bearer synthetic-provider-token" } } as Request, res as unknown as Response);
    return res;
  };
}

describe("Supabase owner bootstrap uses subject authority", () => {
  it("rejects an erased subject before upsert or cookie issuance, including an unexpired provider token", async () => {
    const run = await bridge();
    fixture.identityActive.mockRejectedValueOnce(new Error("Closed identity"));
    const res = await run({ sub: "appointed-owner", aal: "aal2" });
    expect(fixture.identityActive).toHaveBeenCalledWith("sb:appointed-owner", "https://synthetic-project.supabase.co/auth/v1");
    expect(fixture.upsertUser).not.toHaveBeenCalled();
    expect(fixture.createSessionToken).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it.each(["another-tenant-user", "legacy-email-owner"])("verified owner email does not promote %s on an empty installation", async sub => {
    const run = await bridge();
    const res = await run({ sub, email: fixture.env.ownerEmail, email_confirmed_at: "2026-09-05T00:00:00Z", aal: "aal2" });
    expect(fixture.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: `sb:${sub}` }));
    expect(fixture.upsertUser.mock.calls[0][0]).not.toHaveProperty("role");
    expect(fixture.adminExists).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, openId: `sb:${sub}`, role: "user" });
  });

  it("bootstraps only the configured subject even when its contact email differs", async () => {
    const run = await bridge();
    await run({ sub: "appointed-owner", email: "updated@example.invalid", aal: "aal2" });
    expect(fixture.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "sb:appointed-owner", role: "admin" }));
    expect(fixture.jwtVerify).toHaveBeenCalledWith("synthetic-provider-token", "synthetic-jwks", {
      issuer: "https://synthetic-project.supabase.co/auth/v1", audience: "authenticated",
    });
    expect(fixture.createSessionToken).toHaveBeenCalledWith("sb:appointed-owner", expect.objectContaining({ authLevel: "aal2" }));
  });

  it("missing OWNER_OPEN_ID fails closed even with verified matching email", async () => {
    fixture.env.ownerOpenId = "";
    const run = await bridge();
    await run({ sub: "appointed-owner", email: fixture.env.ownerEmail, email_confirmed_at: "2026-09-05T00:00:00Z" });
    expect(fixture.upsertUser.mock.calls[0][0]).not.toHaveProperty("role");
  });

  it("user-editable metadata cannot grant admin role or MFA assurance", async () => {
    const run = await bridge();
    await run({ sub: "researcher", email: fixture.env.ownerEmail, aal: "aal1", user_metadata: { role: "admin", aal: "aal2", email_confirmed_at: "2026-09-05" } });
    expect(fixture.upsertUser.mock.calls[0][0]).not.toHaveProperty("role");
    expect(fixture.createSessionToken).toHaveBeenCalledWith("sb:researcher", expect.objectContaining({ authLevel: "aal1" }));
  });

  it("retains the boot-time subject when the environment object changes", async () => {
    const run = await bridge();
    fixture.env.ownerOpenId = "sb:replacement";
    await run({ sub: "replacement", email: fixture.env.ownerEmail, aal: "aal2" });
    expect(fixture.upsertUser.mock.calls[0][0]).not.toHaveProperty("role");
    await run({ sub: "appointed-owner", aal: "aal2" });
    expect(fixture.upsertUser.mock.calls[1][0]).toHaveProperty("role", "admin");
  });
});
