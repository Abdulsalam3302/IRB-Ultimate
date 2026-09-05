import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, ownerProcedure, publicProcedure, router } from "./trpc";
import { ENV } from "./env";
import { invokeLLM } from "./llm";
import { describeAiOutage } from "../aiReview";
import { inspectLlmBudget, reserveLlmCall } from "./budget";
import { TRPCError } from "@trpc/server";

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
