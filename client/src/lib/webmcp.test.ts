import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { registerBrowserTools, type BrowserTool } from "./webmcp";

describe("browser agent boundary", () => {
  it("validates strict tool arguments before any mutation and unregisters on logout", async () => {
    let registered!: BrowserTool;
    const mutation = vi.fn(async () => ({ saved: true }));
    const unregisterTool = vi.fn();
    const stop = registerBrowserTools(
      {
        registerTool: tool => {
          registered = tool;
        },
        unregisterTool,
      },
      [
        {
          name: "save_draft",
          description: "fixture",
          inputSchema: {},
          annotations: { readOnlyHint: false },
          validateInput: input =>
            z.object({ id: z.number().int().positive() }).strict().parse(input),
          execute: mutation,
        },
      ]
    );
    await expect(
      registered.execute({ id: 1, role: "admin" })
    ).rejects.toThrow();
    await expect(registered.execute({ id: -1 })).rejects.toThrow();
    expect(mutation).not.toHaveBeenCalled();
    await expect(registered.execute({ id: 1 })).resolves.toEqual({
      saved: true,
    });
    stop();
    expect(unregisterTool).toHaveBeenCalledWith("save_draft");
    await expect(registered.execute({ id: 1 })).rejects.toThrow(/available/);
    expect(mutation).toHaveBeenCalledTimes(1);
  });
  it("keeps no-argument tools strict and blocks an already cancelled request", async () => {
    let registered!: BrowserTool;
    const execute = vi.fn(async () => ({}));
    registerBrowserTools(
      {
        registerTool: tool => {
          registered = tool;
        },
      },
      [
        {
          name: "guidance",
          description: "fixture",
          inputSchema: {},
          annotations: { readOnlyHint: true },
          execute,
        },
      ]
    );
    await expect(
      registered.execute({ secret: "not accepted" })
    ).rejects.toThrow();
    await expect(
      registered.execute({}, { signal: AbortSignal.abort() })
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});
