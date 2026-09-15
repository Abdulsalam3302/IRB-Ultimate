import { z } from "zod";
import type { MailConfig } from "./config";

const text = z
  .string()
  .max(16000)
  .refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v));
export const attachmentSchema = z
  .object({
    filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\.pdf$/),
    contentType: z.literal("application/pdf"),
    content: z.string().max(6_000_000),
  })
  .strict();
export const mailPayloadSchema = z
  .object({
    to: z.string().email().max(320),
    subject: z
      .string()
      .min(1)
      .max(240)
      .refine(v => !/[\r\n\x00-\x1f\x7f]/.test(v)),
    html: z.string().max(100000),
    text: z.string().max(50000),
    attachments: z.array(attachmentSchema).max(1),
    unsubscribeUrl: z.string().url().optional(),
    decision: z
      .object({
        applicationId: z.number().int().positive(),
        status: z.string(),
        decisionAt: z.string(),
        recipientUserId: z.number().int().positive(),
      })
      .strict()
      .optional(),
    certificateRequired: z.boolean().optional(),
    passwordReset: z
      .object({
        userId: z.number().int().positive(),
        tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
export type MailPayload = z.infer<typeof mailPayloadSchema>;
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function brandedMail(
  input: {
    to: string;
    subjectEn: string;
    subjectAr: string;
    titleEn: string;
    titleAr: string;
    bodyEn: string;
    bodyAr: string;
    link?: string;
    linkEn?: string;
    linkAr?: string;
    unsubscribeUrl?: string;
  },
  config: MailConfig
): MailPayload {
  for (const value of [
    input.titleEn,
    input.titleAr,
    input.bodyEn,
    input.bodyAr,
  ])
    text.parse(value);
  if (input.link && new URL(input.link).origin !== config.site)
    throw new Error("Email links must use the platform origin");
  const paragraph = (v: string) => escapeHtml(v).replace(/\n/g, "<br>");
  const link = input.link
    ? `<p><a style="color:#065f46;font-weight:bold" href="${escapeHtml(input.link)}">${escapeHtml(input.linkEn || "Open your dashboard")} · ${escapeHtml(input.linkAr || "فتح لوحة التحكم")}</a></p>`
    : "";
  const unsubscribe = input.unsubscribeUrl
    ? `<p style="font-size:12px"><a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe from optional updates · إلغاء الاشتراك في التحديثات الاختيارية</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f3;font-family:Arial,Tahoma,sans-serif;color:#18352c"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" style="max-width:100%;background:white;border-radius:12px" cellspacing="0" cellpadding="24"><tr><td style="border-bottom:4px solid #13795b"><img src="${config.site}/email-logo.png" width="48" height="48" alt="IRB Saudi Arabia" style="vertical-align:middle"><strong style="font-size:22px"> IRB Saudi Arabia</strong><div lang="ar" dir="rtl" style="font-size:16px;margin-top:10px">منصة أخلاقيات البحوث — المملكة العربية السعودية</div></td></tr><tr><td><section lang="en" dir="ltr"><h1 style="font-size:22px">${escapeHtml(input.titleEn)}</h1><p style="line-height:1.7">${paragraph(input.bodyEn)}</p></section><hr style="border:0;border-top:1px solid #dce6df;margin:28px 0"><section lang="ar" dir="rtl" style="text-align:right"><h2 style="font-size:22px">${escapeHtml(input.titleAr)}</h2><p style="line-height:1.9">${paragraph(input.bodyAr)}</p></section>${link}</td></tr><tr><td style="background:#edf4ef;font-size:13px;line-height:1.7"><strong>IRB Saudi Arabia | منصة أخلاقيات البحوث</strong><br>Committee coordination · تنسيق شؤون اللجنة<br><a href="mailto:${config.from}">${config.from}</a><br><a href="${config.site}">${config.site}</a><p>Confidential account correspondence. For case details and current decision conditions, use your authenticated dashboard.<br><span lang="ar" dir="rtl">مراسلات خاصة بالحساب. للاطلاع على تفاصيل الطلب وشروط القرار الحالية، يرجى الدخول إلى لوحة التحكم.</span></p>${unsubscribe}</td></tr></table></td></tr></table></body></html>`;
  const plain = `${input.titleEn}\n\n${input.bodyEn}\n\n${input.titleAr}\n\n${input.bodyAr}${input.link ? `\n\n${input.linkEn || "Open your dashboard"} / ${input.linkAr || "فتح لوحة التحكم"}: ${input.link}` : ""}\n\nIRB Saudi Arabia | منصة أخلاقيات البحوث\nCommittee coordination · تنسيق شؤون اللجنة\n${config.from}\n${config.site}${input.unsubscribeUrl ? `\nUnsubscribe from optional updates / إلغاء الاشتراك في التحديثات الاختيارية: ${input.unsubscribeUrl}` : ""}`;
  return mailPayloadSchema.parse({
    to: input.to,
    subject: `${input.subjectEn} | ${input.subjectAr}`,
    html,
    text: plain,
    attachments: [],
    unsubscribeUrl: input.unsubscribeUrl,
  });
}

export function validatePdfAttachment(input: {
  filename: string;
  contentType: "application/pdf";
  content: Buffer;
}) {
  if (
    !Buffer.isBuffer(input.content) ||
    input.content.length < 8 ||
    input.content.length > 4 * 1024 * 1024 ||
    input.content.subarray(0, 5).toString() !== "%PDF-"
  )
    throw new Error("Invalid decision PDF attachment");
  return attachmentSchema.parse({
    ...input,
    content: input.content.toString("base64"),
  });
}
