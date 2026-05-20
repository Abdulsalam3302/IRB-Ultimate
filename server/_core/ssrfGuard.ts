import { lookup as dnsLookup } from "node:dns/promises";

/**
 * SA-38 — SSRF egress guard.
 *
 * Server-side fetches that take a user-supplied URL (voiceTranscription's
 * audioUrl, future "fetch this PDF" helpers, etc.) must check that the
 * destination isn't a cloud-metadata service, RFC1918 / link-local
 * address, or loopback before opening the connection. Otherwise an
 * attacker can pivot us into reading `169.254.169.254/latest/meta-data/`
 * for IAM credentials or scanning the internal Docker network.
 *
 * The check is: parse URL → must be http(s) → DNS-resolve host → reject
 * if any resolved IP falls in a blocked range. We do the resolve here so
 * a DNS-rebind attacker can't return a public IP at parse time and a
 * private IP at fetch time — but Node's `fetch` will re-resolve, so this
 * isn't bulletproof against an active rebinder. For higher assurance
 * use an outbound proxy (Squid/Envoy) with the same allowlist.
 *
 * In production, an explicit `ALLOWED_EGRESS_HOSTS` env var (comma-sep)
 * provides an additional allowlist — only those hosts are reachable.
 * When set, anything not on the list is rejected regardless of IP.
 */

const PRIVATE_PATTERNS: RegExp[] = [
  /^127\./,                           // loopback v4
  /^10\./,                            // private v4
  /^172\.(1[6-9]|2\d|3[0-1])\./,      // private v4 172.16/12
  /^192\.168\./,                      // private v4
  /^169\.254\./,                      // link-local v4 (cloud metadata!)
  /^0\./,                             // unspecified
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
  /^::1$/,                            // loopback v6
  /^fe80:/i,                          // link-local v6
  /^fc/i, /^fd/i,                     // unique local v6
];

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  return PRIVATE_PATTERNS.some(re => re.test(ip));
}

const ALLOWED_HOSTS = (process.env.ALLOWED_EGRESS_HOSTS ?? "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export async function assertSafeEgress(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("ssrf: invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`ssrf: protocol ${u.protocol} not allowed`);
  }
  const host = u.hostname.toLowerCase();
  // Explicit allowlist takes precedence: if set, this is the only check.
  if (ALLOWED_HOSTS.length > 0) {
    const ok = ALLOWED_HOSTS.some(h => host === h || host.endsWith("." + h));
    if (!ok) throw new Error(`ssrf: host ${host} not on allowlist`);
    return u;
  }
  // Reject literal private IPs in the hostname.
  if (isPrivateIp(host)) {
    throw new Error(`ssrf: host ${host} is private / loopback / link-local`);
  }
  // DNS-resolve the host and reject if ANY resolved address is private.
  try {
    const all = await dnsLookup(host, { all: true });
    for (const r of all) {
      if (isPrivateIp(r.address)) {
        throw new Error(`ssrf: host ${host} resolves to private ${r.address}`);
      }
    }
  } catch (err) {
    // Resolution failed → safer to reject than to fall through to fetch.
    throw new Error(`ssrf: DNS resolve failed for ${host}: ${(err as Error).message}`);
  }
  return u;
}
