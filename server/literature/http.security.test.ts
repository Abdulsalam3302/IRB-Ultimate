import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../_core/ssrfGuard", () => ({ assertSafeEgress: vi.fn(async (url: string) => new URL(url)) }));
import { fetchWithTimeout, sourceTotal, trim } from "./http";
beforeEach(() => vi.restoreAllMocks());
describe("bounded scholarly transport", () => {
  it("does not retry metered POSTs after transient provider errors", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("busy", { status: 503 }));
    const res = await fetchWithTimeout("https://source.example/api", { method: "POST", body: "{}", retries: 10 });
    expect(res.status).toBe(503); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("error");
  });
  it("rejects oversized bodies and non-HTTPS endpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { headers: { "Content-Length": "2000001" } }));
    await expect(fetchWithTimeout("https://source.example", { retries: 0 })).rejects.toThrow("Upstream response too large");
    await expect(fetchWithTimeout("http://source.example")).rejects.toThrow("requires HTTPS");
  });
  it("never interprets an unavailable or malformed total as a count", () => {
    expect(sourceTotal(null)).toBeUndefined(); expect(sourceTotal(-1)).toBeUndefined(); expect(sourceTotal("NaN")).toBeUndefined();
    expect(sourceTotal("0")).toBe(0); expect(sourceTotal("42")).toBe(42);
    expect(trim({ text: "untrusted object" }, 100)).toBeUndefined();
  });
});
