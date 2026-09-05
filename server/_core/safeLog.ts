import { ENV } from "./env";
const SAFE_NAMES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "TRPCError", "AbortError", "TimeoutError"]);
/** Production logs retain error classes, never provider bodies, SQL parameters or protocol text. */
export function safeLogError(error: unknown): unknown {
  if (!ENV.isProduction) return error;
  return error instanceof Error && SAFE_NAMES.has(error.name) ? error.name : "Error";
}
