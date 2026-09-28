import { ENV } from "./env";
const SAFE_NAMES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "TRPCError", "AbortError", "TimeoutError", "AggregateError"]);
/**
 * Only transport/driver codes from a fixed vocabulary are logged. They identify
 * the failing layer (DNS, TLS, auth, quota, timeout) without carrying any
 * provider text, SQL, parameters, hostnames or user data.
 */
const SAFE_CODE = /^(?:E[A-Z0-9_]{2,40}|ER_[A-Z0-9_]{2,60}|HANDSHAKE_[A-Z0-9_]{2,40}|PROTOCOL_[A-Z0-9_]{2,40}|UND_ERR_[A-Z0-9_]{2,40}|ERR_[A-Z0-9_]{2,60}|CERT_[A-Z0-9_]{2,40}|UNABLE_TO_[A-Z0-9_]{2,60}|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)$/;
const SAFE_SQL_STATE = /^[0-9A-Z]{5}$/;

type Diagnostic = { code?: unknown; errno?: unknown; sqlState?: unknown; message?: unknown; errors?: unknown; cause?: unknown };

/** Stable, non-identifying hint for well-known managed-database refusals. */
function classify(error: Diagnostic): string | undefined {
  const message = typeof error.message === "string" ? error.message : "";
  if (/usage quota|spending limit|request units? (?:have been )?exhausted/i.test(message)) return "database_quota_exhausted";
  if (/too many connections|max_user_connections|max connections/i.test(message)) return "database_connection_limit";
  if (/certificate|self[- ]signed|tls|ssl/i.test(message) && error.code === undefined) return "tls_verification";
  return undefined;
}

export function safeErrorCode(error: unknown, depth = 0): string | undefined {
  // Bounded walk: cyclic `cause` chains must never overflow the stack inside the logger.
  if (!error || typeof error !== "object" || depth > 4) return undefined;
  const value = error as Diagnostic;
  if (typeof value.code === "string" && SAFE_CODE.test(value.code)) return value.code;
  // Node reports multi-address connection failures as AggregateError without a top-level code.
  if (Array.isArray(value.errors)) {
    for (const nested of value.errors.slice(0, 8)) { const code = safeErrorCode(nested, depth + 1); if (code) return code; }
  }
  if (value.cause && value.cause !== error) return safeErrorCode(value.cause, depth + 1);
  return undefined;
}

/** Production logs retain error classes and fixed diagnostic codes, never provider bodies, SQL parameters or protocol text. */
export function safeLogError(error: unknown): unknown {
  if (!ENV.isProduction) return error;
  const name = error instanceof Error && SAFE_NAMES.has(error.name) ? error.name : "Error";
  if (!error || typeof error !== "object") return name;
  const value = error as Diagnostic;
  const parts = [name];
  const code = safeErrorCode(error);
  if (code) parts.push(`code=${code}`);
  if (Number.isSafeInteger(value.errno) && Math.abs(value.errno as number) < 100_000) parts.push(`errno=${value.errno}`);
  if (typeof value.sqlState === "string" && SAFE_SQL_STATE.test(value.sqlState)) parts.push(`sqlState=${value.sqlState}`);
  const hint = classify(value);
  if (hint) parts.push(`hint=${hint}`);
  return parts.join(" ");
}
