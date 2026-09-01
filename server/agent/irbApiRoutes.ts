import type { Express, Request, Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";
import { APP_VERSION } from "@shared/const";
import { IRB_REQUIREMENTS, listMissingRequirements } from "../services/irb.validation";
import * as db from "../db";

async function createHttpCaller(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as CreateExpressContextOptions);
  return { caller: appRouter.createCaller(ctx), user: ctx.user };
}

function sendAgentError(res: Response, error: unknown) {
  if (error instanceof TRPCError) {
    const status =
      error.code === "UNAUTHORIZED" ? 401
      : error.code === "FORBIDDEN" ? 403
      : error.code === "NOT_FOUND" ? 404
      : error.code === "TOO_MANY_REQUESTS" ? 429
      : 400;
    res.status(status).json({ error: error.message });
    return;
  }
  console.error("[agent-api]", error);
  res.status(500).json({ error: "request failed" });
}

async function requireUser(req: Request, res: Response) {
  const { caller, user } = await createHttpCaller(req, res);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return { caller, user };
}

function parseApplicationId(raw: string | undefined): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * Thin REST adapter around existing tRPC. Cookie session required.
 * Also mounts JSON-RPC MCP at POST /api/mcp (and POST /mcp on the API host).
 */
export function registerIrbAgentRoutes(app: Express) {
  app.get("/api/irb/meta/requirements", (_req, res) => {
    res.json(IRB_REQUIREMENTS);
  });

  app.post("/api/irb/applications", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    try {
      const result = await auth.caller.application.create();
      res.status(201).json(result);
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  app.get("/api/irb/applications", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    try {
      const apps = await auth.caller.application.myApplications();
      res.json({ applications: apps });
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  app.get("/api/irb/applications/:id", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const id = parseApplicationId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid application id" });
      return;
    }
    try {
      const application = await auth.caller.application.getById({ id });
      res.json(application);
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  app.get("/api/irb/applications/:id/missing-requirements", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const id = parseApplicationId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid application id" });
      return;
    }
    try {
      const application = await db.getApplicationById(id);
      if (!application || (application.applicantId !== auth.user.id && auth.user.role !== "admin")) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.json({ missing: listMissingRequirements(application) });
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  app.post("/api/irb/applications/:id/chat", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const id = parseApplicationId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid application id" });
      return;
    }
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    try {
      const result = await auth.caller.chatApplication.sendMessage({
        applicationId: id,
        messages,
        lang: req.body?.lang === "ar" ? "ar" : req.body?.lang === "en" ? "en" : undefined,
      });
      res.json(result);
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  app.post("/api/irb/applications/:id/submit", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const id = parseApplicationId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid application id" });
      return;
    }
    try {
      const result = await auth.caller.application.submit({ id });
      res.json(result);
    } catch (error) {
      sendAgentError(res, error);
    }
  });
}

type JsonRpcBody = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const MCP_TOOLS = [
  {
    name: "irb_list_applications",
    description: "List the authenticated user's IRB applications",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "irb_create_application",
    description: "Create a new IRB application draft",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "irb_get_application",
    description: "Get one IRB application by id",
    inputSchema: {
      type: "object",
      properties: { applicationId: { type: "number" } },
      required: ["applicationId"],
    },
  },
  {
    name: "irb_missing_requirements",
    description: "List missing fields for an application",
    inputSchema: {
      type: "object",
      properties: { applicationId: { type: "number" } },
      required: ["applicationId"],
    },
  },
  {
    name: "irb_submit_application",
    description: "Submit an application that has passed both AI stages (triggers accelerated digital review)",
    inputSchema: {
      type: "object",
      properties: { applicationId: { type: "number" } },
      required: ["applicationId"],
    },
  },
  {
    name: "irb_chat_send",
    description: "Send a chatbot application turn (same backend as /chat-apply)",
    inputSchema: {
      type: "object",
      properties: {
        applicationId: { type: "number" },
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["user", "assistant"] },
              content: { type: "string" },
            },
          },
        },
      },
      required: ["applicationId", "messages"],
    },
  },
] as const;

async function handleMcp(req: Request, res: Response) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = (req.body ?? {}) as JsonRpcBody;
  const id = body.id ?? null;
  const method = body.method ?? "";
  const params = body.params ?? {};

  try {
    if (method === "initialize") {
      res.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "irb-ultimate", version: APP_VERSION },
          capabilities: { tools: {} },
        },
      });
      return;
    }
    if (method === "tools/list") {
      res.json({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } });
      return;
    }
    if (method === "tools/call") {
      const name = String(params.name ?? "");
      const args = (params.arguments as Record<string, unknown>) ?? {};
      const applicationId = Number(args.applicationId);
      let text = "";
      if (name === "irb_list_applications") {
        text = JSON.stringify(await auth.caller.application.myApplications());
      } else if (name === "irb_create_application") {
        text = JSON.stringify(await auth.caller.application.create());
      } else if (name === "irb_get_application") {
        text = JSON.stringify(await auth.caller.application.getById({ id: applicationId }));
      } else if (name === "irb_missing_requirements") {
        const application = await db.getApplicationById(applicationId);
        if (!application || (application.applicantId !== auth.user.id && auth.user.role !== "admin")) {
          res.status(404).json({ jsonrpc: "2.0", id, error: { code: -32004, message: "not found" } });
          return;
        }
        text = JSON.stringify({ missing: listMissingRequirements(application) });
      } else if (name === "irb_submit_application") {
        text = JSON.stringify(await auth.caller.application.submit({ id: applicationId }));
      } else if (name === "irb_chat_send") {
        const messages = Array.isArray(args.messages) ? args.messages : [];
        text = JSON.stringify(await auth.caller.chatApplication.sendMessage({
          applicationId,
          messages: messages as { role: "user" | "assistant"; content: string }[],
        }));
      } else {
        res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool" } });
        return;
      }
      res.json({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text }] },
      });
      return;
    }
    res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method" } });
  } catch (error) {
    sendAgentError(res, error);
  }
}

export function registerMcpJsonRpc(app: Express) {
  app.post("/api/mcp", handleMcp);
  app.post("/mcp", handleMcp);
}
