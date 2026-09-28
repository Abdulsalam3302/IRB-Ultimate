import { describe, expect, it } from "vitest";
import { isAllowedCorsOrigin, normalizeApiPath, rateScope } from "./_core/security";

describe("API path normalization for policy checks", () => {
  it("normalizes the case-insensitive API prefix but keeps tRPC procedure names", () => {
    expect(normalizeApiPath("/API/auth/login")).toBe("/api/auth/login");
    expect(normalizeApiPath("/Api/Trpc/application.uploadFile")).toBe("/api/trpc/application.uploadFile");
    expect(normalizeApiPath("/api")).toBe("/api");
    expect(normalizeApiPath("/apiary")).toBe("/apiary");
    expect(normalizeApiPath("/resources")).toBe("/resources");
  });
  it("applies the same rate scope regardless of prefix case", () => {
    expect(rateScope(normalizeApiPath("/API/auth/login"))).toBe(rateScope("/api/auth/login"));
    expect(rateScope(normalizeApiPath("/API/TRPC/application.uploadFile"))).toBe(rateScope("/api/trpc/application.uploadFile"));
  });
});

describe("credentialed CORS allowlist", () => {
  const allowlist = ["https://irb-sa.org", "https://*.irb-sa.org"];
  it("accepts exact and single-label wildcard origins", () => {
    expect(isAllowedCorsOrigin("https://irb-sa.org", allowlist)).toBe(true);
    expect(isAllowedCorsOrigin("https://www.irb-sa.org", allowlist)).toBe(true);
  });
  it("rejects null, missing, non-http, path-bearing and unlisted origins", () => {
    for (const origin of [undefined, "", "null", "file://", "chrome-extension://abc", "https://irb-sa.org/x", "https://evil.example", "https://a.b.irb-sa.org", "https://irb-sa.org.evil.example"]) {
      expect(isAllowedCorsOrigin(origin, allowlist)).toBe(false);
    }
  });
});
