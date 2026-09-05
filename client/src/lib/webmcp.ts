/** WebMCP community draft, checked 2026-09-05. This is an experimental browser API. */
export type BrowserTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
};
export type BrowserModelContext = {
  registerTool: (tool: BrowserTool, options?: { signal: AbortSignal }) => Promise<void> | void;
  unregisterTool?: (name: string) => void;
};

/** Registration cancellation removes current-draft tools; preview cleanup is scoped by name. */
export function registerBrowserTools(context: BrowserModelContext, tools: BrowserTool[]): () => void {
  const controller = new AbortController();
  const registered: string[] = [];
  for (const tool of tools) {
    const guarded: BrowserTool = {
      ...tool,
      execute: async (input, options) => {
        if (controller.signal.aborted || options?.signal?.aborted) throw new Error("Tool is no longer available");
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("This tool does not accept arguments");
        const result = await tool.execute(input, options);
        if (controller.signal.aborted || options?.signal?.aborted) throw new Error("Tool execution cancelled");
        return result;
      },
    };
    try {
      const registration = context.registerTool(guarded, { signal: controller.signal });
      registered.push(tool.name);
      // Rejected registration must not become an unhandled promise rejection.
      void Promise.resolve(registration).catch(() => {});
    } catch { /* Unsupported preview version: ordinary UI remains functional. */ }
  }
  return () => {
    controller.abort();
    for (const name of registered) {
      try { context.unregisterTool?.(name); } catch { /* preview compatibility */ }
    }
  };
}
