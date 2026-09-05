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
 *  - per-user, per-day  (env LLM_USER_DAILY_LIMIT, default 40)
 *  - global, per-day    (env LLM_GLOBAL_DAILY_LIMIT, default 500)
 *
 * Counters are persisted in the `llm_usage_daily` MySQL table so they
 * survive deploys/restarts and are shared across horizontal replicas
 * (previously in-memory only — a redeploy reset every counter and each
 * replica kept its own budget, multiplying the real spend ceiling).
 * When the DB is unavailable (local dev without MySQL) the module falls
 * back to the old in-memory buckets so AI features still work.
 *
 * The counter rolls over at UTC midnight.
 */

import { sql } from "drizzle-orm";
import { ENV } from "./env";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";

const USER_DAILY_LIMIT = clampInt(
  process.env.LLM_USER_DAILY_LIMIT,
  40,
  { min: 1, max: 100_000 }
);
const GLOBAL_DAILY_LIMIT = clampInt(
  process.env.LLM_GLOBAL_DAILY_LIMIT,
  500,
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

// ─── In-memory fallback (dev without a DB) ─────────────────────────────────

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

// ─── DB-backed counters ─────────────────────────────────────────────────────

/**
 * Atomically reserve one call for `scope` ("user:<id>" | "global") on `day`,
 * bounded by `limit`. Returns the post-reservation count, or null when the
 * limit is already reached. Uses INSERT … ON DUPLICATE KEY UPDATE with a
 * conditional increment so two replicas can never both take the last slot.
 */
async function dbReserve(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: string,
  day: string,
  limit: number,
): Promise<number | null> {
  // Ensure the row exists (count starts at 0 so the UPDATE below is the
  // single authoritative increment).
  await db.execute(sql`
    INSERT INTO llm_usage_daily (scope, day, count)
    VALUES (${scope}, ${day}, 0)
    ON DUPLICATE KEY UPDATE count = count
  `);
  const result: any = await db.execute(sql`
    UPDATE llm_usage_daily
    SET count = count + 1
    WHERE scope = ${scope} AND day = ${day} AND count < ${limit}
  `);
  const affected = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
  if (affected === 0) return null;
  const rows: any = await db.execute(sql`
    SELECT count FROM llm_usage_daily WHERE scope = ${scope} AND day = ${day} LIMIT 1
  `);
  const row = rows?.[0]?.[0] ?? rows?.[0];
  return Number(row?.count ?? limit);
}

async function dbRefund(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: string,
  day: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE llm_usage_daily SET count = GREATEST(count - 1, 0)
    WHERE scope = ${scope} AND day = ${day}
  `);
}

async function dbCount(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  scope: string,
  day: string,
): Promise<number> {
  const rows: any = await db.execute(sql`
    SELECT count FROM llm_usage_daily WHERE scope = ${scope} AND day = ${day} LIMIT 1
  `);
  const row = rows?.[0]?.[0] ?? rows?.[0];
  return Number(row?.count ?? 0);
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
export async function reserveLlmCall(userId: number): Promise<BudgetCheck> {
  const day = utcDayKey();
  let db: Awaited<ReturnType<typeof getDb>> = null;
  try {
    db = await getDb();
  } catch { /* fall through to memory */ }

  if (db) {
    try {
      const userCount = await dbReserve(db, `user:${userId}`, day, USER_DAILY_LIMIT);
      if (userCount === null) {
        return { ok: false, reason: "user", resetAt: nextMidnightISO() };
      }
      const globalCount = await dbReserve(db, "global", day, GLOBAL_DAILY_LIMIT);
      if (globalCount === null) {
        // Give the user their slot back — the platform limit blocked the
        // call, not their own usage.
        await dbRefund(db, `user:${userId}`, day).catch(() => {});
        return { ok: false, reason: "global", resetAt: nextMidnightISO() };
      }
      return {
        ok: true,
        userRemaining: Math.max(0, USER_DAILY_LIMIT - userCount),
        globalRemaining: Math.max(0, GLOBAL_DAILY_LIMIT - globalCount),
      };
    } catch (err) {
      console.warn("[Budget] Persistent reservation unavailable");
    }
  }

  if (ENV.isProduction) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AI budget accounting is temporarily unavailable. Please try again later." });

  // In-memory fallback is restricted to local development.
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
 * surface "you've used 42/200 AI calls today" hints.
 */
export async function inspectLlmBudget(userId: number) {
  const day = utcDayKey();
  let db: Awaited<ReturnType<typeof getDb>> = null;
  try {
    db = await getDb();
  } catch { /* fall through */ }

  if (db) {
    try {
      const [userUsed, globalUsed] = await Promise.all([
        dbCount(db, `user:${userId}`, day),
        dbCount(db, "global", day),
      ]);
      return {
        userUsed,
        userLimit: USER_DAILY_LIMIT,
        globalUsed,
        globalLimit: GLOBAL_DAILY_LIMIT,
        resetAt: nextMidnightISO(),
      };
    } catch (err) {
      console.warn("[Budget] Persistent accounting unavailable");
    }
  }

  if (ENV.isProduction) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AI budget accounting is temporarily unavailable." });

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
