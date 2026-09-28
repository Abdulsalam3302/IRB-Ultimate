import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { applications, auditLog, committeeMembers, notifications, reviewAssignments, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { enqueueAdministrativeEmail } from "../emailService";
import { startAdaptivePoller } from "../_core/adaptivePoller";
import { safeLogError } from "../_core/safeLog";

/**
 * 24-hour review service standard. Automated screening starts at submission;
 * this sweep keeps human review moving. It is self-healing: every awaiting
 * application is topped up to its required number of independent reviewers
 * (5 for full board, otherwise 1) counting live assignments and votes already
 * cast, so a lapse, a crash mid-sweep or an older orphaned record is repaired
 * on the next run. Each application is handled under its row lock, so
 * concurrent sweeps cannot create duplicate assignments. It also reminds
 * reviewers before their 24-hour window ends and escalates applications still
 * awaiting a human decision after 24 hours. It never records a vote or decision.
 */
export const REVIEW_TARGET_HOURS = 24;
const DUE_SOON_MS = 6 * 3600_000;
const ASSIGNMENT_MS = 24 * 3600_000;
const AWAITING = ["under_review", "pending_admin"] as const;
const SWEEP_LIMIT = 200;

export type SweepScope = { applicationIds?: number[] };

type Notice = { userId: number; applicationId: number; type: "review_reminder" | "review_assignment"; title: string; message: string; since: Date };

/** In-app notices are idempotent per recipient, application, type and title since `since`. */
async function notifyOnce(notice: Notice): Promise<boolean> {
  const db = await getDb(); if (!db) return false;
  const [existing] = await db.select({ id: notifications.id }).from(notifications)
    .where(and(eq(notifications.userId, notice.userId), eq(notifications.applicationId, notice.applicationId), eq(notifications.type, notice.type), eq(notifications.title, notice.title), gte(notifications.createdAt, notice.since))).limit(1);
  if (existing) return false;
  await db.insert(notifications).values({ userId: notice.userId, applicationId: notice.applicationId, type: notice.type, title: notice.title, message: notice.message });
  return true;
}

/** Administrators other than the applicant (independence: nobody is alerted about their own submission). */
async function activeAdmins(excludeUserId?: number): Promise<number[]> {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.role, "admin"), sql`COALESCE(${users.loginMethod}, '') NOT IN ('deleted', 'digital_reviewer')`, excludeUserId ? ne(users.id, excludeUserId) : undefined))
    .orderBy(users.id).limit(20);
  return rows.map(row => row.id);
}

const scoped = (ids?: number[]) => (ids && ids.length ? inArray(applications.id, ids) : undefined);

/** Awaiting applications (never a decision on the current submission). A resubmission keeps an older humanDecisionAt. */
const awaitingDecision = () => and(
  inArray(applications.status, [...AWAITING]),
  sql`${applications.submittedAt} IS NOT NULL`,
  or(isNull(applications.humanDecisionAt), lt(applications.humanDecisionAt, applications.submittedAt)),
);

type Assigned = { applicationId: number; assignmentId: number; memberUserId: number; renewed: boolean };

/** Top up one application to its required reviewer count under the application row lock. */
async function topUpApplication(applicationId: number, now: Date): Promise<Assigned[]> {
  const db = await getDb(); if (!db) return [];
  return db.transaction(async tx => {
    const [app] = await tx.select({ id: applications.id, status: applications.status, applicantId: applications.applicantId, irbCategory: applications.irbCategory })
      .from(applications).where(eq(applications.id, applicationId)).for("update");
    if (!app || !AWAITING.includes(app.status as typeof AWAITING[number])) return [];
    // Retire lapsed pending assignments for this application only.
    await tx.update(reviewAssignments).set({ status: "expired" })
      .where(and(eq(reviewAssignments.applicationId, app.id), eq(reviewAssignments.status, "pending"), lte(reviewAssignments.expiresAt, now)));
    const rows = await tx.select({ memberId: reviewAssignments.committeeMemberId, status: reviewAssignments.status, expiresAt: reviewAssignments.expiresAt })
      .from(reviewAssignments).where(eq(reviewAssignments.applicationId, app.id));
    // Votes on this submission round plus live assignments count toward the requirement
    // (earlier rounds were marked expired at resubmission).
    const active = rows.filter(row => row.status === "approved" || row.status === "rejected" || (row.status === "pending" && row.expiresAt.getTime() > now.getTime()));
    const required = app.irbCategory === "full_board" ? 5 : 1;
    const needed = required - active.length;
    if (needed <= 0) return [];
    const busy = new Set(active.map(row => row.memberId));
    const lapsed = new Set(rows.filter(row => row.status === "expired").map(row => row.memberId));
    const candidates = await tx.select({ member: committeeMembers }).from(committeeMembers)
      .innerJoin(users, eq(users.id, committeeMembers.userId))
      .where(and(eq(committeeMembers.isActive, true), sql`${committeeMembers.appointedAt} IS NOT NULL`, sql`CHAR_LENGTH(TRIM(COALESCE(${committeeMembers.qualificationReference}, ''))) >= 10`,
        ne(committeeMembers.userId, app.applicantId), sql`COALESCE(${users.loginMethod}, '') NOT IN ('digital_reviewer', 'deleted')`, sql`${users.openId} NOT LIKE 'digital-reviewer:%'`,
        busy.size ? notInArray(committeeMembers.id, [...busy]) : undefined))
      .orderBy(committeeMembers.totalAssignments, committeeMembers.id);
    // Fresh reviewers first (least loaded); renew a lapsed reviewer only when nobody else is available.
    const ordered = [...candidates.filter(row => !lapsed.has(row.member.id)), ...candidates.filter(row => lapsed.has(row.member.id))].slice(0, needed);
    const assigned: Assigned[] = [];
    for (const { member } of ordered) {
      const inserted = await tx.insert(reviewAssignments).values({ applicationId: app.id, committeeMemberId: member.id, assignedBy: "system", status: "pending", expiresAt: new Date(now.getTime() + ASSIGNMENT_MS) });
      await tx.update(committeeMembers).set({ totalAssignments: sql`${committeeMembers.totalAssignments} + 1` }).where(eq(committeeMembers.id, member.id));
      assigned.push({ applicationId: app.id, assignmentId: Number(inserted[0].insertId), memberUserId: member.userId, renewed: lapsed.has(member.id) });
    }
    return assigned;
  });
}

/** Expire lapsed assignments and top up every awaiting application that lacks reviewers. Safe to run concurrently. */
export async function reassignExpiredReviews(actorUserId: number | null = null, scope: SweepScope = {}): Promise<{ expired: number; reassigned: number; renewed: number }> {
  const db = await getDb(); if (!db) return { expired: 0, reassigned: 0, renewed: 0 };
  const now = new Date();
  const [lapsedCount] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(reviewAssignments)
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .where(and(eq(reviewAssignments.status, "pending"), lte(reviewAssignments.expiresAt, now), scoped(scope.applicationIds)));
  // Applications whose active reviewer count is below the requirement, whatever the cause.
  const short = await db.select({ id: applications.id }).from(applications)
    .leftJoin(reviewAssignments, and(eq(reviewAssignments.applicationId, applications.id),
      or(inArray(reviewAssignments.status, ["approved", "rejected"]), and(eq(reviewAssignments.status, "pending"), gt(reviewAssignments.expiresAt, now)))))
    .where(and(awaitingDecision(), scoped(scope.applicationIds)))
    .groupBy(applications.id, applications.irbCategory, applications.submittedAt)
    .having(sql`COUNT(${reviewAssignments.id}) < CASE WHEN ${applications.irbCategory} = 'full_board' THEN 5 ELSE 1 END`)
    .orderBy(applications.submittedAt).limit(SWEEP_LIMIT);
  let reassigned = 0, renewed = 0;
  for (const { id } of short) {
    let assigned: Assigned[];
    try { assigned = await topUpApplication(id, now); }
    catch (error) { console.warn("[review-sla] Could not top up an application; will retry next sweep", safeLogError(error)); continue; }
    for (const row of assigned) {
      if (row.renewed) renewed++; else reassigned++;
      await notifyOnce({ userId: row.memberUserId, applicationId: row.applicationId, type: "review_assignment", since: now,
        title: "Review assignment (24-hour target) | تكليف مراجعة (الهدف 24 ساعة)",
        message: "An application awaiting human review is in your worklist. Please complete your review within 24 hours. يوجد طلب بانتظار المراجعة البشرية في قائمة أعمالك. يرجى إتمام المراجعة خلال 24 ساعة." }).catch(() => false);
      await enqueueAdministrativeEmail({ userId: row.memberUserId, eventId: `review-sla:assigned:${row.assignmentId}`, category: "transactional",
        subjectEn: "New ethics review assignment (24-hour target)", subjectAr: "تكليف جديد بمراجعة أخلاقيات (الهدف 24 ساعة)",
        bodyEn: "An application awaiting human review has been added to your authorized worklist. Please complete your review within 24 hours. Automated findings are advisory and the decision remains yours.",
        bodyAr: "أُضيف طلب بانتظار المراجعة البشرية إلى قائمة أعمالك المصرح بها. يرجى إتمام المراجعة خلال 24 ساعة. نتائج الفحص الآلي استشارية والقرار لك.",
      }).catch(() => null);
    }
  }
  // Retire any remaining lapsed rows (e.g. on decided applications). Top-ups never count lapsed rows, so this is order-independent.
  await db.update(reviewAssignments).set({ status: "expired" })
    .where(and(eq(reviewAssignments.status, "pending"), lte(reviewAssignments.expiresAt, now), scope.applicationIds?.length ? inArray(reviewAssignments.applicationId, scope.applicationIds) : undefined));
  const expired = Number(lapsedCount?.cnt ?? 0);
  if (expired || reassigned || renewed) {
    await db.insert(auditLog).values({ userId: actorUserId, action: "review_sla_reassign", details: `Retired ${expired} lapsed assignments; assigned ${reassigned} reviewers; renewed ${renewed}.` });
  }
  return { expired, reassigned, renewed };
}

/** Remind reviewers whose 24-hour assignment ends within six hours. */
async function remindDueSoon(now: Date, scope: SweepScope): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  const due = await db.select({ id: reviewAssignments.id, applicationId: reviewAssignments.applicationId, assignedAt: reviewAssignments.assignedAt, userId: committeeMembers.userId })
    .from(reviewAssignments)
    .innerJoin(committeeMembers, eq(committeeMembers.id, reviewAssignments.committeeMemberId))
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .where(and(eq(reviewAssignments.status, "pending"), gt(reviewAssignments.expiresAt, now), lte(reviewAssignments.expiresAt, new Date(now.getTime() + DUE_SOON_MS)),
      eq(committeeMembers.isActive, true), inArray(applications.status, [...AWAITING]), scoped(scope.applicationIds)))
    .orderBy(reviewAssignments.expiresAt).limit(SWEEP_LIMIT);
  let sent = 0;
  for (const row of due) {
    const created = await notifyOnce({ userId: row.userId, applicationId: row.applicationId, type: "review_reminder", since: row.assignedAt,
      title: "Review due soon | موعد المراجعة يقترب",
      message: "Your assigned review is due within six hours to keep the 24-hour service target. موعد المراجعة المكلّف بها خلال ست ساعات للحفاظ على هدف الإنجاز خلال 24 ساعة." });
    if (!created) continue;
    sent++;
    await enqueueAdministrativeEmail({ userId: row.userId, eventId: `review-sla:due-soon:${row.id}`, category: "transactional",
      subjectEn: "Reminder: assigned ethics review due soon", subjectAr: "تذكير: موعد مراجعة أخلاقيات مكلّف بها يقترب",
      bodyEn: "An application in your authorized worklist is due for review within six hours. Open the platform to review it; automated findings are advisory and the decision remains yours.",
      bodyAr: "يوجد طلب في قائمة أعمالك المصرح بها يستحق المراجعة خلال ست ساعات. افتح المنصة لمراجعته؛ نتائج الفحص الآلي استشارية والقرار لك.",
    }).catch(() => null);
  }
  return sent;
}

/** Escalate applications still awaiting a human decision 24 hours after (re)submission. */
async function escalateOverdue(now: Date, scope: SweepScope): Promise<number> {
  const db = await getDb(); if (!db) return 0;
  const cutoff = new Date(now.getTime() - REVIEW_TARGET_HOURS * 3600_000);
  // Newest overdue first: older ones were already alerted; the per-recipient notice is idempotent.
  const overdue = await db.select({ id: applications.id, applicantId: applications.applicantId, submittedAt: applications.submittedAt, submissionCount: applications.submissionCount }).from(applications)
    .where(and(awaitingDecision(), lte(applications.submittedAt, cutoff), scoped(scope.applicationIds)))
    .orderBy(desc(applications.submittedAt)).limit(SWEEP_LIMIT);
  let escalated = 0;
  for (const app of overdue) {
    const admins = await activeAdmins(app.applicantId);
    let any = false;
    for (const userId of admins) {
      const created = await notifyOnce({ userId, applicationId: app.id, type: "review_reminder", since: app.submittedAt ?? cutoff,
        title: "24-hour review target missed | تجاوز هدف المراجعة خلال 24 ساعة",
        message: "A submitted application has waited more than 24 hours for a human decision. Check reviewer availability or reassign. انتظر طلب مقدّم أكثر من 24 ساعة دون قرار بشري. تحقق من توفر المراجعين أو أعد التكليف." });
      if (!created) continue;
      any = true;
      await enqueueAdministrativeEmail({ userId, eventId: `review-sla:overdue:${app.id}:${app.submissionCount}`, category: "transactional",
        subjectEn: "Action needed: application past the 24-hour review target", subjectAr: "إجراء مطلوب: طلب تجاوز هدف المراجعة خلال 24 ساعة",
        bodyEn: "A submitted application has been waiting more than 24 hours for a human decision. Open the administration workspace to check reviewer availability, reassign or record the decision.",
        bodyAr: "طلب مقدّم ينتظر قراراً بشرياً منذ أكثر من 24 ساعة. افتح مساحة الإدارة للتحقق من توفر المراجعين أو إعادة التكليف أو تسجيل القرار.",
      }).catch(() => null);
    }
    if (any) escalated++;
  }
  return escalated;
}

export async function runReviewSlaSweep(now = new Date(), scope: SweepScope = {}) {
  const reassignment = await reassignExpiredReviews(null, scope);
  const reminders = await remindDueSoon(now, scope);
  const escalations = await escalateOverdue(now, scope);
  return { ...reassignment, reminders, escalations };
}

/** Screening found items needing human judgement: tell administrators once per submission version. */
export async function notifyScreeningEscalation(applicationId: number, applicationVersion: number, applicantId?: number): Promise<void> {
  const admins = await activeAdmins(applicantId);
  for (const userId of admins) {
    const created = await notifyOnce({ userId, applicationId, type: "review_assignment", since: new Date(0),
      title: `Screening flagged items for human attention (v${applicationVersion}) | عناصر تتطلب انتباهاً بشرياً`,
      message: "Automated screening of a new submission found items that need a reviewer's judgement. Open the application for the confidential screening summary. وجد الفحص الآلي عناصر تتطلب تقدير المراجع. افتح الطلب للاطلاع على ملخص الفحص السري." });
    if (!created) continue;
    await enqueueAdministrativeEmail({ userId, eventId: `submission:${applicationId}:version:${applicationVersion}:escalation:${userId}`, category: "transactional",
      subjectEn: "Screening escalation: application needs human attention", subjectAr: "تصعيد الفحص: طلب يحتاج انتباهاً بشرياً",
      bodyEn: "Automated screening of a submitted application found items that need a reviewer's judgement. Open the platform for the confidential screening summary and assignment status. Automated findings are advisory.",
      bodyAr: "وجد الفحص الآلي لطلب مقدّم عناصر تتطلب تقدير المراجع. افتح المنصة للاطلاع على ملخص الفحص السري وحالة التكليف. النتائج الآلية استشارية.",
    }).catch(() => null);
  }
}

/** Sweep every 30 minutes (first run two minutes after boot); a handful of indexed queries per run. */
export function startReviewSlaWorker(): () => Promise<void> {
  const poller = startAdaptivePoller({ minMs: 30 * 60_000, maxMs: 30 * 60_000, initialDelayMs: 2 * 60_000,
    run: async () => { await runReviewSlaSweep(); return false; },
    onError: error => console.warn("[review-sla] Sweep unavailable; will retry", safeLogError(error)),
  });
  return () => poller.stop();
}
