import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { reserveLlmCall } from "./budget";
import type { TrpcContext } from "./context";

const isProduction = process.env.NODE_ENV === "production";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // SA-18 / anti-leak: in production we never echo back internal error
  // messages — only TRPCErrors we throw with explicit codes are surfaced.
  // Unexpected errors (Drizzle exceptions, undefined property reads, …)
  // would otherwise leak stack-trace fragments and table/column names to
  // any authenticated caller. Sentry (when configured) still gets the
  // full error via the express-level errorHandler.
  errorFormatter({ shape, error }) {
    const isExplicitTrpcError = error.code !== "INTERNAL_SERVER_ERROR";
    if (isExplicitTrpcError || !isProduction) {
      return shape;
    }
    return {
      ...shape,
      message: "Internal server error",
      data: shape.data
        ? { ...shape.data, stack: undefined, path: shape.data.path }
        : shape.data,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Procedures that hit the LLM provider must use `aiProcedure`. It reserves
 * one call against the per-user and global daily budgets (SA-03) BEFORE
 * the procedure body runs. On exhaustion the caller gets 429 with a
 * `resetAt` ISO timestamp telling them when the budget rolls over.
 *
 * The reservation is permanent — no refund on LLM failure. That's
 * deliberate: retry-on-error pressure is exactly the cost-amplification
 * vector we want to bound. Admins are NOT exempted; an attacker who pops
 * an admin cookie shouldn't get unlimited spend.
 */
const enforceLlmBudget = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    // protectedProcedure already enforced this; the re-narrow lets the chain
    // forward `user: User` to downstream procedures instead of `User | null`.
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  const check = reserveLlmCall(ctx.user.id);
  if (!check.ok) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        check.reason === "user"
          ? `Daily AI call limit reached. Resets at ${check.resetAt}.`
          : `Platform AI call limit reached. Resets at ${check.resetAt}.`,
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const aiProcedure = t.procedure.use(enforceLlmBudget);
