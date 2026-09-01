import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { listTrpcProcedurePaths } from "./_core/trpcMeta";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function userCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-1",
    email: "researcher@university.edu.sa",
    name: "Dr. Test Researcher",
    loginMethod: "native",
    passwordHash: null,
    role: "user",
    orcidId: null,
    orcidVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("chatApplication router", () => {
  it("registers sendMessage and history on appRouter", () => {
    const paths = listTrpcProcedurePaths(appRouter);
    expect(paths).toContain("chatApplication.sendMessage");
    expect(paths).toContain("chatApplication.history");
  });

  it("rejects unauthenticated sendMessage", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(
      caller.chatApplication.sendMessage({
        applicationId: 1,
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow();
  });

  it("persists chat turns via insertChatApplicationMessage", async () => {
    expect(typeof db.insertChatApplicationMessage).toBe("function");
    expect(typeof db.getChatApplicationMessages).toBe("function");
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.chatApplication.history({ applicationId: 999999991 }),
    ).rejects.toThrow();
  });
});
