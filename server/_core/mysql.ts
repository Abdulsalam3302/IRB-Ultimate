import mysql from "mysql2";
import { ENV } from "./env";
import { boundedInt } from "./limits";

/** Decide from the parsed hostname, never a substring in credentials or query values. */
export function resolveMysqlSsl(databaseUrl: string): mysql.ConnectionOptions["ssl"] {
  const parsed = new URL(databaseUrl);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  const insecure = /^(?:false|disabled|disable)$/i.test(parsed.searchParams.get("ssl") ?? parsed.searchParams.get("ssl-mode") ?? "");
  if (!ENV.isProduction && (local || insecure)) return undefined;
  if (local && insecure && process.env.ALLOW_LOCAL_TEST_DB === "1") return undefined;
  if (ENV.isProduction && insecure) throw new Error("Production database transport must use verified TLS");
  if (ENV.isProduction || parsed.searchParams.has("ssl") || /(?:tidbcloud|tidbapi|psdb|planetscale|aivencloud|amazonaws|rlwy)\./i.test(parsed.hostname)) {
    return { rejectUnauthorized: true, verifyIdentity: true };
  }
  return undefined;
}

export function createMysqlPool(databaseUrl: string) {
  return mysql.createPool({
    uri: databaseUrl,
    ssl: resolveMysqlSsl(databaseUrl),
    connectionLimit: boundedInt(process.env.DATABASE_POOL_MAX, 10, 1, 100),
    waitForConnections: true,
    queueLimit: boundedInt(process.env.DATABASE_QUEUE_MAX, 50, 1, 500),
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
}
