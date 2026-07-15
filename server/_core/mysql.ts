import mysql from "mysql2";
import { ENV } from "./env";

/**
 * Local / private MySQL usually skip TLS. Public serverless MySQL
 * (TiDB Cloud, PlanetScale, Aiven, AWS RDS, Railway public) need TLS.
 */
export function resolveMysqlSsl(
  databaseUrl: string
): mysql.ConnectionOptions["ssl"] {
  if (
    databaseUrl.includes(".railway.internal") ||
    /ssl-mode=DISABLED|ssl=false|ssl-mode=disable/i.test(databaseUrl)
  ) {
    return undefined;
  }
  if (!ENV.isProduction && /127\.0\.0\.1|localhost/.test(databaseUrl)) {
    return undefined;
  }
  // Explicit query flag or known hosted MySQL providers → require TLS.
  if (
    /[?&]ssl=/i.test(databaseUrl) ||
    /\.rlwy\.net|\.psdb\.cloud|amazonaws\.com|\.planetscale\.com|tidbcloud\.com|\.tidbapi\.com|gateway\d*\.|\.aivencloud\.com|\.db\.ondigitalocean\.com/i.test(
      databaseUrl
    )
  ) {
    // TiDB Serverless and many free MySQL hosts use publicly signed certs.
    return { rejectUnauthorized: true };
  }
  if (ENV.isProduction) {
    // Fail closed on unknown production hosts: prefer TLS.
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
