import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

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

export function isPrivateIp(input: string): boolean {
  const ip = input.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(ip) === 6) {
    // Permit global-unicast 2000::/3 only; reject mapped IPv4, local, multicast,
    // unspecified, documentation and transition ranges that can reach IPv4 internals.
    return !/^[23][0-9a-f]{3}:/.test(ip) || /^2001:(?:0:|db8:)/.test(ip) || ip.startsWith("2002:");
  }
  return true;
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
  if (u.username || u.password) throw new Error("ssrf: credentials in URL not allowed");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  // Explicit allowlist takes precedence: if set, this is the only check.
  if (ALLOWED_HOSTS.length > 0) {
    const ok = ALLOWED_HOSTS.some(h => host === h || host.endsWith("." + h));
    if (!ok) throw new Error(`ssrf: host ${host} not on allowlist`);
  }
  // Reject literal private IPs in the hostname.
  if (isIP(host) && isPrivateIp(host)) {
    throw new Error(`ssrf: host ${host} is private / loopback / link-local`);
  }
  // DNS-resolve the host and reject if ANY resolved address is private.
  try {
    const all = isIP(host) ? [{ address: host }] : await dnsLookup(host, { all: true });
    if (!all.length) throw new Error("empty DNS response");
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
