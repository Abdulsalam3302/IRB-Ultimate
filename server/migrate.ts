import { readMigrationFiles } from "drizzle-orm/migrator";
import { resolveMysqlSsl } from "./_core/mysql";
import mysql from "mysql2/promise";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Keep historical SQL/hashes intact while supporting stock MySQL DDL. */
export function portableMigrationStatement(source: string): { sql: string; duplicateCode?: string } {
  const clean = source.replace(/^\s*--[^\n]*\n/gm, "").trim();
  if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF NOT EXISTS\s/i.test(clean)) {
    return { sql: clean.replace(/INDEX\s+IF NOT EXISTS\s/i, "INDEX "), duplicateCode: "ER_DUP_KEYNAME" };
  }
  if (/^ALTER TABLE\s+`?\w+`?\s+ADD COLUMN\s+IF NOT EXISTS\s/i.test(clean)) {
    return { sql: clean.replace(/ADD COLUMN\s+IF NOT EXISTS\s/i, "ADD COLUMN "), duplicateCode: "ER_DUP_FIELDNAME" };
  }
  return { sql: clean };
}

/** Explicit deploy migration step. Existing Drizzle journal stays authoritative. */
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required for migrations");
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");
  const conn = await mysql.createConnection({ uri: url, ssl: resolveMysqlSsl(url), connectTimeout: 10_000 });
  try {
    await conn.query("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id serial primary key, hash text not null, created_at bigint)");
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1");
    const last = Number(rows[0]?.created_at ?? 0);
    for (const migration of readMigrationFiles({ migrationsFolder })) {
      if (migration.folderMillis <= last) continue;
      for (const source of migration.sql) {
        const statement = portableMigrationStatement(source);
        if (!statement.sql) continue;
        try { await conn.query(statement.sql); }
        catch (error) {
          // Only ignore duplicates for SQL that explicitly requests idempotence.
          if (!statement.duplicateCode || (error as { code?: string }).code !== statement.duplicateCode) throw error;
        }
      }
      await conn.execute("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [migration.hash, migration.folderMillis]);
    }
    console.log("[migrate] Migrations applied");
  } finally { await conn.end(); }
}
