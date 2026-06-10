import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// The owner identity is captured at module-init (SA-26), so the env must
// be set BEFORE routers/trpc are imported. Dynamic import inside
// beforeAll guarantees ordering under ESM hoisting.
process.env.OWNER_OPEN_ID = "owner-open-id-test";

let appRouter: typeof import("./routers").appRouter;

beforeAll(async () => {
  ({ appRouter } = await import("./routers"));
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeContext(overrides: Partial<AuthenticatedUser> | null): TrpcContext {
  const user: AuthenticatedUser | null = overrides
    ? {
        id: 1,
        openId: "test-user-1",
        email: "researcher@university.edu.sa",
        name: "Dr. Test Researcher",
        loginMethod: "manus",
        passwordHash: null,
        role: "user",
        orcidId: null,
        orcidVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        ...overrides,
      }
    : null;
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const ownerCtx = () =>
  makeContext({ id: 7, role: "admin", openId: "owner-open-id-test" });
const secondaryAdminCtx = () =>
  makeContext({ id: 8, role: "admin", openId: "another-admin" });
const regularUserCtx = () => makeContext({ id: 9, role: "user" });

describe("aiSwarm.amOwner", () => {
  it("returns true only for the platform owner", async () => {
    const caller = appRouter.createCaller(ownerCtx());
    await expect(caller.aiSwarm.amOwner()).resolves.toEqual({ isOwner: true });
  });

  it("returns false for a secondary admin", async () => {
    const caller = appRouter.createCaller(secondaryAdminCtx());
    await expect(caller.aiSwarm.amOwner()).resolves.toEqual({ isOwner: false });
  });

  it("returns false for a regular user", async () => {
    const caller = appRouter.createCaller(regularUserCtx());
    await expect(caller.aiSwarm.amOwner()).resolves.toEqual({ isOwner: false });
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(caller.aiSwarm.amOwner()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("does not count a non-admin with the owner openId as owner (defense in depth)", async () => {
    const caller = appRouter.createCaller(
      makeContext({ id: 10, role: "user", openId: "owner-open-id-test" }),
    );
    await expect(caller.aiSwarm.amOwner()).resolves.toEqual({ isOwner: false });
  });
});

describe("aiSwarm owner gating", () => {
  it("forbids a secondary admin from running a swarm audit", async () => {
    const caller = appRouter.createCaller(secondaryAdminCtx());
    await expect(
      caller.aiSwarm.run({ applicationId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forbids a regular user from running a swarm audit", async () => {
    const caller = appRouter.createCaller(regularUserCtx());
    await expect(
      caller.aiSwarm.run({ applicationId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forbids a secondary admin from listing swarm reviews", async () => {
    const caller = appRouter.createCaller(secondaryAdminCtx());
    await expect(
      caller.aiSwarm.byApplication({ applicationId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forbids unauthenticated callers from every swarm endpoint", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(
      caller.aiSwarm.run({ applicationId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.aiSwarm.byApplication({ applicationId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates applicationId before doing any work", async () => {
    const caller = appRouter.createCaller(ownerCtx());
    await expect(
      caller.aiSwarm.run({ applicationId: -5 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("404s for the owner when the application does not exist", async () => {
    const caller = appRouter.createCaller(ownerCtx());
    await expect(
      caller.aiSwarm.byApplication({ applicationId: 99_999_999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
