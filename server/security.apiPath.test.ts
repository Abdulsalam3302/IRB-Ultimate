import { describe, expect, it } from "vitest";
import { normalizeApiPath, rateScope } from "./_core/security";

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
