import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "./env";

export type LimitResult = { allowed: boolean; retryAfter: number; unavailable?: boolean };
const memory = new Map<string, { count: number; expires: number }>();
let cleanupAfter = 0;

/** Shared, atomic counters. Only pseudonymous bucket keys are stored; no raw IP/email. */
export async function consumeRateLimit(scope: string, identity: string, limit: number, windowMs: number): Promise<LimitResult> {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const expires = (window + 1) * windowMs;
  const retryAfter = Math.max(1, Math.ceil((expires - now) / 1000));
  const key = createHmac("sha256", ENV.cookieSecret || "isolated-test-rate-limit")
    .update(`${scope}:${identity}:${window}`).digest("hex");
  try {
    const database = await getDb();
    if (!database) throw new Error("Rate limit storage unavailable");
    await database.execute(sql`INSERT INTO request_limits (bucketKey, count, expiresAt)
      VALUES (${key}, 0, ${expires}) ON DUPLICATE KEY UPDATE bucketKey = bucketKey`);
    const result: any = await database.execute(sql`UPDATE request_limits SET count = count + 1
      WHERE bucketKey = ${key} AND count < ${limit}`);
    if (now >= cleanupAfter) {
      cleanupAfter = now + 60_000;
      // A bounded maintenance operation, never scan/delete the whole active table.
      void database.execute(sql`DELETE FROM request_limits WHERE expiresAt < ${now} LIMIT 5000`).catch(() => {});
    }
    return { allowed: Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0) === 1, retryAfter };
  } catch {
    if (ENV.isProduction) return { allowed: false, retryAfter: 60, unavailable: true };
    // Explicitly a local development fallback, never a production spend/abuse bypass.
    for (const [k, v] of memory) if (v.expires <= now) memory.delete(k);
    const bucket = memory.get(key);
    if (!bucket && memory.size >= 10_000) return { allowed: false, retryAfter };
    if (bucket && bucket.count >= limit) return { allowed: false, retryAfter };
    memory.set(key, { count: (bucket?.count ?? 0) + 1, expires });
    return { allowed: true, retryAfter };
  }
}
