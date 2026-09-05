import { describe, expect, it, vi } from "vitest";
import { safeNextPath } from "./navigation";
import { analyticsPath } from "./privacy";
import { sendChatApplicationTurn } from "./chatSend";
import { registerBrowserTools, type BrowserTool } from "./webmcp";

describe("client privacy boundaries", () => {
  it.each(["//attacker.example", "/\\attacker.example", "/\n/attacker.example", "https://attacker.example", "javascript:alert(1)"])("rejects unsafe sign-in destination %j", input => {
    expect(safeNextPath(input)).toBe("/dashboard");
  });
  it("preserves local paths and ordinary query data", () => {
    expect(safeNextPath("/apply/12/stage1?step=1")).toBe("/apply/12/stage1?step=1");
    expect(safeNextPath(undefined, "")).toBe("");
  });
  it("never records application identifiers or certificate lookups", () => {
    for (const path of ["/application/123", "/verify/IRB-SA-2026-00001", "/verify?n=private", "/chat-apply?id=123", "/auth?next=/profile", "/registry"]) expect(analyticsPath(path)).toBeNull();
    expect(analyticsPath("/resources?email=private@example.com#secret")).toBe("/resources");
  });
  it("does not replay a costly chat mutation after an ambiguous failure", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("Timeout after request accepted"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(sendChatApplicationTurn({ applicationId: 1, messages: [] }, transport)).rejects.toThrow("Timeout");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("browser WebMCP registration lifecycle", () => {
  const tool: BrowserTool = {
    name: "irb_test", description: "Read status", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: async () => ({ status: "draft" }),
  };
  it("passes a registration signal and rejects retained execution after teardown", async () => {
    const registerTool = vi.fn();
    const unregisterTool = vi.fn();
    const cleanup = registerBrowserTools({ registerTool, unregisterTool }, [tool]);
    const [registered, options] = registerTool.mock.calls[0];
    expect(options.signal.aborted).toBe(false);
    expect(await registered.execute({})).toEqual({ status: "draft" });
    await expect(registered.execute({ protocol: "private" })).rejects.toThrow("does not accept arguments");
    cleanup();
    expect(options.signal.aborted).toBe(true);
    expect(unregisterTool).toHaveBeenCalledWith("irb_test");
    await expect(registered.execute({})).rejects.toThrow("no longer available");
  });
  it("suppresses sensitive results if teardown occurs during an in-flight tool", async () => {
    let finish!: (value: unknown) => void;
    const registerTool = vi.fn();
    const cleanup = registerBrowserTools({ registerTool }, [{ ...tool, execute: () => new Promise(resolve => { finish = resolve; }) }]);
    const pending = registerTool.mock.calls[0][0].execute({});
    cleanup();
    finish({ private: true });
    await expect(pending).rejects.toThrow("cancelled");
  });
  it("does not break ordinary navigation when preview registration throws", () => {
    expect(() => registerBrowserTools({ registerTool: () => { throw new Error("Unsupported API"); } }, [tool])()).not.toThrow();
  });
});

import { csvCell, safeExternalUrl } from "./files";

describe("document and external-link safety", () => {
  it("neutralizes spreadsheet formulas while preserving CSV structure", () => {
    expect(csvCell('=HYPERLINK("https://attacker.example")')).toBe('"\'=HYPERLINK(""https://attacker.example"")"');
    expect(csvCell("\t+cmd")).toBe("'\t+cmd");
    expect(csvCell("Protocol, A\nB")).toBe('"Protocol, A\nB"');
    expect(csvCell(42)).toBe("42");
  });
  it("blocks active-content and credential-bearing generated links", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeExternalUrl("https://user:password@example.com")).toBeUndefined();
    expect(safeExternalUrl("https://pubmed.ncbi.nlm.nih.gov/123/")).toBe("https://pubmed.ncbi.nlm.nih.gov/123/");
  });
});
