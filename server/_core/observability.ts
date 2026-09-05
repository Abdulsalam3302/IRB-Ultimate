// Lightweight observability hooks. No third-party SDK dependency —
// when SENTRY_DSN is set, errors and selected events are POSTed to the
// Sentry envelope endpoint directly. When unset, captureException()
// and captureMessage() are no-ops.
//
// This keeps the runtime cost zero in development and avoids a hard
// dep on @sentry/node, which pulls a lot of code. Once the team wants
// breadcrumbs, profiling, or replays, swap to the official SDK; this
// shim's API matches.
//
// Set in .env:
//   SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
//   SENTRY_RELEASE=<git-sha>            # optional
//   SENTRY_ENVIRONMENT=production        # optional, defaults NODE_ENV

import { randomUUID } from "node:crypto";

interface SentryConfig {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string): SentryConfig | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.slice(1);
    if (u.protocol !== "https:" || !u.username || !u.host || !/^\d+$/.test(projectId)) return null;
    return { publicKey: u.username, host: u.host, projectId };
  } catch {
    return null;
  }
}

const DSN = process.env.SENTRY_DSN || "";
const cfg = DSN ? parseDsn(DSN) : null;
const RELEASE = process.env.SENTRY_RELEASE || undefined;
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";

if (DSN && !cfg) {
  console.warn("[Observability] SENTRY_DSN is malformed — events will NOT be sent");
} else if (cfg && ENVIRONMENT !== "production") {
  // SA-42: never echo Sentry host/project to a prod log stream — those
  // logs may end up in shared dashboards.
  console.log(`[Observability] Sentry envelope target: ${cfg.host}/${cfg.projectId} (env=${ENVIRONMENT})`);
}

function envelopeEndpoint(c: SentryConfig): string {
  // Sentry envelope endpoint per https://docs.sentry.io/api/envelopes/
  return `https://${c.host}/api/${c.projectId}/envelope/?sentry_key=${c.publicKey}&sentry_version=7`;
}

function buildEnvelope(eventBody: Record<string, unknown>): string {
  const eventId = randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();
  const header = JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn: DSN });
  const itemHeader = JSON.stringify({ type: "event" });
  const body = JSON.stringify({
    event_id: eventId,
    timestamp: sentAt,
    platform: "node",
    level: "error",
    release: RELEASE,
    environment: ENVIRONMENT,
    server_name: process.env.HOSTNAME || undefined,
    ...eventBody,
  });
  return `${header}\n${itemHeader}\n${body}`;
}

async function sendEnvelope(payload: string): Promise<void> {
  if (!cfg) return;
  try {
    await fetch(envelopeEndpoint(cfg), {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: payload,
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
  } catch (err) {
    // Never let observability blow up the request path
    console.warn("[Observability] envelope send failed");
  }
}

/**
 * SA-18: scrub fields that look like PII before forwarding to Sentry.
 * Sentry is generally extraterritorial — under PDPL we're the controller
 * and Sentry is a processor without a documented DPA, so the safest
 * default is to strip emails, openIds, IRB numbers, and JWTs from the
 * outbound event body. Stack frames stay (they're filenames, not PII).
 */
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/IRB-SA-\d{4}-\d{4,}/g, "[irb]"],
  // Bearer / eyJ JWT pattern
  [/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[jwt]"],
  // Long hex / base64 chunks that smell like keys / tokens (24+ chars)
  [/\b[A-Fa-f0-9]{24,}\b/g, "[hex]"],
];
function scrub(input: unknown): unknown {
  if (input == null) return input;
  if (typeof input === "string") {
    let s = input.length > 2000 ? input.slice(0, 2000) : input;
    for (const [re, repl] of PII_PATTERNS) s = s.replace(re, repl);
    return s;
  }
  if (Array.isArray(input)) return input.map(scrub);
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      // Drop keys that are themselves sensitive markers.
      if (/^(password|secret|token|cookie|authorization|api[_-]?key)$/i.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = scrub(v);
    }
    return out;
  }
  return input;
}

export function captureException(err: unknown, context: Record<string, any> = {}): void {
  if (!cfg) return;
  const e = err instanceof Error ? err : new Error(String(err ?? "unknown"));
  const frames = (e.stack || "").split("\n").slice(1, 16).filter(line => /^\s+at /.test(line));
  const payload = buildEnvelope({
    exception: {
      values: [
        {
          type: e.name || "Error",
          value: ENVIRONMENT === "production" ? "Application operation failed" : scrub((e.message || "(no message)").slice(0, 1000)) as string,
          stacktrace: { frames: frames.map(filename => ({ filename: scrub(filename) })) },
        },
      ],
    },
    // Request URLs, user records, database errors and arbitrary extra objects can contain health data.
    tags: { method: ["GET", "POST", "PUT", "DELETE"].includes(context.request?.method) ? context.request.method : "internal" },
  });
  void sendEnvelope(payload);
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (!cfg) return;
  const payload = buildEnvelope({ message: ENVIRONMENT === "production" ? "Application event" : scrub(message), level });
  void sendEnvelope(payload);
}

export const observabilityEnabled = !!cfg;
