import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import { registerBrowserTools, type BrowserModelContext, type BrowserTool } from "@/lib/webmcp";

/** Browser WebMCP is distinct from the server's authenticated MCP transport. */
export function WebMcpProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const userId = user?.id;
  useEffect(() => {
    if (!window.isSecureContext) return;
    const current = (document as Document & { modelContext?: BrowserModelContext }).modelContext;
    const preview = (navigator as Navigator & { modelContext?: BrowserModelContext }).modelContext;
    const context = typeof current?.registerTool === "function" ? current : preview;
    if (typeof context?.registerTool !== "function") return;
    const tools: BrowserTool[] = [{
      name: "irb_platform_guidance",
      description: "Read public guidance about the IRB Saudi Arabia workflow and its human decision authority. No personal information is returned.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => ({
        platform: "IRB Saudi Arabia",
        scope: "Independent research ethics workflow software for Saudi Arabia. AI assessments are advisory; authorized human review determines ethics decisions.",
        pages: { resources: "/resources", policy: "/policy", privacy: "/resources/guideline/privacy-policy", support: "/support" },
        roadmap: "International expansion planned from 2027, subject to requirements in each jurisdiction; no automatic global certificate validity.",
      }),
    }];
    if (userId != null) tools.push({
      name: "irb_list_application_statuses",
      description: "Read up to 20 application reference IDs and workflow statuses owned by the signed-in researcher. No names, protocol text, documents, messages, certificates, or investigator details are returned.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (_input, options) => {
        // Revalidate the session server-side on every call; never trust the role catalog.
        const session = await utils.client.auth.me.query(undefined, { signal: options?.signal });
        if (!session || session.id !== userId) throw new Error("Sign in again to access application status");
        const applications = await utils.client.application.myApplications.query(undefined, { signal: options?.signal });
        return { applications: applications.slice(0, 20).map(row => ({ applicationId: row.id, status: row.status })), hasMore: applications.length > 20 };
      },
    });
    return registerBrowserTools(context, tools);
  }, [userId, utils.client]);
  return <>{children}</>;
}
