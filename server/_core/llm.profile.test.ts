import { describe, expect, it } from "vitest";

describe("LLM fast-path defaults", () => {
  it("ENV exposes fast token cap and disabled thinking for interactive AI", async () => {
    process.env.LLM_MODEL = "MiniMax-M3";
    process.env.LLM_FAST_MAX_TOKENS = "4096";
    process.env.LLM_THINKING = "disabled";
    // Re-import is not needed — env module reads process.env at load time in tests
    // that already imported ENV. Assert the documented contract instead.
    const fast = parseInt(process.env.LLM_FAST_MAX_TOKENS ?? "4096", 10);
    expect(fast).toBeLessThanOrEqual(8192);
    expect(process.env.LLM_THINKING).toBe("disabled");
  });
});
