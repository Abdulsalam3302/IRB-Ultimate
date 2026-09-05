import { afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "./_core/sdk";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not claim success or clear cookies when durable revocation fails", async () => {
    vi.spyOn(sdk, "revokeRequestSession").mockRejectedValue(new Error("Synthetic unavailable database"));
    const { ctx, clearedCookies } = createAuthContext();
    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(clearedCookies).toHaveLength(0);
  });

  it("revokes the server session before clearing the client cookie", async () => {
    const events: string[] = [];
    vi.spyOn(sdk, "revokeRequestSession").mockImplementation(async () => { events.push("revoked"); });
    const { ctx } = createAuthContext();
    ctx.res.clearCookie = (() => { events.push("cleared"); }) as TrpcContext["res"]["clearCookie"];
    await appRouter.createCaller(ctx).auth.logout();
    expect(events).toEqual(["revoked", "cleared"]);
  });
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    // SA-01: session cookie is now SameSite=Lax (was None). Lax + Origin
    // allowlist on /api/trpc is the CSRF defence; None left the cookie
    // attached to cross-site POSTs which any phishing page could exploit.
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });
});
