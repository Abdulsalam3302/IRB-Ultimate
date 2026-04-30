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
    if (!u.username || !u.host || !projectId) return null;
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
} else if (cfg) {
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
    });
  } catch (err) {
    // Never let observability blow up the request path
    console.warn("[Observability] envelope send failed:", String(err).slice(0, 200));
  }
}

export function captureException(err: unknown, context: Record<string, any> = {}): void {
  if (!cfg) return;
  const e = err instanceof Error ? err : new Error(String(err ?? "unknown"));
  const frames = (e.stack || "").split("\n").slice(0, 30);
  const payload = buildEnvelope({
    exception: {
      values: [
        {
          type: e.name || "Error",
          value: (e.message || "(no message)").slice(0, 1000),
          stacktrace: { frames: frames.map(filename => ({ filename })) },
        },
      ],
    },
    tags: context.tags,
    extra: context.extra,
    user: context.user,
    request: context.request,
  });
  void sendEnvelope(payload);
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (!cfg) return;
  const payload = buildEnvelope({ message: message.slice(0, 4000), level });
  void sendEnvelope(payload);
}

export const observabilityEnabled = !!cfg;
