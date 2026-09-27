/**
 * Separates "the database cannot be reached right now" (network, TLS, auth,
 * connection limits, managed-provider quota) from real schema/SQL failures.
 * Availability failures keep the process up in maintenance mode and retry;
 * SQL failures during migration still stop the deploy.
 */
const AVAILABILITY_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ECONNABORTED",
  "PROTOCOL_CONNECTION_LOST", "PROTOCOL_SEQUENCE_TIMEOUT", "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "ER_CON_COUNT_ERROR", "ER_TOO_MANY_USER_CONNECTIONS", "ER_ACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR",
  "ER_SERVER_SHUTDOWN", "ER_NET_READ_INTERRUPTED", "ER_NET_WRITE_INTERRUPTED",
  "HANDSHAKE_SSL_ERROR", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "ERR_TLS_CERT_ALTNAME_INVALID",
]);
const AVAILABILITY_ERRNOS = new Set([1040, 1044, 1045, 1053, 1129, 1203, 2002, 2003, 2005, 2006, 2013]);

type DriverError = { code?: unknown; errno?: unknown; sqlState?: unknown; message?: unknown; errors?: unknown; cause?: unknown; fatal?: unknown };

export function isDatabaseAvailabilityError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) return false;
  const value = error as DriverError;
  if (typeof value.code === "string" && AVAILABILITY_CODES.has(value.code)) return true;
  if (typeof value.errno === "number" && AVAILABILITY_ERRNOS.has(value.errno)) return true;
  if (typeof value.sqlState === "string" && (value.sqlState.startsWith("08") || value.sqlState === "28000")) return true;
  const message = typeof value.message === "string" ? value.message : "";
  // Managed MySQL-compatible providers (e.g. TiDB Cloud) refuse with errno 1105 once a monthly quota is spent.
  if (/usage quota|spending limit|request units? (?:have been )?exhausted/i.test(message)) return true;
  if (/connect(?:ion)? timed? ?out|connection (?:is )?closed|getaddrinfo/i.test(message)) return true;
  if (Array.isArray(value.errors) && value.errors.some(nested => isDatabaseAvailabilityError(nested, depth + 1))) return true;
  if (value.cause && value.cause !== error) return isDatabaseAvailabilityError(value.cause, depth + 1);
  return false;
}
