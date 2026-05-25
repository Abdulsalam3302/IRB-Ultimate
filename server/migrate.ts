import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { resolveMysqlSsl } from "./_core/mysql";
import mysql from "mysql2/promise";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));

/** Apply Drizzle SQL migrations at boot (production / Railway). */
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("[migrate] DATABASE_URL unset — skipping migrations");
    return;
  }
  const migrationsFolder = path.join(__dir, "../drizzle");
  console.log("[migrate] Applying migrations from", migrationsFolder);
  const ssl = resolveMysqlSsl(url);
  const conn = ssl
    ? await mysql.createConnection({ uri: url, ssl })
    : await mysql.createConnection(url);
  const db = drizzle(conn);
  try {
    await migrate(db, { migrationsFolder });
    console.log("[migrate] Done");
  } finally {
    await conn.end();
  }
}
