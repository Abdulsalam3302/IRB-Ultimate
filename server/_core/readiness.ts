import { sql } from "drizzle-orm";
import type { getDb } from "../db";

type DatabaseProbe = Pick<
  NonNullable<Awaited<ReturnType<typeof getDb>>>,
  "execute"
>;

/** Read-only schema checks. Empty data tables are valid; the quota singleton
 * is required to serialize admissions and must actually exist.
 */
export async function verifyDatabaseReadiness(
  database: DatabaseProbe | null | undefined
): Promise<void> {
  if (!database) throw new Error("Database unavailable");
  await database.execute(sql`SELECT bucketKey FROM request_limits LIMIT 1`);
  await database.execute(
    sql`SELECT tokenHash FROM session_revocations LIMIT 1`
  );
  await database.execute(
    sql`SELECT appointedAt FROM committee_members LIMIT 1`
  );
  await database.execute(sql`SELECT humanDecisionAt FROM applications LIMIT 1`);
  await database.execute(sql`SELECT identityIssuer FROM users LIMIT 1`);
  await database.execute(
    sql`SELECT storageProvider, storageOrigin, storageBucket, fileSize FROM file_uploads LIMIT 1`
  );
  await database.execute(
    sql`SELECT reason, status, attempts, nextAttemptAt, storageProvider, storageOrigin, storageBucket, fileSize FROM storage_deletion_jobs LIMIT 1`
  );
  const [rows] = await database.execute(
    sql`SELECT id FROM storage_quota_lock WHERE id = 1 LIMIT 1`
  );
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    Number((rows[0] as { id?: unknown }).id) !== 1
  ) {
    throw new Error("Storage quota lock is unavailable");
  }
}
