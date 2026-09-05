import { safeLogError } from "../_core/safeLog";
import type { Express, Request, Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";
import { APP_VERSION } from "@shared/const";
import {
  IRB_REQUIREMENTS,
  listMissingRequirements,
} from "../services/irb.validation";
import * as db from "../db";
import { storageGet } from "../storage";
import { assertStaffMfa } from "../_core/staffAuth";
import { isOriginAllowed } from "../_core/security";

async function createHttpCaller(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as CreateExpressContextOptions);
  return { caller: appRouter.createCaller(ctx), user: ctx.user };
}

function sendAgentError(res: Response, error: unknown) {
  if (error instanceof TRPCError) {
    const status =
      error.code === "UNAUTHORIZED"
        ? 401
        : error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "TOO_MANY_REQUESTS"
              ? 429
              : error.code === "CONFLICT"
                ? 409
                : error.code === "PRECONDITION_FAILED"
                  ? 412
                  : error.code === "SERVICE_UNAVAILABLE"
                    ? 503
                    : error.code === "PAYLOAD_TOO_LARGE"
                      ? 413
                      : error.code === "INTERNAL_SERVER_ERROR"
                        ? 500
                        : 400;
    res
      .status(status)
      .json({ error: status === 500 ? "Request failed" : error.message });
    return;
  }
  console.error("[agent-api]", safeLogError(error));
  res.status(500).json({ error: "request failed" });
}

async function requireUser(req: Request, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  let auth;
  try {
    auth = await createHttpCaller(req, res);
  } catch (error) {
    sendAgentError(res, error);
    return null;
  }
  const { caller, user } = auth;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return { caller, user };
}

function parseApplicationId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) return null;
  return id;
}

function parseChatPayload(body: unknown, fallbackId?: number | null) {
  const raw = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const applicationId = parseApplicationId(
    String(raw.applicationId ?? fallbackId ?? "")
  );
  let messages = Array.isArray(raw.messages) ? raw.messages : [];
  if (messages.length === 0 && typeof raw.message === "string") {
    messages = [{ role: "user", content: raw.message }];
  }
  const lang: "ar" | "en" | undefined =
    raw.lang === "ar" ? "ar" : raw.lang === "en" ? "en" : undefined;
  return { applicationId, messages, lang };
}

async function handleChatSend(
  req: Request,
  res: Response,
  fallbackId?: number | null
) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const parsed = parseChatPayload(req.body, fallbackId);
  if (
    !parsed.applicationId ||
    (fallbackId != null && parsed.applicationId !== fallbackId)
  ) {
    res.status(400).json({ error: "Invalid application id" });
    return;
  }
  try {
    const result = await auth.caller.chatApplication.sendMessage({
      applicationId: parsed.applicationId,
      messages: parsed.messages as {
        role: "user" | "assistant";
        content: string;
      }[],
      lang: parsed.lang,
    });
    res.json(result);
  } catch (error) {
    sendAgentError(res, error);
  }
}

/**
 * Thin REST adapter around existing tRPC. Cookie session required.
 * Also mounts JSON-RPC MCP at POST /api/mcp behind API request guards.
 */
export function registerIrbAgentRoutes(app: Express) {
  app.get("/api/irb/files/:id", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const auth = await requireUser(req, res);
      if (!auth) return;
      const id = parseApplicationId(req.params.id);
      const file = id ? await db.getFileUploadById(id) : null;
      if (!file) throw new TRPCError({ code: "NOT_FOUND" });
      if (file.userId !== auth.user.id) {
        if (file.applicationId) {
          // Application ownership is independent of who uploaded its document.
          // The shared viewer check permits the applicant and requires staff
          // MFA plus a current assignment for cross-application reviewer access.
          await auth.caller.application.getById({ id: file.applicationId });
        } else if (auth.user.role === "admin") {
          assertStaffMfa(auth.user);
        } else {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      const { url } = await storageGet(file.fileKey, 300);
      res.redirect(302, url);
    } catch (error) {
      sendAgentError(res, error);
    }
  });
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

  app.get(
    "/api/irb/applications/:id/missing-requirements",
    async (req, res) => {
      const auth = await requireUser(req, res);
      if (!auth) return;
      const id = parseApplicationId(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Invalid application id" });
        return;
      }
      try {
        const application = await db.getApplicationById(id);
        if (
          !application ||
          (application.applicantId !== auth.user.id &&
            auth.user.role !== "admin")
        ) {
          res.status(404).json({ error: "not found" });
          return;
        }
        if (application.applicantId !== auth.user.id) assertStaffMfa(auth.user);
        res.json({ missing: listMissingRequirements(application) });
      } catch (error) {
        sendAgentError(res, error);
      }
    }
  );

  app.post("/api/irb/applications/:id/chat", async (req, res) => {
    await handleChatSend(req, res, parseApplicationId(req.params.id));
  });

  app.post("/api/irb/chat", async (req, res) => {
    await handleChatSend(req, res);
  });

  app.post("/api/chat/send", async (req, res) => {
    await handleChatSend(req, res);
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

// Explicitly implement the initialize-based Streamable HTTP revisions. The
// 2026-07-28 per-request-metadata revision is not advertised by this adapter.
// https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
const MCP_PROTOCOL_VERSIONS = [
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
] as const;
const MCP_PROTOCOL_VERSION = "2025-11-25";
const applicationIdSchema = z.number().int().positive().max(2_147_483_647);
const emptyArguments = z.object({}).strict();
const applicationArguments = z
  .object({ applicationId: applicationIdSchema })
  .strict();
const chatArguments = z
  .object({
    applicationId: applicationIdSchema,
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(4000),
          })
          .strict()
      )
      .min(1)
      .max(16),
    lang: z.enum(["ar", "en"]).optional(),
  })
  .strict();

const toolDefinitions = [
  {
    name: "irb_list_applications",
    description: "List the authenticated user's IRB applications",
    schema: emptyArguments,
    readOnly: true,
  },
  {
    name: "irb_create_application",
    description: "Create a new IRB application draft",
    schema: emptyArguments,
    readOnly: false,
  },
  {
    name: "irb_get_application",
    description: "Get one authorized IRB application by id",
    schema: applicationArguments,
    readOnly: true,
  },
  {
    name: "irb_missing_requirements",
    description: "List missing fields for an authorized application",
    schema: applicationArguments,
    readOnly: true,
  },
  {
    name: "irb_submit_application",
    description:
      "Submit a completed application for qualified human committee review. AI assessment is advisory and cannot issue research approval.",
    schema: applicationArguments,
    readOnly: false,
  },
  {
    name: "irb_chat_send",
    description:
      "Send an application chat turn that may update editable draft fields. Model output is advisory; no approval authority.",
    schema: chatArguments,
    readOnly: false,
  },
  {
    name: "irb_admin_committee_members",
    description:
      "List committee members (admin with required staff assurance; authorized on the server)",
    schema: emptyArguments,
    readOnly: true,
    admin: true,
  },
] as const;

function mcpToolsFor(role: string | undefined, includeAll = false) {
  return toolDefinitions
    .filter(tool => includeAll || !("admin" in tool) || role === "admin")
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.schema),
      annotations: {
        readOnlyHint: tool.readOnly,
        destructiveHint: !tool.readOnly,
        idempotentHint: tool.readOnly,
        openWorldHint: tool.name === "irb_chat_send",
      },
    }));
}

function rpcError(
  res: Response,
  id: string | number | null,
  code: number,
  message: string,
  status = 200
) {
  res.status(status).json({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMcp(req: Request, res: Response) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const accepted = new Set(
    (req.get("accept") ?? "")
      .split(",")
      .filter(value => !/;\s*q=0(?:\.0*)?\s*(?:;|$)/i.test(value))
      .map(value => value.split(";")[0].trim().toLowerCase())
  );
  if (!accepted.has("application/json") || !accepted.has("text/event-stream")) {
    rpcError(
      res,
      null,
      -32600,
      "Accept must include application/json and text/event-stream",
      406
    );
    return;
  }
  if (!req.is("application/json")) {
    rpcError(res, null, -32600, "Content-Type must be application/json", 415);
    return;
  }
  const requestedVersion = req.get("MCP-Protocol-Version");
  if (
    requestedVersion &&
    !MCP_PROTOCOL_VERSIONS.includes(
      requestedVersion as (typeof MCP_PROTOCOL_VERSIONS)[number]
    )
  ) {
    rpcError(res, null, -32600, "Unsupported MCP protocol version", 400);
    return;
  }
  // Required by the 2025 revision for older clients omitting the header.
  res.setHeader("MCP-Protocol-Version", requestedVersion ?? "2025-03-26");
  const parsed = z
    .object({
      jsonrpc: z.literal("2.0"),
      id: z.union([z.string().max(128), z.number().int().safe()]).optional(),
      method: z.string().min(1).max(128),
      params: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .safeParse(req.body);
  if (!parsed.success) {
    rpcError(res, null, -32600, "Invalid JSON-RPC request", 400);
    return;
  }
  const { id, method, params = {} } = parsed.data;
  // Notifications never execute tools or mutate applications. No server-initiated
  // requests, SSE stream, resumability or MCP session store is advertised.
  if (id === undefined) {
    res.status(202).end();
    return;
  }
  if (method === "initialize") {
    const initialization = z
      .object({
        protocolVersion: z.string().min(1).max(32),
        capabilities: z.record(z.string(), z.unknown()),
        clientInfo: z
          .object({
            name: z.string().min(1).max(256),
            version: z.string().min(1).max(128),
          })
          .passthrough(),
      })
      .passthrough()
      .safeParse(params);
    if (!initialization.success) {
      rpcError(
        res,
        id,
        -32602,
        "Initialization requires protocolVersion, capabilities and clientInfo"
      );
      return;
    }
    const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(
      initialization.data
        .protocolVersion as (typeof MCP_PROTOCOL_VERSIONS)[number]
    )
      ? initialization.data.protocolVersion
      : MCP_PROTOCOL_VERSION;
    res.setHeader("MCP-Protocol-Version", protocolVersion);
    res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        serverInfo: { name: "irb-ultimate", version: APP_VERSION },
        capabilities: { tools: {} },
        instructions:
          "Existing IRB session authentication is required. Draft creation, chat and submission tools can mutate your application; obtain user authorization. Research approval requires a qualified human committee.",
      },
    });
    return;
  }
  if (method === "ping") {
    res.json({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list") {
    res.json({
      jsonrpc: "2.0",
      id,
      result: { tools: mcpToolsFor(auth.user.role) },
    });
    return;
  }
  if (method !== "tools/call") {
    rpcError(res, id, -32601, "Unknown method");
    return;
  }
  const call = z
    .object({
      name: z.string().min(1).max(128),
      arguments: z.record(z.string(), z.unknown()).optional(),
      _meta: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .safeParse(params);
  if (!call.success) {
    rpcError(res, id, -32602, "Invalid tool call parameters");
    return;
  }
  const tool = toolDefinitions.find(
    definition => definition.name === call.data.name
  );
  if (!tool) {
    rpcError(res, id, -32602, "Unknown tool");
    return;
  }
  const args = tool.schema.safeParse(call.data.arguments ?? {});
  if (!args.success) {
    rpcError(
      res,
      id,
      -32602,
      "Invalid tool arguments; use the advertised input schema"
    );
    return;
  }
  const applicationId =
    "applicationId" in args.data ? args.data.applicationId : undefined;
  try {
    let result: unknown;
    if (tool.name === "irb_list_applications")
      result = await auth.caller.application.myApplications();
    else if (tool.name === "irb_create_application")
      result = await auth.caller.application.create();
    else if (tool.name === "irb_get_application")
      result = await auth.caller.application.getById({ id: applicationId! });
    else if (tool.name === "irb_missing_requirements") {
      const application = await db.getApplicationById(applicationId!);
      if (
        !application ||
        (application.applicantId !== auth.user.id && auth.user.role !== "admin")
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Application not found",
        });
      }
      if (application.applicantId !== auth.user.id) assertStaffMfa(auth.user);
      result = { missing: listMissingRequirements(application) };
    } else if (tool.name === "irb_submit_application")
      result = await auth.caller.application.submit({ id: applicationId! });
    else if (tool.name === "irb_chat_send")
      result = await auth.caller.chatApplication.sendMessage(
        chatArguments.parse(args.data)
      );
    else if (tool.name === "irb_admin_committee_members") {
      if (auth.user.role !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin required" });
      assertStaffMfa(auth.user);
      result = await auth.caller.admin.allCommitteeMembers();
    }
    res.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: JSON.stringify(result) }] },
    });
  } catch (error) {
    const message =
      error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR"
        ? error.message
        : "Tool request failed";
    res.json({
      jsonrpc: "2.0",
      id,
      result: { isError: true, content: [{ type: "text", text: message }] },
    });
  }
}

export function mcpDiscoveryDocument() {
  return {
    name: "irb-ultimate",
    version: APP_VERSION,
    description:
      "Authenticated IRB workflow tools, including draft creation, chat edits and submission. Existing session cookie required; this endpoint does not provide an MCP OAuth authorization flow. Research decisions require an appointed human committee.",
    endpoint: "/api/mcp",
    transport: "streamable-http",
    protocolVersions: MCP_PROTOCOL_VERSIONS,
    stateless: true,
    tools: mcpToolsFor(undefined, true),
  };
}

export function registerMcpJsonRpc(app: Express) {
  const discovery = (_req: Request, res: Response) => {
    res.json(mcpDiscoveryDocument());
  };
  app.get("/.well-known/mcp.json", discovery);
  app.get("/api/mcp.json", discovery);
  app.all("/api/mcp", (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    // Validate Origin even on unsupported methods. The shared application guard
    // also protects POST; this keeps the adapter safe when mounted on its own.
    if (
      req.get("origin") &&
      !isOriginAllowed({
        method: "POST",
        headers: req.headers,
        ip: req.ip,
        socket: req.socket,
        protocol: req.protocol,
        get: req.get.bind(req),
      } as Request)
    ) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  });
  app.post("/api/mcp", handleMcp);
  // JSON-only stateless Streamable HTTP needs no persistent SSE stream/session.
  // GET/DELETE explicitly return 405 rather than falling through to the SPA.
  app.all("/api/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    res
      .status(405)
      .json({ error: "This stateless MCP endpoint accepts POST only" });
  });
}
