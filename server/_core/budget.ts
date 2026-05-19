/**
 * Per-user daily LLM call budget (SA-03).
 *
 * The platform calls an external LLM provider on every Stage 1 / Stage 2
 * review and on every AI-assist mutation. Each call can burn the configured
 * LLM_MAX_TOKENS (default 24576). Without a per-user ceiling, a single
 * compromised cookie can run the platform into a four- or five-figure bill
 * before anyone notices.
 *
 * This module enforces TWO budgets:
 *  - per-user, per-day  (env LLM_USER_DAILY_LIMIT, default 60)
 *  - global, per-day    (env LLM_GLOBAL_DAILY_LIMIT, default 2000)
 *
 * Implementation is in-memory. That's deliberately a Phase-2 compromise:
 * good enough for single-instance Railway/Render deploys, not durable
 * across restarts or horizontal scale. Phase 3 should move this into a
 * Drizzle `llm_usage_daily` table so the counter survives deploys and
 * shares state across replicas.
 *
 * The counter rolls over at UTC midnight. We could window per-user, but
 * UTC-day is the simplest mental model for ops dashboards.
 */

const USER_DAILY_LIMIT = clampInt(
  process.env.LLM_USER_DAILY_LIMIT,
  60,
  { min: 1, max: 100_000 }
);
const GLOBAL_DAILY_LIMIT = clampInt(
  process.env.LLM_GLOBAL_DAILY_LIMIT,
  2000,
  { min: 1, max: 10_000_000 }
);

function clampInt(raw: string | undefined, fallback: number, opts: { min: number; max: number }): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(opts.min, Math.min(opts.max, n));
}

function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

type DayBucket = { day: string; count: number };
const userBuckets = new Map<number, DayBucket>();
let globalBucket: DayBucket = { day: utcDayKey(), count: 0 };

function getUserBucket(userId: number): DayBucket {
  const today = utcDayKey();
  const cur = userBuckets.get(userId);
  if (!cur || cur.day !== today) {
    const fresh = { day: today, count: 0 };
    userBuckets.set(userId, fresh);
    return fresh;
  }
  return cur;
}

function refreshGlobalBucket(): DayBucket {
  const today = utcDayKey();
  if (globalBucket.day !== today) {
    globalBucket = { day: today, count: 0 };
  }
  return globalBucket;
}

export type BudgetCheck =
  | { ok: true; userRemaining: number; globalRemaining: number }
  | { ok: false; reason: "user" | "global"; resetAt: string };

/**
 * Reserve one LLM call against the user + global budget. Caller MUST call
 * this BEFORE invoking the LLM. If `ok: false`, abort with a TRPCError
 * `TOO_MANY_REQUESTS`. The reservation is permanent for the day — there's
 * no refund on LLM failure, because retry pressure is exactly what we're
 * trying to bound.
 */
export function reserveLlmCall(userId: number): BudgetCheck {
  const u = getUserBucket(userId);
  const g = refreshGlobalBucket();
  if (u.count >= USER_DAILY_LIMIT) {
    return { ok: false, reason: "user", resetAt: nextMidnightISO() };
  }
  if (g.count >= GLOBAL_DAILY_LIMIT) {
    return { ok: false, reason: "global", resetAt: nextMidnightISO() };
  }
  u.count += 1;
  g.count += 1;
  return {
    ok: true,
    userRemaining: USER_DAILY_LIMIT - u.count,
    globalRemaining: GLOBAL_DAILY_LIMIT - g.count,
  };
}

function nextMidnightISO(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/**
 * Inspect remaining budget without consuming. Used by the dashboard to
 * surface "you've used 42/60 AI calls today" hints.
 */
export function inspectLlmBudget(userId: number) {
  const u = getUserBucket(userId);
  const g = refreshGlobalBucket();
  return {
    userUsed: u.count,
    userLimit: USER_DAILY_LIMIT,
    globalUsed: g.count,
    globalLimit: GLOBAL_DAILY_LIMIT,
    resetAt: nextMidnightISO(),
  };
}
