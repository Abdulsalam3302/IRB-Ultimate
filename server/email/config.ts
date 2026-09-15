import { z } from "zod";
import { boundedInt } from "../_core/limits";

export type MailProvider = "resend" | "smtp";
export function normalizedEmail(value: string): string {
  if (/[\r\n\x00-\x1f\x7f]/.test(value))
    throw new Error("Invalid email address");
  return z.string().max(320).email().parse(value.trim()).toLowerCase();
}
export function mailConfig() {
  const provider = process.env.MAIL_PROVIDER || "disabled";
  if (provider === "disabled") return null;
  if (provider !== "resend" && provider !== "smtp")
    throw new Error("Invalid email provider configuration");
  const secret = process.env.MAIL_ENCRYPTION_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(secret))
    throw new Error("Email encryption key is unavailable");
  const from = normalizedEmail(process.env.MAIL_FROM || "committee@irb-sa.org");
  const site = new URL(
    process.env.PUBLIC_APP_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      "https://irb-sa.org"
  );
  if (
    site.protocol !== "https:" ||
    site.username ||
    site.password ||
    site.pathname !== "/" ||
    site.search ||
    site.hash ||
    site.port
  )
    throw new Error("Invalid email site origin");
  const apiKey = process.env.RESEND_API_KEY || "";
  const smtpHost = process.env.SMTP_HOST || "";
  const smtpPort = Number(process.env.SMTP_PORT || "465");
  if (provider === "resend" && !apiKey)
    throw new Error("Email API configuration is unavailable");
  if (
    provider === "smtp" &&
    (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{1,252}$/.test(smtpHost) ||
      ![465, 587, 2525].includes(smtpPort) ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD)
  )
    throw new Error("Email SMTP configuration is unavailable");
  return {
    provider: provider as MailProvider,
    from,
    site: site.origin,
    key: Buffer.from(secret, "hex"),
    apiKey,
    smtpHost,
    smtpPort,
    dailyLimit: boundedInt(process.env.MAIL_DAILY_LIMIT, 90, 1, 1000),
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET || "",
  };
}
export type MailConfig = NonNullable<ReturnType<typeof mailConfig>>;
