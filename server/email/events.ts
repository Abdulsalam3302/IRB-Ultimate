import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { applications, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { mailConfig, normalizedEmail } from "./config";
import { recipientHash, unsubscribeToken } from "./crypto";
import { brandedMail, validatePdfAttachment } from "./templates";
import { enqueueMail, type QueueResult } from "./outbox";

async function recipient(userId: number) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Email delivery storage is unavailable.",
    });
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.loginMethod === "deleted" || !user.email) return null;
  return { ...user, email: normalizedEmail(user.email) };
}
export async function queueWelcomeEmail(input: {
  userId: number;
  eventId: string;
}): Promise<QueueResult> {
  const config = mailConfig();
  if (!config) return { id: null, status: "disabled" };
  const user = await recipient(input.userId);
  if (!user) return { id: null, status: "suppressed" };
  const payload = brandedMail(
    {
      to: user.email,
      subjectEn: "Welcome to IRB Saudi Arabia",
      subjectAr: "مرحباً بك في منصة أخلاقيات البحوث",
      titleEn: "Your account is ready",
      titleAr: "حسابك جاهز",
      bodyEn:
        "Welcome to IRB Saudi Arabia. You can prepare and track your research ethics applications from your account. Creating an account does not grant research approval. Official decisions require the responsible qualified committee and applicable institutional authorization.",
      bodyAr:
        "مرحباً بك في منصة أخلاقيات البحوث. يمكنك إعداد طلبات المراجعة الأخلاقية ومتابعتها من حسابك. إنشاء الحساب لا يُعد موافقة على إجراء البحث؛ إذ تتطلب القرارات الرسمية مراجعة اللجنة المختصة المؤهلة والتفويض المؤسسي المعمول به.",
      link: `${config.site}/dashboard`,
    },
    config
  );
  return enqueueMail({
    ...input,
    kind: "welcome",
    category: "transactional",
    payload,
  });
}
export async function queuePasswordResetEmail(input: {
  userId: number;
  eventId: string;
  resetUrl: string;
  expiresAt: Date;
}): Promise<QueueResult> {
  const config = mailConfig();
  if (!config) return { id: null, status: "disabled" };
  const url = new URL(input.resetUrl);
  if (
    url.origin !== config.site ||
    url.username ||
    url.password ||
    !["/reset-password", "/auth/reset-password"].includes(url.pathname)
  )
    throw new Error("Invalid reset destination");
  if (url.search || !/^#token=[a-f0-9]{64}$/.test(url.hash))
    throw new Error("Invalid reset link token");
  const user = await recipient(input.userId);
  if (!user) return { id: null, status: "suppressed" };
  const payload = brandedMail(
    {
      to: user.email,
      subjectEn: "Reset your password",
      subjectAr: "إعادة تعيين كلمة المرور",
      titleEn: "Password reset requested",
      titleAr: "طلب إعادة تعيين كلمة المرور",
      bodyEn:
        "Use the secure link below to choose a new password. The link is temporary and can be used once. Requesting a newer reset link invalidates previous links, including any email already in transit. If you did not request this, ignore this email; your password has not changed. Never share the link or your password.",
      bodyAr:
        "استخدم الرابط الآمن أدناه لاختيار كلمة مرور جديدة. الرابط مؤقت وصالح للاستخدام مرة واحدة. طلب رابط جديد يُبطل الروابط السابقة، بما فيها الروابط في الرسائل التي لا تزال قيد الإرسال. إذا لم تطلب ذلك، فتجاهل الرسالة؛ لم تتغير كلمة مرورك. لا تشارك الرابط أو كلمة المرور مع أي شخص.",
      link: input.resetUrl,
      linkEn: "Reset password",
      linkAr: "إعادة تعيين كلمة المرور",
    },
    config
  );
  payload.passwordReset = {
    userId: input.userId,
    tokenHash: createHash("sha256").update(url.hash.slice(7)).digest("hex"),
  };
  return enqueueMail({
    userId: input.userId,
    eventId: input.eventId,
    kind: "password_reset",
    category: "transactional",
    payload,
    expiresAt: input.expiresAt,
  });
}

export async function queueApplicationEmail(input: {
  applicationId: number;
  event: "submitted" | "approved" | "rejected" | "retracted";
  eventId?: string;
  certificate?: {
    filename: string;
    content: Buffer;
    contentType: "application/pdf";
  };
}): Promise<QueueResult> {
  const config = mailConfig();
  if (!config) return { id: null, status: "disabled" };
  const db = await getDb();
  if (!db) throw new Error("Email delivery storage unavailable");
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, input.applicationId));
  if (!app) throw new Error("Email application unavailable");
  const user = await recipient(app.applicantId);
  if (!user) return { id: null, status: "suppressed" };
  const final = input.event !== "submitted";
  const allowed =
    input.event === "approved"
      ? ["approved"]
      : input.event === "retracted"
        ? ["retracted"]
        : input.event === "rejected"
          ? ["rejected", "permanently_rejected", "resubmission_required"]
          : [
              "submitted",
              "under_review",
              "pending_admin",
              "resubmission_required",
            ];
  if (!allowed.includes(app.status))
    throw new Error("Application event no longer matches the recorded state");
  const at =
    input.event === "submitted"
      ? app.submittedAt
      : input.event === "retracted"
        ? app.retractedAt
        : app.humanDecisionAt;
  if (
    !at ||
    !Number.isFinite(new Date(at).getTime()) ||
    (final && (!app.humanDecisionByUserId || !app.humanDecisionAt))
  )
    throw new Error("Application email requires recorded event provenance");
  const revision = app.status === "resubmission_required";
  const copy =
    input.event === "submitted"
      ? {
          subjectEn: "Application received",
          subjectAr: "تم استلام الطلب",
          titleEn: "Your research ethics application was received",
          titleAr: "تم استلام طلب المراجعة الأخلاقية",
          bodyEn:
            "Your application has been recorded. Sign in to check its current review stage, requests for information, and any assigned actions. This acknowledgement does not authorize research activity.",
          bodyAr:
            "تم تسجيل طلبك. يرجى الدخول إلى حسابك للاطلاع على مرحلة المراجعة الحالية وطلبات استكمال المعلومات والإجراءات المطلوبة. إشعار الاستلام هذا لا يمنح إذناً بإجراء البحث.",
        }
      : input.event === "approved"
        ? {
            subjectEn: "Recorded approval decision",
            subjectAr: "قرار الموافقة المسجّل",
            titleEn: "An approval decision has been recorded",
            titleAr: "تم تسجيل قرار الموافقة",
            bodyEn:
              "The responsible committee's approval decision is recorded in your account. The decision certificate is attached. Before beginning or continuing research, review the approved protocol, conditions, duration and continuing-review requirements in the current committee record.",
            bodyAr:
              "تم تسجيل قرار موافقة اللجنة المختصة في حسابك، وأُرفقت شهادة القرار. قبل بدء البحث أو مواصلته، راجع البروتوكول المعتمد والشروط والمدة ومتطلبات المراجعة المستمرة في سجل اللجنة الحالي.",
          }
        : input.event === "retracted"
          ? {
              subjectEn: "Approval retraction notice",
              subjectAr: "إشعار سحب الموافقة",
              titleEn: "The recorded approval has been retracted",
              titleAr: "تم سحب الموافقة المسجّلة",
              bodyEn:
                "The previously recorded approval has been retracted. A retraction certificate is attached. Stop activities authorized by the retracted decision and immediately review the committee's instructions in your account.",
              bodyAr:
                "تم سحب الموافقة المسجّلة سابقاً، وأُرفقت شهادة سحب الموافقة. أوقف الأنشطة التي كان القرار المسحوب يجيزها، وراجع فوراً تعليمات اللجنة في حسابك.",
            }
          : revision
            ? {
                subjectEn: "Application revision requested",
                subjectAr: "طلب تعديل الطلب",
                titleEn: "Your application requires revision",
                titleAr: "يتطلب طلبك تعديلات",
                bodyEn:
                  "The committee has requested changes to your application. Review the recorded reasons and required actions in your account. This message does not grant research approval.",
                bodyAr:
                  "طلبت اللجنة إجراء تعديلات على طلبك. راجع الأسباب المسجّلة والإجراءات المطلوبة في حسابك. هذه الرسالة لا تمنح موافقة على إجراء البحث.",
              }
            : {
                subjectEn: "Recorded rejection decision",
                subjectAr: "قرار الرفض المسجّل",
                titleEn: "A rejection decision has been recorded",
                titleAr: "تم تسجيل قرار الرفض",
                bodyEn:
                  "The responsible committee's rejection decision is recorded in your account. The rejection decision certificate is attached. Review the reasons and any next steps in the authenticated record. No approval to conduct the proposed research is granted.",
                bodyAr:
                  "تم تسجيل قرار رفض اللجنة المختصة في حسابك، وأُرفقت شهادة قرار الرفض. راجع الأسباب والخطوات التالية إن وُجدت في السجل بعد تسجيل الدخول. لا يمنح هذا القرار موافقة على إجراء البحث المقترح.",
              };
  const payload = brandedMail(
    { to: user.email, ...copy, link: `${config.site}/application/${app.id}` },
    config
  );
  if (final) {
    payload.decision = {
      applicationId: app.id,
      status: app.status,
      decisionAt: new Date(at).toISOString(),
      recipientUserId: app.applicantId,
    };
    payload.certificateRequired = !revision;
    if (input.certificate)
      payload.attachments = [validatePdfAttachment(input.certificate)];
  }
  return enqueueMail({
    userId: app.applicantId,
    eventId:
      input.eventId ??
      `${input.event}:${app.id}:${app.submissionCount}:${new Date(at).toISOString()}`,
    kind: `application_${input.event}`,
    category: "transactional",
    payload,
  });
}

export async function enqueueAdministrativeEmail(input: {
  userId: number;
  eventId: string;
  subjectEn: string;
  subjectAr: string;
  bodyEn: string;
  bodyAr: string;
  category: "transactional" | "bulk";
  expectedRecipientHash?: string;
}): Promise<QueueResult> {
  const config = mailConfig();
  if (!config) return { id: null, status: "disabled" };
  const user = await recipient(input.userId);
  if (!user) return { id: null, status: "suppressed" };
  if (
    input.expectedRecipientHash &&
    recipientHash(user.email, config) !== input.expectedRecipientHash
  )
    return { id: null, status: "suppressed" };
  const unsubscribeUrl =
    input.category === "bulk"
      ? `${config.site}/api/email/unsubscribe/${unsubscribeToken(recipientHash(user.email, config), config)}`
      : undefined;
  const payload = brandedMail(
    {
      to: user.email,
      subjectEn: input.subjectEn,
      subjectAr: input.subjectAr,
      titleEn: input.subjectEn,
      titleAr: input.subjectAr,
      bodyEn: input.bodyEn,
      bodyAr: input.bodyAr,
      link: `${config.site}/dashboard`,
      unsubscribeUrl,
    },
    config
  );
  return enqueueMail({
    userId: input.userId,
    eventId: input.eventId,
    kind: "administrative",
    category: input.category,
    payload,
  });
}
