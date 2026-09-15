import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { applicationScreeningJobs, type ApplicationScreeningJob } from "../../drizzle/screeningSchema";
import { applications, applicationVersions, committeeMembers, reviewAssignments, notifications, users, type Application } from "../../drizzle/schema";
import { getDb } from "../db";
import { enqueueAdministrativeEmail, queueApplicationEmail } from "../emailService";
import { getColorFromScore, normalizeReviewJson, STAGE1_REVIEW_FIELDS, type AiReviewResult } from "../aiReview";
import { evaluateStageSnapshot, stageReviewFingerprint, stageReviewInput, STAGE_REVIEW_VERSION } from "./applicationStageReview";
import { STAGE1_FIELDS, STAGE2_FIELDS } from "./irb.validation";

const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 3;
const activeStatuses = ["under_review", "pending_admin"] as const;
const submittedSnapshotSchema = z.object(Object.fromEntries([
  ...STAGE1_FIELDS, ...STAGE2_FIELDS, "fundingSource", "estimatedDuration", "stage1AiFeedback", "stage2AiFeedback",
].map(field => [field, z.string().max(field.endsWith("Feedback") ? 250_000 : 20_000).nullish()])));

export function parseScreeningSnapshot(job: Pick<ApplicationScreeningJob, "snapshotJson" | "applicationId" | "applicantId">): Application {
  if (Buffer.byteLength(job.snapshotJson) > 1_000_000) throw new Error("invalid_snapshot");
  const fields = submittedSnapshotSchema.parse(JSON.parse(job.snapshotJson));
  // Identity and workflow properties inside JSON never override durable job bindings.
  return { ...fields, id: job.applicationId, applicantId: job.applicantId } as Application;
}

export function screeningOutcome(stage1: AiReviewResult, stage2: AiReviewResult) {
  return [stage1, stage2].every(result => result.status === "completed" && result.passed && result.score >= 70 && !result.hasRedFlags)
    ? "ready_for_human_decision" as const : "human_review_required" as const;
}

function unavailable(reason: string): AiReviewResult {
  return { status: "unavailable", score: null, passed: false, issues: [], hasRedFlags: false,
    unavailableReason: "provider_unavailable", retryable: false, feedback: reason, recommendations: [], fieldScores: [] };
}

async function claimJob(applicationId?: number): Promise<ApplicationScreeningJob | null> {
  const db = await getDb(); if (!db) throw new Error("screening_storage_unavailable");
  return db.transaction(async tx => {
    const [job] = await tx.select().from(applicationScreeningJobs)
      .where(and(inArray(applicationScreeningJobs.status, ["pending", "running"]), lte(applicationScreeningJobs.nextAttemptAt, new Date()), applicationId === undefined ? undefined : eq(applicationScreeningJobs.applicationId, applicationId)))
      .orderBy(applicationScreeningJobs.nextAttemptAt, applicationScreeningJobs.id).limit(1).for("update");
    if (!job) return null;
    if (job.attempts >= MAX_ATTEMPTS) {
      await tx.update(applicationScreeningJobs).set({ status: "escalated", leaseUntil: null, leaseToken: null, lastErrorCode: "screening_retry_exhausted", resultJson: JSON.stringify({ outcome: "human_review_required", reason: "Automated screening could not be completed. Human review is required." }) }).where(eq(applicationScreeningJobs.id, job.id));
      return null;
    }
    const leaseToken = randomUUID(); const leaseUntil = new Date(Date.now() + LEASE_MS);
    await tx.update(applicationScreeningJobs).set({ status: "running", attempts: job.attempts + 1, leaseToken, leaseUntil, nextAttemptAt: leaseUntil })
      .where(eq(applicationScreeningJobs.id, job.id));
    return { ...job, status: "running", attempts: job.attempts + 1, leaseToken, leaseUntil, nextAttemptAt: leaseUntil };
  });
}

async function activeContext(job: ApplicationScreeningJob) {
  const db = await getDb(); if (!db) throw new Error("screening_storage_unavailable");
  const [account] = await db.select({ loginMethod: users.loginMethod }).from(users).where(eq(users.id, job.applicantId));
  const [app] = await db.select({ applicantId: applications.applicantId, status: applications.status }).from(applications).where(eq(applications.id, job.applicationId));
  const [version] = await db.select({ version: applicationVersions.version }).from(applicationVersions).where(eq(applicationVersions.applicationId, job.applicationId)).orderBy(desc(applicationVersions.version)).limit(1);
  return Boolean(account && account.loginMethod !== "deleted" && app?.applicantId === job.applicantId && activeStatuses.includes(app.status as typeof activeStatuses[number]) && version?.version === job.applicationVersion);
}

/** Commit only while both account and immutable submission are still current. */
async function checkpoint(job: ApplicationScreeningJob, result: object, terminal?: "completed" | "escalated", lastErrorCode: string | null = null) {
  const db = await getDb(); if (!db) throw new Error("screening_storage_unavailable");
  return db.transaction(async tx => {
    // Same user→application order as erasure. A late result cannot recreate erased data.
    const [account] = await tx.select({ loginMethod: users.loginMethod }).from(users).where(eq(users.id, job.applicantId)).for("update");
    const [app] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, job.applicationId)).for("update");
    const [version] = await tx.select({ version: applicationVersions.version }).from(applicationVersions).where(eq(applicationVersions.applicationId, job.applicationId)).orderBy(desc(applicationVersions.version)).limit(1);
    if (!account || account.loginMethod === "deleted") {
      await tx.delete(applicationScreeningJobs).where(eq(applicationScreeningJobs.id, job.id)); return false;
    }
    if (!app || !activeStatuses.includes(app.status as typeof activeStatuses[number]) || version?.version !== job.applicationVersion) {
      await tx.update(applicationScreeningJobs).set({ status: "escalated", leaseToken: null, leaseUntil: null, lastErrorCode: "submission_superseded", resultJson: JSON.stringify({ outcome: "human_review_required", reason: "Submission changed; this screening result was not applied." }) }).where(and(eq(applicationScreeningJobs.id, job.id), eq(applicationScreeningJobs.leaseToken, job.leaseToken!)));
      return false;
    }
    const [current] = await tx.select().from(applicationScreeningJobs).where(eq(applicationScreeningJobs.id, job.id)).for("update");
    if (!current || current.status !== "running" || current.leaseToken !== job.leaseToken) return false;
    let inAppNotificationsQueued = false;
    try { inAppNotificationsQueued = JSON.parse(current.resultJson || "{}").inAppNotificationsQueued === true; } catch { /* no prior receipt */ }
    if (!inAppNotificationsQueued) {
      // Job receipt and notifications commit together under the application lock.
      // A retry or lease recovery cannot duplicate this submission's in-app notices.
      await tx.insert(notifications).values({ userId: job.applicantId, applicationId: job.applicationId, type: "application_submitted",
        title: "Application received | تم استلام الطلب",
        message: "Your submission is recorded. Automated screening supports the responsible human reviewers; it does not issue an ethics decision. تم تسجيل طلبك. يدعم الفحص الآلي المراجعين البشر المسؤولين ولا يصدر قراراً أخلاقياً." });
      const assigned = await tx.select({ userId: committeeMembers.userId }).from(reviewAssignments)
        .innerJoin(committeeMembers, eq(committeeMembers.id, reviewAssignments.committeeMemberId))
        .innerJoin(users, eq(users.id, committeeMembers.userId))
        .where(and(eq(reviewAssignments.applicationId, job.applicationId), eq(reviewAssignments.status, "pending"), gt(reviewAssignments.expiresAt, new Date()), eq(committeeMembers.isActive, true), sql`COALESCE(${users.loginMethod}, '') <> 'deleted'`)).limit(20);
      const recipients = assigned.length ? [...new Set(assigned.map(row => row.userId))] :
        (await tx.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), sql`COALESCE(${users.loginMethod}, '') <> 'deleted'`)).limit(10)).map(row => row.id);
      if (recipients.length) await tx.insert(notifications).values(recipients.map(userId => ({ userId, applicationId: job.applicationId, type: "review_assignment" as const,
        title: "Application awaiting review | طلب بانتظار المراجعة",
        message: "A submitted application requires attention in your authorized worklist. Automated findings are advisory. يوجد طلب مُقدّم يتطلب المتابعة في قائمة أعمالك المصرح بها. نتائج الفحص الآلي استشارية." })));
      inAppNotificationsQueued = true;
    }
    const [updated] = await tx.update(applicationScreeningJobs).set({ resultJson: JSON.stringify({ ...result, inAppNotificationsQueued }), lastErrorCode,
      ...(terminal ? { status: terminal, leaseToken: null, leaseUntil: null } : {}),
    }).where(and(eq(applicationScreeningJobs.id, job.id), eq(applicationScreeningJobs.status, "running"), eq(applicationScreeningJobs.leaseToken, job.leaseToken!)));
    return updated.affectedRows === 1;
  });
}

async function queueSubmissionNotices(job: ApplicationScreeningJob) {
  const eventId = `submission:${job.applicationId}:version:${job.applicationVersion}`;
  const acknowledgement = await queueApplicationEmail({ applicationId: job.applicationId, event: "submitted", eventId });
  const db = await getDb(); if (!db) throw new Error("screening_storage_unavailable");
  const assigned = await db.select({ userId: committeeMembers.userId }).from(reviewAssignments)
    .innerJoin(committeeMembers, eq(committeeMembers.id, reviewAssignments.committeeMemberId))
    .where(and(eq(reviewAssignments.applicationId, job.applicationId), eq(reviewAssignments.status, "pending"), gt(reviewAssignments.expiresAt, new Date()), eq(committeeMembers.isActive, true))).limit(20);
  const recipients = assigned.length ? [...new Set(assigned.map(row => row.userId))] :
    (await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), sql`COALESCE(${users.loginMethod}, '') <> 'deleted'`)).limit(10)).map(row => row.id);
  const assignments = [];
  for (const userId of recipients) {
    const queued = await enqueueAdministrativeEmail({ userId, eventId: `${eventId}:worklist:${userId}`, category: "transactional",
      subjectEn: "Research ethics application awaiting review", subjectAr: "طلب أخلاقيات بحث بانتظار المراجعة",
      bodyEn: "A submitted application requires attention in your authorized worklist. Open the platform for the current assignment, screening findings and required actions. Automated checks do not constitute an official ethics decision.",
      bodyAr: "يوجد طلب مُقدّم يتطلب المتابعة في قائمة أعمالك المصرح بها. افتح المنصة للاطلاع على التكليف الحالي ونتائج الفحص والإجراءات المطلوبة. الفحوص الآلية لا تُعد قراراً أخلاقياً رسمياً.",
    });
    assignments.push({ userId, status: queued.status, id: queued.id });
  }
  return { acknowledgement: { status: acknowledgement.status, id: acknowledgement.id }, assignments };
}

export async function runSubmissionScreeningBatch(options: { applicationId?: number } = {}): Promise<{ processed: number; outcome?: string }> {
  const job = await claimJob(options.applicationId); if (!job) return { processed: 0 };
  let progress: Record<string, unknown> = {};
  try {
    if (!await activeContext(job)) {
      await checkpoint(job, { outcome: "human_review_required" }, "escalated", "submission_superseded");
      return { processed: 1, outcome: "submission_superseded" };
    }
    let snapshot: Application;
    try { snapshot = parseScreeningSnapshot(job); }
    catch {
      await checkpoint(job, { outcome: "human_review_required", reason: "The submitted snapshot could not be validated. Human review is required." }, "escalated", "invalid_snapshot");
      return { processed: 1, outcome: "human_review_required" };
    }
    // Progress is written only by this worker; validate completed results again below
    // by constructing fresh cache envelopes through the shared review evaluator.
    if (job.resultJson) {
      try { const saved = JSON.parse(job.resultJson); if (saved && typeof saved === "object" && !Array.isArray(saved)) progress = saved; } catch { /* start a clean bounded attempt */ }
    }
    let notificationRetry = false;
    try { progress.notifications = await queueSubmissionNotices(job); }
    catch { notificationRetry = true; progress.notifications = { status: job.attempts < MAX_ATTEMPTS ? "retry_pending" : "unavailable" }; }
    if (!await checkpoint(job, progress)) return { processed: 1, outcome: "superseded" };
    const results: AiReviewResult[] = [];
    for (const stage of [1, 2] as const) {
      if (!await activeContext(job)) { await checkpoint(job, {}, "escalated", "submission_superseded"); return { processed: 1, outcome: "superseded" }; }
      const feedbackKey = stage === 1 ? "stage1AiFeedback" : "stage2AiFeedback";
      const resumed = progress[`stage${stage}`];
      if (resumed && typeof resumed === "object" && !Array.isArray(resumed)) {
        // The shared evaluator validates version, age, exact input fingerprint,
        // complete field schema and derived pass/red flags before cache reuse.
        snapshot[feedbackKey] = JSON.stringify(resumed);
      }
      let result: AiReviewResult;
      try {
        const previous = progress.outcome ? sanitizeScreeningStageResult(stage, resumed) : undefined;
        // A mail-only retry must not trigger fresh paid attempts for an already
        // escalated outage or incomplete submission. Completed cache reuse still
        // validates its exact immutable snapshot fingerprint in the evaluator.
        result = previous && previous.status !== "completed" ? previous : await evaluateStageSnapshot(stage, snapshot, job.applicantId);
      }
      catch { result = unavailable("Automated review could not run within the available service allowance. Human review is required."); }
      results.push(result); progress[`stage${stage}`] = { ...result,
        reviewVersion: STAGE_REVIEW_VERSION, inputFingerprint: stageReviewFingerprint(stage, stageReviewInput(stage, snapshot)),
      };
      if (!await checkpoint(job, progress)) return { processed: 1, outcome: "superseded" };
    }
    const outcome = screeningOutcome(results[0], results[1]);
    progress = { ...progress, outcome, completedAt: typeof progress.completedAt === "string" && Number.isFinite(Date.parse(progress.completedAt)) ? progress.completedAt : new Date().toISOString() };
    const retryMail = notificationRetry && job.attempts < MAX_ATTEMPTS;
    const written = await checkpoint(job, progress, retryMail ? undefined : outcome === "ready_for_human_decision" ? "completed" : "escalated", notificationRetry ? "notification_enqueue_unavailable" : null);
    if (written && retryMail) {
      const db = await getDb(); if (!db) throw new Error("screening_storage_unavailable");
      await db.update(applicationScreeningJobs).set({ status: "pending", leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + 30_000 * 2 ** (job.attempts - 1)) })
        .where(and(eq(applicationScreeningJobs.id, job.id), eq(applicationScreeningJobs.leaseToken, job.leaseToken!)));
    }
    return { processed: 1, outcome: written ? outcome : "superseded" };
  } catch {
    const db = await getDb(); if (!db) throw new Error("screening_storage_unavailable");
    const terminal = job.attempts >= MAX_ATTEMPTS;
    await db.update(applicationScreeningJobs).set({ status: terminal ? "escalated" : "pending", leaseToken: null, leaseUntil: null,
      nextAttemptAt: new Date(Date.now() + Math.min(10 * 60_000, 30_000 * 2 ** (job.attempts - 1))),
      lastErrorCode: "screening_processing_unavailable",
      ...(terminal ? { resultJson: JSON.stringify({ outcome: "human_review_required", reason: "Automated screening is unavailable; human review is required." }) } : {}),
    }).where(and(eq(applicationScreeningJobs.id, job.id), eq(applicationScreeningJobs.leaseToken, job.leaseToken!)));
    return { processed: 1, outcome: terminal ? "human_review_required" : "retry_scheduled" };
  }
}

function sanitizeScreeningStageResult(stage: 1 | 2, raw: unknown): AiReviewResult | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (value.status === "completed") {
    try {
      const { score, feedback, recommendations, hasRedFlags, fieldSuggestions } = value;
      const fieldScores = Array.isArray(value.fieldScores) ? value.fieldScores.map(field => {
        const { field: key, score, feedback, suggestion } = field; return { field: key, score, feedback, suggestion };
      }) : undefined;
      const validated = normalizeReviewJson({ score, feedback, recommendations, hasRedFlags, fieldSuggestions, fieldScores }, stage === 1 ? STAGE1_REVIEW_FIELDS : STAGE2_FIELDS);
      return { ...validated, fieldScores: validated.fieldScores.map(field => ({ ...field, color: getColorFromScore(field.score) })), status: "completed", issues: [], passed: validated.score >= 70 && !validated.hasRedFlags,
        cached: value.cached === true, ...(typeof value.reviewedAt === "string" && Number.isFinite(Date.parse(value.reviewedAt)) ? { reviewedAt: value.reviewedAt } : {}) };
    } catch { return unavailable("A validated automated assessment is unavailable. Human review is required."); }
  }
  if (value.status === "needs_information") {
    const fields: readonly string[] = stage === 1 ? STAGE1_FIELDS : STAGE2_FIELDS;
    const parsed = z.array(z.object({ field: z.string().refine(field => fields.includes(field)), reason: z.enum(["empty", "unresolved_placeholder"]) }).strict()).max(fields.length).safeParse(value.issues);
    return { status: "needs_information", score: null, passed: false, issues: parsed.success ? parsed.data : [], feedback: "Some submitted information needs clarification by the applicant or human reviewer.", recommendations: [], fieldScores: [], hasRedFlags: false };
  }
  return unavailable("Automated review is unavailable. Human review is required.");
}

/** Caller must authorize application access before calling this read helper. */
export async function getSubmissionScreeningStatus(applicationId: number) {
  const db = await getDb(); if (!db) return null;
  const [version] = await db.select({ version: applicationVersions.version }).from(applicationVersions).where(eq(applicationVersions.applicationId, applicationId)).orderBy(desc(applicationVersions.version)).limit(1);
  if (!version) return null;
  const [job] = await db.select().from(applicationScreeningJobs).where(and(eq(applicationScreeningJobs.applicationId, applicationId), eq(applicationScreeningJobs.applicationVersion, version.version))).limit(1);
  if (!job) return null;
  let saved: Record<string, unknown> = {};
  try { const parsed = JSON.parse(job.resultJson || "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed; } catch { /* pending or unavailable result */ }
  const stage1 = sanitizeScreeningStageResult(1, saved.stage1), stage2 = sanitizeScreeningStageResult(2, saved.stage2);
  const finished = saved.outcome === "ready_for_human_decision" || saved.outcome === "human_review_required";
  const outcome = finished ? stage1 && stage2 ? screeningOutcome(stage1, stage2) : "human_review_required" : undefined;

  return { status: outcome ? (outcome === "ready_for_human_decision" ? "completed" as const : "escalated" as const) : job.status,
    outcome, stage1, stage2,
    ...(typeof saved.completedAt === "string" && Number.isFinite(Date.parse(saved.completedAt)) ? { completedAt: saved.completedAt } : {}),
    ...(job.lastErrorCode ? { lastError: job.lastErrorCode === "notification_enqueue_unavailable" ? "Email notification could not be queued; the assessment remains available here." : "Automated processing could not be completed for this submission. Human review is required." } : {}),
  };
}

/** Single bounded job per tick; process crashes are recovered by the durable lease. */
export function startSubmissionScreeningWorker(): () => Promise<void> {
  let stopped = false; let running: Promise<unknown> | null = null;
  const tick = () => {
    if (stopped || running) return;
    running = runSubmissionScreeningBatch().catch(() => console.warn("[submission-screening] Processing unavailable; durable jobs retained"))
      .finally(() => { running = null; });
  };
  const interval = setInterval(tick, 5000); interval.unref(); tick();
  return async () => { stopped = true; clearInterval(interval); await running; };
}
