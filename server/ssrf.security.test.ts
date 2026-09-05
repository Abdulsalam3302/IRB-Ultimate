import { describe, expect, it, vi } from "vitest";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async (host: string) => [{ address: host === "internal.example" ? "127.0.0.1" : "8.8.8.8" }]) }));
import { assertSafeEgress, isPrivateIp } from "./_core/ssrfGuard";

describe("outbound destination safety", () => {
  it.each(["127.0.0.1", "169.254.169.254", "10.0.0.1", "100.64.0.1", "224.0.0.1", "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "fe90::1", "fc00::1", "ff00::1", "2002:7f00:1::"])("blocks internal/special address %s", ip => expect(isPrivateIp(ip)).toBe(true));
  it("rejects credentials, localhost resolution and alternate literal encodings", async () => {
    await expect(assertSafeEgress("https://user:password@public.example")).rejects.toThrow();
    await expect(assertSafeEgress("https://internal.example")).rejects.toThrow();
    await expect(assertSafeEgress("http://2130706433/")).rejects.toThrow();
    await expect(assertSafeEgress("https://[::ffff:127.0.0.1]/")).rejects.toThrow();
    await expect(assertSafeEgress("file:///etc/passwd")).rejects.toThrow();
  });
  it("allows ordinary public destinations", async () => {
    expect((await assertSafeEgress("https://public.example/api")).hostname).toBe("public.example");
  });
});
