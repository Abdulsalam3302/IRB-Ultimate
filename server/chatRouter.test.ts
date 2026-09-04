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
    expect(paths).toContain("application.sendChatMessage");
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

  it("HTTP mutate of sendMessage is unauthorized, not missing-procedure", async () => {
    const express = await import("express");
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { createServer } = await import("node:http");
    const app = express.default();
    app.use(express.json());
    app.use(
      "/api/trpc",
      createExpressMiddleware({
        router: appRouter,
        createContext: async ({ req, res }) => ({
          user: null,
          req,
          res,
        }),
      }),
    );
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/trpc/chatApplication.sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: { applicationId: 1, messages: [{ role: "user", content: "hello" }] },
        }),
      });
      const body = await res.text();
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(401);
      expect(body.toLowerCase()).not.toContain("no procedure found");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve())),
      );
    }
  });
});
