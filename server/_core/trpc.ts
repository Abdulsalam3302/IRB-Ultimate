import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { reserveLlmCall } from "./budget";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

// Captured once at module init (same SA-26 rationale as db.ts): a mid-run
// env mutation cannot re-target who counts as the platform owner.
const BOOT_OWNER_OPEN_ID = ENV.ownerOpenId;
const BOOT_OWNER_EMAIL = ENV.ownerEmail;

/** True only for the platform owner (admin whose identity matches
 *  OWNER_OPEN_ID / OWNER_EMAIL). Fails closed when neither env is set. */
export function isPlatformOwner(user: { role: string; openId: string; email?: string | null } | null): boolean {
  if (!user || user.role !== "admin") return false;
  if (BOOT_OWNER_OPEN_ID && user.openId === BOOT_OWNER_OPEN_ID) return true;
  if (BOOT_OWNER_EMAIL && (user.email ?? "").toLowerCase() === BOOT_OWNER_EMAIL) return true;
  return false;
}

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
 * Owner-only procedures. Stricter than adminProcedure: the caller must be
 * an admin AND match the boot-time owner identity. Secondary admins get
 * the same FORBIDDEN error as everyone else, so the existence of
 * owner-only features is not advertised to non-owners.
 */
export const ownerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!isPlatformOwner(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user! } });
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
  const check = await reserveLlmCall(ctx.user.id);
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
