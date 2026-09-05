import { beforeEach, describe, expect, it, vi } from "vitest";
const config = vi.hoisted(() => ({ forgeApiUrl: "https://gateway.example", forgeApiKey: "fixture-key" }));
vi.mock("./env", () => ({ ENV: config }));
vi.mock("./ssrfGuard", () => ({ assertSafeEgress: vi.fn(async (url: string) => new URL(url)) }));
import { notifyOwner } from "./notification";
import { makeRequest } from "./map";
beforeEach(() => { vi.restoreAllMocks(); config.forgeApiUrl = "https://gateway.example"; config.forgeApiKey = "fixture-key"; });
describe("optional external channels", () => {
  it("does not fail an application mutation when push transport is unconfigured", async () => {
    config.forgeApiKey = "";
    await expect(notifyOwner({ title: "Event", content: "Clinical case" })).resolves.toBe(false);
  });
  it("sends no applicant title, identifiers, reasons, or support text to external push", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    expect(await notifyOwner({ title: "Patient PRIVATE PERSON", content: "IRB-123 private safety reason" })).toBe(true);
    const request = fetcher.mock.calls[0][1]!;
    expect(String(request.body)).not.toContain("PRIVATE");
    expect(String(request.body)).not.toContain("IRB-123");
    expect(request.redirect).toBe("error");
  });
  it("forbids maps path traversal and caller API key overrides", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    await expect(makeRequest("/../../admin", {})).rejects.toThrow("Unsupported maps endpoint");
    await expect(makeRequest("/maps/api/geocode/json", { key: "attacker" })).rejects.toThrow("Invalid maps parameters");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds maps responses and never reflects provider error content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("api_key=PRIVATE", { status: 500 }));
    await expect(makeRequest("/maps/api/geocode/json", { address: "synthetic address" })).rejects.toThrow("Maps provider unavailable (HTTP 500)");
  });
});
