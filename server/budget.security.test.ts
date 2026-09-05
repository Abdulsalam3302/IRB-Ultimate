import { describe, expect, it, vi } from "vitest";
vi.mock("./_core/env", () => ({ ENV: { isProduction: true, cookieSecret: "isolated-test" } }));
vi.mock("./db", () => ({ getDb: async () => null }));
import { reserveLlmCall, inspectLlmBudget } from "./_core/budget";
import { consumeRateLimit } from "./_core/requestLimits";

describe("shared accounting fails closed in production", () => {
  it("cannot spend from process-local fallback when budget persistence fails", async () => {
    await expect(reserveLlmCall(1)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(inspectLlmBudget(1)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("does not invent zero usage or allow requests during an outage", async () => {
    expect(await consumeRateLimit("auth", "client", 5, 60_000)).toMatchObject({ allowed: false, unavailable: true });
  });
});
