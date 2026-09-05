import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "./env";

const localRevocations = new Map<string, number>();
const digest = (id: string) => createHash("sha256").update(id).digest("hex");
export async function isSessionRevoked(id: string): Promise<boolean> {
  const database = await getDb();
  if (database) {
    const rows: any = await database.execute(sql`SELECT tokenHash FROM session_revocations WHERE tokenHash = ${digest(id)} LIMIT 1`);
    return Boolean(rows?.[0]?.[0]);
  }
  if (ENV.isProduction) throw new Error("Session verification unavailable");
  for (const [key, expiry] of localRevocations) if (expiry <= Date.now()) localRevocations.delete(key);
  return localRevocations.has(digest(id));
}

export async function revokeSession(id: string, expiresAt: number): Promise<void> {
  const database = await getDb();
  if (database) {
    await database.execute(sql`INSERT INTO session_revocations (tokenHash, expiresAt) VALUES (${digest(id)}, ${expiresAt})
      ON DUPLICATE KEY UPDATE tokenHash = tokenHash`);
    await database.execute(sql`DELETE FROM session_revocations WHERE expiresAt < ${Date.now()} LIMIT 1000`);
    return;
  }
  if (ENV.isProduction) throw new Error("Session revocation unavailable");
  localRevocations.set(digest(id), expiresAt);
}
