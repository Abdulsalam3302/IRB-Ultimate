import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number }
) => Promise<Buffer>;

// scrypt cost parameters. N=2^15 (32768) is the interactive-login standard —
// ~tens of ms per hash on commodity hardware, which is brute-force-resistant
// without making 100+ concurrent logins a CPU problem. maxmem is bumped so
// Node doesn't reject N=32768 (default cap is 32 MB; this needs ~64 MB).
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

const SALT_BYTES = 16;
const PREFIX = "scrypt";

/**
 * Hash a plaintext password. Returns a self-describing string of the form
 * `scrypt$N$r$p$<saltHex>$<hashHex>` so the parameters travel with the hash
 * and can be tuned later without breaking existing rows.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return [PREFIX, N, R, P, salt.toString("hex"), derived.toString("hex")].join("$");
}

/**
 * Verify a plaintext password against a stored hash. Constant-time on the
 * digest comparison. Returns false for any malformed/unknown hash rather than
 * throwing, so a corrupt row can never crash the login route.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const n = Number.parseInt(parts[1]!, 10);
  const r = Number.parseInt(parts[2]!, 10);
  const p = Number.parseInt(parts[3]!, 10);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "hex");
    expected = Buffer.from(parts[5]!, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
