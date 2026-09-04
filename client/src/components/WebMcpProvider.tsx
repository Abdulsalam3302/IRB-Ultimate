import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const APPLICANT_TOOLS: McpTool[] = [
  { name: "irb_list_applications", description: "List the authenticated user's IRB applications", inputSchema: { type: "object", properties: {} } },
  { name: "irb_create_application", description: "Create a new IRB application draft", inputSchema: { type: "object", properties: {} } },
  { name: "irb_get_application", description: "Get one IRB application by id", inputSchema: { type: "object", properties: { applicationId: { type: "number" } }, required: ["applicationId"] } },
  { name: "irb_missing_requirements", description: "List missing fields for an application", inputSchema: { type: "object", properties: { applicationId: { type: "number" } }, required: ["applicationId"] } },
  { name: "irb_submit_application", description: "Submit an application (triggers authorized digital review)", inputSchema: { type: "object", properties: { applicationId: { type: "number" } }, required: ["applicationId"] } },
  { name: "irb_chat_send", description: "Send a chatbot application turn", inputSchema: { type: "object", properties: { applicationId: { type: "number" }, messages: { type: "array" } }, required: ["applicationId", "messages"] } },
];

const ADMIN_TOOLS: McpTool[] = [
  { name: "irb_admin_committee_members", description: "List active IRB committee members", inputSchema: { type: "object", properties: {} } },
];

/**
 * App-wide WebMCP discovery. Tools are advertised by role; authorization
 * is always enforced on POST /mcp (never trust the client catalog).
 */
export function WebMcpProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (typeof document === "undefined") return;
    let link = document.querySelector('link[rel="mcp"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "mcp");
      document.head.appendChild(link);
    }
    link.setAttribute("href", "/.well-known/mcp.json");
    link.setAttribute("type", "application/json");

    const tools = [
      ...APPLICANT_TOOLS,
      ...(user?.role === "admin" ? ADMIN_TOOLS : []),
    ];
    const nav = navigator as Navigator & {
      modelContext?: {
        registerToolProvider?: (provider: unknown) => void;
      };
    };
    try {
      nav.modelContext?.registerToolProvider?.({
        name: "irb-ultimate",
        tools: isAuthenticated ? tools : [],
        endpoint: "/mcp",
      });
    } catch {
      /* experimental API */
    }
  }, [isAuthenticated, user?.role]);

  return <>{children}</>;
}
