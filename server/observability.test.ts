import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { DISCLAIMER_VERSION, hasAcknowledgedDisclaimer, isDisclaimerAllowedPath } from "@shared/disclaimer";
import { SESSION_TTL_MS, CERT_DOWNLOAD_TTL_SEC } from "@shared/const";
import { storageKeyFromUrl } from "./storage";

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
    req: { protocol: "https", headers: {}, ip: "127.0.0.1" } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("open-beta constants", () => {
  it("uses 14-day session TTL", () => {
    expect(SESSION_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("uses 5-minute certificate download TTL", () => {
    expect(CERT_DOWNLOAD_TTL_SEC).toBe(5 * 60);
  });
});

describe("disclaimer helpers", () => {
  it("allows disclaimer and policy before ack", () => {
    expect(isDisclaimerAllowedPath("/disclaimer")).toBe(true);
    expect(isDisclaimerAllowedPath("/policy")).toBe(true);
    expect(isDisclaimerAllowedPath("/")).toBe(false);
    expect(DISCLAIMER_VERSION).toBe("v1");
  });

  it("hasAcknowledgedDisclaimer is false without localStorage ack", () => {
    expect(hasAcknowledgedDisclaimer()).toBe(false);
  });
});

describe("storageKeyFromUrl", () => {
  it("extracts keys from /uploads and certificates URLs", () => {
    expect(storageKeyFromUrl("/uploads/certificates/IRB-1.pdf")).toBe("certificates/IRB-1.pdf");
    expect(storageKeyFromUrl("https://bucket.s3.amazonaws.com/certificates/x.pdf?X-Amz-Signature=abc")).toBe(
      "certificates/x.pdf"
    );
    expect(storageKeyFromUrl(null)).toBeNull();
  });
});

describe("analytics.metrics RBAC", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    // ownerProcedure intentionally returns FORBIDDEN (not UNAUTHORIZED) so
    // owner-only surfaces are not advertised to anonymous probes.
    await expect(caller.analytics.metrics()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects non-owner admin", async () => {
    const caller = appRouter.createCaller(
      makeContext({ id: 8, role: "admin", openId: "another-admin" })
    );
    await expect(caller.analytics.metrics()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("verify.verifyIrb URL redaction", () => {
  it("does not expose certificateUrl fields on not-found", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    const result = await caller.verify.verifyIrb({ irbNumber: "IRB-SA-9999-99999" });
    expect(result.found).toBe(false);
    expect(result).not.toHaveProperty("certificateUrl");
    expect(result).not.toHaveProperty("retractionCertificateUrl");
  });
});
