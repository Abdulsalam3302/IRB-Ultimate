import { getDb } from "./db";
import { notifications, users } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

// ─── In-App Notification Helpers ────────────────────────────────────────────

export async function createNotification(data: {
  userId: number;
  applicationId?: number;
  type: string;
  title: string;
  message: string;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(notifications).values({
      userId: data.userId,
      applicationId: data.applicationId || null,
      type: data.type as any,
      title: data.title,
      message: data.message,
    });
  } catch (err) {
    console.error("[Notification] Failed to create:", err);
  }
}

export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return rows.length;
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

// ─── Email-like Notification Triggers ───────────────────────────────────────

// These functions create in-app notifications AND send owner notifications
// for critical events. In production, these would also trigger actual emails.

export async function notifyApplicationSubmitted(applicantId: number, applicationId: number, researchTitle: string) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "application_submitted",
    title: "Application Submitted",
    message: `Your application "${researchTitle}" has been submitted and is now under committee review. You will be notified when reviews are received.`,
  });

  // Notify admin/owner
  await notifyOwner({
    title: "New IRB Application Submitted",
    content: `Application #${applicationId}: "${researchTitle}" has been submitted and assigned to committee members for review.`,
  });
}

export async function notifyAiReviewResult(applicantId: number, applicationId: number, stage: number, passed: boolean, score: number) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: passed ? "ai_review_passed" : "ai_review_failed",
    title: `Stage ${stage} AI Review ${passed ? "Passed" : "Failed"}`,
    message: passed
      ? `Your application passed the Stage ${stage} AI compliance check with a score of ${score}/100. You may proceed to the next step.`
      : `Your application did not pass the Stage ${stage} AI compliance check (score: ${score}/100). Please review the feedback and improve your application.`,
  });
}

export async function notifyCommitteeAssigned(committeeMemberId: number, applicationId: number, researchTitle: string) {
  // Find the user associated with this committee member
  const db = await getDb();
  if (!db) return;
  const { committeeMembers } = await import("../drizzle/schema");
  const members = await db.select().from(committeeMembers).where(eq(committeeMembers.id, committeeMemberId));
  if (!members.length) return;

  await createNotification({
    userId: members[0].userId,
    applicationId,
    type: "review_assignment",
    title: "New Review Assignment",
    message: `You have been assigned to review application "${researchTitle}". Please submit your review within 24 hours.`,
  });
}

export async function notifyReviewReceived(applicantId: number, applicationId: number, decision: string, approvalCount: number, totalReviews: number) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "review_received",
    title: "Committee Review Received",
    message: `A committee member has submitted their review (${decision}). Current progress: ${approvalCount} approvals out of ${totalReviews} reviews received. 3 approvals needed for admin review.`,
  });
}

export async function notifyPendingAdmin(applicantId: number, applicationId: number) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "review_received",
    title: "Application Moved to Admin Review",
    message: `Your application has received sufficient committee approvals and is now pending final administrative approval. You will be notified of the final decision.`,
  });

  await notifyOwner({
    title: "Application Ready for Final Approval",
    content: `Application #${applicationId} has received 3+ committee approvals and is awaiting your final decision.`,
  });
}

export async function notifyAdminApproved(applicantId: number, applicationId: number, irbNumber: string) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "admin_approved",
    title: "IRB Application Approved!",
    message: `Congratulations! Your application has been approved. Your IRB number is ${irbNumber}. The certificate has been generated and is available for download from your dashboard.`,
  });
}

export async function notifyAdminRejected(applicantId: number, applicationId: number, reason: string, canResubmit: boolean) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: canResubmit ? "resubmission_required" : "admin_rejected",
    title: canResubmit ? "Resubmission Required" : "Application Permanently Rejected",
    message: canResubmit
      ? `Your application has been returned for revision. Reason: ${reason}. Please address the feedback and resubmit your application.`
      : `Your application has been permanently rejected after the second review. Reason: ${reason}. You may submit an entirely new application for a substantially different research protocol.`,
  });
}

export async function notifyCertificateIssued(applicantId: number, applicationId: number, irbNumber: string) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "certificate_issued",
    title: "IRB Certificate Issued",
    message: `Your IRB certificate (${irbNumber}) has been generated and is ready for download. The certificate is valid for one year from the date of issuance.`,
  });
}

export async function notifyApplicationRetracted(applicantId: number, applicationId: number, reason: string, irbNumber: string) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "admin_rejected",
    title: "IRB Approval Retracted",
    message: `Your IRB approval (${irbNumber}) has been RETRACTED. Reason: ${reason}. A retraction certificate has been issued. All ongoing research activities under this IRB number must cease immediately. The retraction is publicly visible on the verification page.`,
  });

  await notifyOwner({
    title: "IRB Approval Retracted",
    content: `Application #${applicationId} (${irbNumber}) has been retracted. Reason: ${reason}. A retraction certificate has been generated.`,
  });
}

export async function notifyApplicationHidden(applicantId: number, applicationId: number, reason: string) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "admin_rejected",
    title: "Application Hidden from Verification",
    message: `Your application #${applicationId} has been hidden from public verification. Reason: ${reason}. This application will no longer appear in verification searches.`,
  });

  await notifyOwner({
    title: "Application Hidden",
    content: `Application #${applicationId} has been hidden from public verification. Reason: ${reason}.`,
  });
}

export async function notifyApplicationDeleted(applicantId: number, applicationId: number, reason: string) {
  await createNotification({
    userId: applicantId,
    applicationId,
    type: "admin_rejected",
    title: "Application Deleted",
    message: `Your application #${applicationId} has been moved to trash. Reason: ${reason}. If you believe this was done in error, please contact the administration.`,
  });
}

export async function notifyProceedDespiteScore(applicantId: number, applicationId: number, stage: number, reason: string) {
  await notifyOwner({
    title: `RED FLAG: Application Proceeded Despite AI Stage ${stage}`,
    content: `Application #${applicationId} was submitted despite failing AI Stage ${stage} review. Applicant's reason: "${reason}". This application requires careful manual investigation.`,
  });
}
