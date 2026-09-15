import nodemailer from "nodemailer";
import { createHmac } from "node:crypto";
import type { MailConfig } from "./config";
import { normalizedEmail } from "./config";
import { mailPayloadSchema, type MailPayload } from "./templates";

export type DeliveryResult =
  | { outcome: "accepted"; providerId: string }
  | {
      outcome: "retry" | "failed" | "unknown";
      code: string;
      ambiguous?: boolean;
    };
export function transportHash(config: MailConfig): string {
  return createHmac("sha256", config.key)
    .update(
      JSON.stringify([
        config.provider,
        config.from,
        config.provider === "resend"
          ? config.apiKey
          : [
              config.smtpHost,
              config.smtpPort,
              process.env.SMTP_USER,
              process.env.SMTP_PASSWORD,
            ],
      ])
    )
    .digest("hex");
}
async function boundedResponse(
  response: Response
): Promise<Record<string, unknown>> {
  if (!response.body) return {};
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) throw new Error("Oversized provider response");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** API acceptance and SMTP acceptance are not recipient delivery evidence. */
export async function sendMail(
  payload: MailPayload,
  id: string,
  config: MailConfig
): Promise<DeliveryResult> {
  mailPayloadSchema.parse(payload);
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new Error("Invalid email dispatch identity");
  const headers: Record<string, string> = payload.unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${payload.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : {};
  const attachments = payload.attachments.map(a => ({
    filename: a.filename,
    content: Buffer.from(a.content, "base64"),
    contentType: a.contentType,
  }));
  try {
    if (config.provider === "resend") {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `irb-email/${id}`,
          },
          body: JSON.stringify({
            from: `IRB Saudi Arabia <${config.from}>`,
            reply_to: config.from,
            to: [normalizedEmail(payload.to)],
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            headers,
            attachments: attachments.map(a => ({
              filename: a.filename,
              content: a.content.toString("base64"),
              content_type: a.contentType,
            })),
          }),
        });
        const body = await boundedResponse(response);
        if (
          response.ok &&
          typeof body.id === "string" &&
          /^[A-Za-z0-9_-]{1,255}$/.test(body.id)
        )
          return { outcome: "accepted", providerId: body.id };
        if (response.ok)
          return {
            outcome: "retry",
            code: "invalid_acceptance_response",
            ambiguous: true,
          };
        if (response.status === 429)
          return { outcome: "retry", code: "provider_rate_limited" };
        if (
          response.status === 409 &&
          body.name === "concurrent_idempotent_requests"
        )
          return {
            outcome: "retry",
            code: "provider_request_in_progress",
            ambiguous: true,
          };
        if (response.status >= 500)
          return {
            outcome: "retry",
            code: "provider_unavailable",
            ambiguous: true,
          };
        return {
          outcome: "failed",
          code: `provider_rejected_${response.status}`,
        };
      } catch {
        return {
          outcome: "retry",
          code: "provider_response_uncertain",
          ambiguous: true,
        };
      }
    }
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      requireTLS: true,
      tls: {
        rejectUnauthorized: true,
        servername: config.smtpHost,
        minVersion: "TLSv1.2",
      },
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
      pool: false,
      logger: false,
      debug: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      dnsTimeout: 10_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        transporter.sendMail({
          from: { name: "IRB Saudi Arabia", address: config.from },
          replyTo: config.from,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          messageId: `<irb-${id}@${config.from.split("@")[1]}>`,
          headers,
          attachments,
          disableFileAccess: true,
          disableUrlAccess: true,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            transporter.close();
            reject(new Error("Email deadline"));
          }, 30_000);
        }),
      ]);
      if (
        result.accepted?.length === 1 &&
        normalizedEmail(String(result.accepted[0])) ===
          normalizedEmail(payload.to) &&
        !result.rejected?.length
      )
        return { outcome: "accepted", providerId: `smtp:${id}` };
      return { outcome: "unknown", code: "smtp_acceptance_unconfirmed" };
    } catch (error) {
      const failure = error as {
        command?: string;
        responseCode?: number;
        code?: string;
      };
      if (
        failure.responseCode &&
        failure.responseCode >= 400 &&
        failure.responseCode < 600
      )
        return {
          outcome: failure.responseCode < 500 ? "retry" : "failed",
          code: `smtp_rejected_${failure.responseCode}`,
        };
      if (
        [
          "CONN",
          "EHLO",
          "HELO",
          "STARTTLS",
          "AUTH",
          "MAIL FROM",
          "RCPT TO",
        ].includes(failure.command || "")
      )
        return { outcome: "retry", code: "smtp_before_data_unavailable" };
      // SMTP has no portable idempotency guarantee. Never auto-replay a DATA
      // request if the final acknowledgement or local receipt was lost.
      return { outcome: "unknown", code: "smtp_delivery_uncertain" };
    } finally {
      if (timer) clearTimeout(timer);
      transporter.close();
    }
  } finally {
    for (const attachment of attachments) attachment.content.fill(0);
  }
}
