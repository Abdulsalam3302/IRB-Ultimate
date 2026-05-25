import mysql from "mysql2";
import { ENV } from "./env";

/** Railway internal MySQL and local dev do not use TLS; public proxies do. */
export function resolveMysqlSsl(
  databaseUrl: string
): mysql.ConnectionOptions["ssl"] {
  if (!ENV.isProduction) return undefined;
  if (
    databaseUrl.includes(".railway.internal") ||
    /ssl-mode=DISABLED|ssl=false/i.test(databaseUrl)
  ) {
    return undefined;
  }
  if (/[?&]ssl=/i.test(databaseUrl)) {
    return { rejectUnauthorized: true };
  }
  if (/\.rlwy\.net|\.psdb\.cloud|amazonaws\.com|\.planetscale\.com/i.test(databaseUrl)) {
    return { rejectUnauthorized: true };
  }
  return undefined;
}

export function createMysqlPool(databaseUrl: string) {
  return mysql.createPool({
    uri: databaseUrl,
    ssl: resolveMysqlSsl(databaseUrl),
    connectionLimit: parseInt(process.env.DATABASE_POOL_MAX ?? "25", 10),
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
}
