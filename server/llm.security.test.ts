import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./_core/env", () => ({ ENV: { isProduction: true, llmApiKey: "unit-test-key", llmApiUrl: "https://provider.example/v1", llmModel: "test-model", llmProvider: "openai", llmMaxTokens: 8192, llmFastMaxTokens: 4096, llmTimeoutMs: 1000 } }));
vi.mock("./_core/ssrfGuard", () => ({ assertSafeEgress: async (value: string) => new URL(value) }));
import { invokeLLM, safeJsonParse } from "./_core/llm";
const params = { messages: [{ role: "user" as const, content: "Synthetic protocol only" }] };
afterEach(() => vi.unstubAllGlobals());

describe("LLM transport and incomplete evidence", () => {
  it("does not repair truncated assessment into an approval", () => {
    expect(safeJsonParse('{"passed":true,"score":100')).toEqual({});
  });
  it("bounds deep completion tokens and normalizes an existing /v1 base", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] })));
    vi.stubGlobal("fetch", fetcher);
    await invokeLLM({ ...params, profile: "deep", maxTokens: 1_000_000 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://provider.example/v1/chat/completions");
    expect(JSON.parse(String(init.body)).max_tokens).toBe(8192);
    expect(init.redirect).toBe("error");
  });
  it("does not leak provider error bodies or silently repeat paid calls", async () => {
    const fetcher = vi.fn(async () => new Response("echoed secret patient record", { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(invokeLLM(params)).rejects.toThrow("HTTP 429");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects truncated completions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"passed":true' }, finish_reason: "length" }] }))));
    await expect(invokeLLM(params)).rejects.toThrow("incomplete");
  });
  it("rejects oversized input before sending any data", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(invokeLLM({ messages: [{ role: "user", content: "x".repeat(128_001) }] })).rejects.toThrow("context size");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
