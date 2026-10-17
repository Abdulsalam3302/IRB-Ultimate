import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, ownerProcedure, publicProcedure, router } from "./trpc";
import { ENV } from "./env";
import { invokeLLM } from "./llm";
import { describeAiOutage } from "../aiReview";
import { inspectLlmBudget, reserveLlmCall } from "./budget";
import { TRPCError } from "@trpc/server";
import { remoteScannerStatus } from "../services/remoteScanner";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  /** In-process operator snapshot only: no document, credential or upstream probe. */
  scannerStatus: ownerProcedure.query(() => {
    const selected = process.env.UPLOAD_SCANNER_MODE || "clamav";
    const mode = selected === "remote" ? "remote" : selected === "clamav" ? "clamav" : "unsupported";
    const configured = mode === "remote"
      ? Boolean(process.env.SCANNER_WORKER_TOKENS?.trim())
      : mode === "clamav" && Boolean(process.env.CLAMAV_HOST?.trim());
    const bypassed = process.env.UPLOAD_SCAN_REQUIRED === "false";
    const required = ENV.isProduction ? !bypassed : process.env.UPLOAD_SCAN_REQUIRED === "true";
    let counts: ReturnType<typeof remoteScannerStatus> | null = null;
    if (mode === "remote") {
      try { counts = remoteScannerStatus(); }
      catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Scanner status is temporarily unavailable." }); }
    }
    const state = bypassed ? "disabled" : !configured ? "not_configured" : !counts ? "not_monitored"
      : counts.available > 0 ? "ready"
      : counts.connected > 0 && counts.active === counts.connected ? "busy" : "unavailable";
    return { mode, configured, required, state, checkedAt: new Date().toISOString(),
      connected: counts?.connected ?? null, available: counts?.available ?? null, active: counts?.active ?? null } as const;
  }),

  /** Owner-only AI provider probe — does not leak the API key. */
  aiStatus: ownerProcedure.query(async ({ ctx }) => {
    const configured = Boolean(ENV.llmApiKey && ENV.llmApiUrl);
    const budget = await inspectLlmBudget(ctx.user.id).catch(() => null);
    if (!configured) {
      return {
        configured: false,
        ok: false,
        provider: ENV.llmProvider,
        model: ENV.llmModel,
        baseUrl: ENV.llmApiUrl || null,
        error: "LLM_API_KEY / LLM_API_URL not set",
        budget,
      } as const;
    }
    try {
      const reservation = await reserveLlmCall(ctx.user.id);
      if (!reservation.ok) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Daily AI budget exhausted." });
      const result = await invokeLLM({
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        maxTokens: 16,
      });
      const content = result.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? content : "";
      return {
        configured: true,
        ok: text.trim() === "OK",
        provider: ENV.llmProvider,
        model: ENV.llmModel,
        baseUrl: ENV.llmApiUrl,
        sample: text.slice(0, 80),
        budget,
      } as const;
    } catch (err) {
      return {
        configured: true,
        ok: false,
        provider: ENV.llmProvider,
        model: ENV.llmModel,
        baseUrl: ENV.llmApiUrl,
        error: describeAiOutage(err),
        budget,
      } as const;
    }
  }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
