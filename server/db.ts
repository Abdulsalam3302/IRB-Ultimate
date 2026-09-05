import { safeLogError } from "./_core/safeLog";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { listMissingRequirements, STAGE1_FIELDS, STAGE2_FIELDS } from "./services/irb.validation";
import { and, eq, desc, sql, ne, count, avg, inArray, isNull, or, lte, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  applications, InsertApplication, Application,
  committeeMembers, InsertCommitteeMember, CommitteeMember,
  reviewAssignments, InsertReviewAssignment, ReviewAssignment,
  auditLog, InsertAuditLogEntry,
  researchAuthors, InsertResearchAuthor,
  supportTickets, InsertSupportTicket,
  fileUploads, InsertFileUpload,
  applicationVersions, InsertApplicationVersion,
  adverseEvents, InsertAdverseEvent,
  amendments, InsertAmendment,
  aiSwarmReviews, InsertAiSwarmReview,
  notifications,
  analyticsSessions, analyticsEvents, llmUsageDaily,
  chatApplicationMessages, InsertChatApplicationMessage,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { createMysqlPool } from "./_core/mysql";
import { boundedInt } from "./_core/limits";
import { lockStorageQuota, assertStorageAllowance, commitStorageReservation, queueAccountStorageErasure } from "./services/storageDeletion";
import { assertSupabaseIdentityActiveInTransaction, queueIdentityErasure } from "./services/storageDeletionIdentity";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof createMysqlPool> | null = null;

// Capture the owner openId ONCE at module load (SA-26). Subsequent edits
// to process.env or ENV.ownerOpenId won't change who gets auto-promoted —
// a filesystem-write attack against the running container's .env can no
// longer silently re-attribute admin on next login.
const BOOT_OWNER_OPEN_ID = ENV.ownerOpenId;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createMysqlPool(process.env.DATABASE_URL);
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", safeLogError(error));
      _db = null;
    }
  }
  return _db;
}

export async function closeDatabase(): Promise<void> {
  const pool = _pool;
  _pool = null;
  _db = null;
  if (pool) await pool.promise().end();
}

// ─── User helpers ───────────────────────────────────────────────────────────

// Never let a password hash leave the DB layer through a general-purpose read.
// Only getLocalUserByEmail (the login path) keeps it. Everything that can reach
// a client — ctx.user/auth.me, admin user lists, applicant lookups — flows
// through helpers that call this first.
function withoutPassword<T extends { passwordHash?: string | null }>(row: T): T {
  if (row && row.passwordHash !== undefined && row.passwordHash !== null) {
    row.passwordHash = null;
  }
  return row;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod", "identityIssuer"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (BOOT_OWNER_OPEN_ID && user.openId === BOOT_OWNER_OPEN_ID) {
      // SA-26: BOOT_OWNER_OPEN_ID is captured once at module init, so a
      // mid-run env mutation can't re-target who becomes admin.
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    if (user.openId.startsWith("sb:")) {
      await db.transaction(async tx => {
        await lockStorageQuota(tx);
        await assertSupabaseIdentityActiveInTransaction(tx, user.openId, user.identityIssuer);
        await tx.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
      });
    } else await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", safeLogError(error));
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? withoutPassword(result[0]!) : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? withoutPassword(result[0]!) : undefined;
}

// ─── Native email/password auth helpers ─────────────────────────────────────

/** Case-insensitive lookup of ANY user with this email (any login method). */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  return result.length > 0 ? withoutPassword(result[0]!) : undefined;
}

/**
 * Lookup a user who has a local password set (loginMethod-agnostic). Prefers
 * the row carrying a passwordHash so an OAuth row sharing the same address
 * never shadows the credentialed account.
 */
export async function getLocalUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${normalized}`, sql`${users.passwordHash} IS NOT NULL`))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** True if at least one admin account already exists. Used to gate the
 *  one-time owner bootstrap so admin can never be re-claimed by a later
 *  self-registration. */
export async function adminExists(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  return rows.length > 0;
}

/**
 * Create a new email/password user. Email is normalised to lowercase.
 *
 * Registration never grants administrator authority from a claimed email.
 * Returns the persisted row.
 */
export async function createLocalUser(input: {
  openId: string;
  name: string | null;
  email: string;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedEmail = input.email.trim().toLowerCase();
  // A claimed email address is not a verified identity. Provision the first
  // administrator through an authenticated operator or verified identity flow.
  const role = "user" as const;
  await db.insert(users).values({
    openId: input.openId,
    name: input.name,
    email: normalizedEmail,
    passwordHash: input.passwordHash,
    loginMethod: "password",
    role,
    lastSignedIn: new Date(),
  });
  return getUserByOpenId(input.openId);
}

/**
 * OWNER-ONLY maintenance: permanently remove development TEST accounts whose
 * email ends in @example.com, plus their applications and dependent rows.
 * Hard-scoped to @example.com — it can never touch a real account. Runs in a
 * transaction; child rows are removed before parents to satisfy FKs.
 */
export async function purgeExampleTestAccounts(): Promise<{ users: number; applications: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    const db = tx;
  const targets = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) like '%@example.com'`);
  if (targets.length === 0) return { users: 0, applications: 0 };
  // Defence in depth: refuse if anything slipped through the LIKE filter.
  if (!targets.every(u => (u.email ?? "").toLowerCase().endsWith("@example.com"))) {
    throw new Error("purgeExampleTestAccounts: non-test email in target set; aborting");
  }
  const userIds = targets.map(u => u.id);
  const apps = await db.select({ id: applications.id }).from(applications).where(inArray(applications.applicantId, userIds));
  const appIds = apps.map(a => a.id);

  if (appIds.length) {
    await db.delete(researchAuthors).where(inArray(researchAuthors.applicationId, appIds));
    await db.delete(reviewAssignments).where(inArray(reviewAssignments.applicationId, appIds));
    await db.delete(applicationVersions).where(inArray(applicationVersions.applicationId, appIds));
    await db.delete(adverseEvents).where(inArray(adverseEvents.applicationId, appIds));
    await db.delete(amendments).where(inArray(amendments.applicationId, appIds));
    await db.delete(aiSwarmReviews).where(inArray(aiSwarmReviews.applicationId, appIds));
    await db.delete(chatApplicationMessages).where(inArray(chatApplicationMessages.applicationId, appIds));
    await db.delete(fileUploads).where(inArray(fileUploads.applicationId, appIds));
    await db.delete(notifications).where(inArray(notifications.applicationId, appIds));
    await db.delete(auditLog).where(inArray(auditLog.applicationId, appIds));
    await db.delete(applications).where(inArray(applications.id, appIds));
  }
  await db.delete(committeeMembers).where(inArray(committeeMembers.userId, userIds));
  await db.delete(notifications).where(inArray(notifications.userId, userIds));
  await db.delete(auditLog).where(inArray(auditLog.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));

  return { users: userIds.length, applications: appIds.length };
  });
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return rows.map(withoutPassword);
}

// ─── PDPL self-service: data export + account erasure ──────────────────────

/**
 * Everything the platform stores about one user, for the PDPL/GDPR-style
 * "download my data" right. Password hashes are never included.
 */
export async function exportUserData(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [userRows, apps] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(applications).where(eq(applications.applicantId, userId)),
  ]);
  const user = userRows[0] ? withoutPassword({ ...userRows[0] }) : null;
  const appIds = apps.map(a => a.id);

  const [authors, versions, aes, ams, files, myNotifications, myAudit, myTickets, chatTurns] = await Promise.all([
    appIds.length ? db.select().from(researchAuthors).where(inArray(researchAuthors.applicationId, appIds)) : Promise.resolve([]),
    appIds.length ? db.select().from(applicationVersions).where(inArray(applicationVersions.applicationId, appIds)) : Promise.resolve([]),
    appIds.length ? db.select().from(adverseEvents).where(inArray(adverseEvents.applicationId, appIds)) : Promise.resolve([]),
    appIds.length ? db.select().from(amendments).where(inArray(amendments.applicationId, appIds)) : Promise.resolve([]),
    db.select().from(fileUploads).where(eq(fileUploads.userId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)),
    db.select().from(auditLog).where(eq(auditLog.userId, userId)),
    db.select().from(supportTickets).where(eq(supportTickets.userId, userId)),
    appIds.length ? db.select().from(chatApplicationMessages).where(inArray(chatApplicationMessages.applicationId, appIds)) : Promise.resolve([]),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    applications: apps,
    coInvestigators: authors,
    applicationVersions: versions,
    adverseEvents: aes,
    amendments: ams,
    fileUploads: files,
    notifications: myNotifications,
    auditTrail: myAudit,
    supportTickets: myTickets,
    chatApplicationMessages: chatTurns,
  };
}

/**
 * PDPL "right to erasure" — self-service account deletion.
 *
 * Policy:
 *  - Applications that were never submitted (draft / declaration / stage 1-2)
 *    are hard-deleted together with their child rows.
 *  - Applications that entered the review pipeline (submitted / approved /
 *    rejected / retracted) are REGULATORY RECORDS: NCBE-aligned governance
 *    requires the approval trail to survive, so those rows are retained.
 *  - The user row itself is irreversibly anonymised: name/email/ORCID wiped,
 *    password removed, and the openId rotated to a random tombstone so every
 *    outstanding session cookie stops resolving to an account (this is our
 *    session revocation for deleted users).
 *  - Committee membership and notifications are removed. The audit log is
 *    retained (tamper-evidence) but now points at an anonymised identity.
 */
export async function eraseUserAccount(userId: number): Promise<{
  deletedDraftApplications: number;
  retainedRegulatoryApplications: number;
  queuedStorageDeletions: number;
  blockedStorageDeletions: number;
  storageDeletionStatus: "pending" | "not_required";
  queuedIdentityDeletions: number;
  blockedIdentityDeletions: number;
  identityDeletionStatus: "pending" | "not_required";
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    const db = tx;
    await lockStorageQuota(tx);
    const [account] = await db.select().from(users).where(eq(users.id, userId)).for("update");
    if (!account || account.loginMethod === "deleted") throw new TRPCError({ code: "UNAUTHORIZED" });

  const apps = await db.select({ id: applications.id, status: applications.status, submittedAt: applications.submittedAt })
    .from(applications).where(eq(applications.applicantId, userId)).for("update");
  const NEVER_SUBMITTED = new Set([
    "draft", "declaration_pending",
    "stage1_pending", "stage1_failed",
    "stage2_pending", "stage2_failed",
  ]);
  const draftIds = apps.filter(a => !a.submittedAt && NEVER_SUBMITTED.has(a.status as string)).map(a => a.id);
  const retained = apps.length - draftIds.length;
  const ownFileScope = and(eq(fileUploads.userId, userId), or(isNull(fileUploads.applicationId), draftIds.length ? inArray(fileUploads.applicationId, draftIds) : undefined));
  const filesToErase = await db.select().from(fileUploads).where(ownFileScope).for("update");
  const storageErasure = await queueAccountStorageErasure(tx, userId, filesToErase);
  const identityErasure = await queueIdentityErasure(tx, account);
  await db.delete(fileUploads).where(ownFileScope);

  if (draftIds.length) {
    await db.delete(researchAuthors).where(inArray(researchAuthors.applicationId, draftIds));
    await db.delete(reviewAssignments).where(inArray(reviewAssignments.applicationId, draftIds));
    await db.delete(applicationVersions).where(inArray(applicationVersions.applicationId, draftIds));
    await db.delete(adverseEvents).where(inArray(adverseEvents.applicationId, draftIds));
    await db.delete(amendments).where(inArray(amendments.applicationId, draftIds));
    await db.delete(aiSwarmReviews).where(inArray(aiSwarmReviews.applicationId, draftIds));
    await db.delete(chatApplicationMessages).where(inArray(chatApplicationMessages.applicationId, draftIds));
    // Files uploaded by another identity are not within this erasure request.
    // Preserve their metadata and ownership when removing the draft container.
    await db.update(fileUploads).set({ applicationId: null }).where(inArray(fileUploads.applicationId, draftIds));
    await db.delete(notifications).where(inArray(notifications.applicationId, draftIds));
    await db.delete(auditLog).where(inArray(auditLog.applicationId, draftIds));
    await db.delete(applications).where(inArray(applications.id, draftIds));
  }

  await db.delete(committeeMembers).where(eq(committeeMembers.userId, userId));
  await db.delete(notifications).where(eq(notifications.userId, userId));

  const tombstone = `deleted:${userId}:${Date.now().toString(36)}`.slice(0, 64);
  await db.update(users).set({
    openId: tombstone,
    name: "Deleted account",
    email: null,
    loginMethod: "deleted",
    identityIssuer: null,
    passwordHash: null,
    role: "user",
    orcidId: null,
    orcidVerified: false,
  }).where(eq(users.id, userId));

  return { deletedDraftApplications: draftIds.length, retainedRegulatoryApplications: retained, ...storageErasure, ...identityErasure, storageDeletionStatus: storageErasure.queuedStorageDeletions + storageErasure.blockedStorageDeletions > 0 ? "pending" as const : "not_required" as const };
  });
}

// ─── Application helpers ────────────────────────────────────────────────────

export async function createApplication(data: InsertApplication) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id, data.applicantId)).for("update");
    if (!account || account.loginMethod === "deleted") throw new TRPCError({ code: "UNAUTHORIZED" });
    const [drafts] = await tx.select({ count: count() }).from(applications).where(and(eq(applications.applicantId, data.applicantId), inArray(applications.status, ["draft", "declaration_pending", "stage1_pending", "stage1_failed", "stage2_pending", "stage2_failed"])));
    if (drafts.count >= boundedInt(process.env.MAX_OPEN_DRAFTS_PER_USER, 25, 1, 1000)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Open application limit reached. Complete an existing application first." });
    const result = await tx.insert(applications).values(data);
    return result[0].insertId;
  });
}

export async function getApplicationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getApplicationByIrbNumber(irbNumber: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(applications).where(eq(applications.irbNumber, irbNumber)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getApplicationsByApplicant(applicantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(applications).where(eq(applications.applicantId, applicantId)).orderBy(desc(applications.createdAt));
}

export async function getAllApplications() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(applications).orderBy(desc(applications.createdAt));
}

/** Cheap status query — used by the auto-reassign hook so we don't
 *  pull every application row to find the queued ones. */
export async function getApplicationsByStatus(status: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(applications)
    .where(eq(applications.status, status as any))
    .orderBy(desc(applications.createdAt));
}

export async function updateApplication(id: number, data: Partial<InsertApplication>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(applications).set(data).where(eq(applications.id, id));
}

export async function transitionApplicationStatus(id: number, expected: Application["status"][], data: Partial<InsertApplication>) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const result = await dbi.update(applications).set(data).where(and(eq(applications.id, id), inArray(applications.status, expected)));
  return result[0].affectedRows === 1;
}

/** Attach only to the exact decision whose PDF was generated. */
export async function attachDecisionCertificate(expected: Application, certificateUrl: string) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const result = await dbi.update(applications).set({ certificateUrl }).where(and(
    eq(applications.id, expected.id), eq(applications.status, expected.status),
    eq(applications.submissionCount, expected.submissionCount),
    expected.humanDecisionAt ? eq(applications.humanDecisionAt, expected.humanDecisionAt) : sql`FALSE`,
    expected.irbNumber ? eq(applications.irbNumber, expected.irbNumber) : isNull(applications.irbNumber),
  ));
  return result[0].affectedRows === 1;
}

const EDITABLE_STATUSES = new Set([
  "draft", "declaration_pending", "stage1_pending", "stage1_failed",
  "stage2_pending", "stage2_failed", "resubmission_required",
]);
const GATEWAY_FIELDS = [...STAGE1_FIELDS, "fundingSource", "estimatedDuration", "questionnaireFileUrl", "retrospectiveDataSource", "clinicalTrialDetails", "supplementaryFilesJson", "labHeadApproval", "labHeadName", "labHeadEmail", "labHeadPhone"] as const;

/** Serialize edits with submission/decision and reject stale AI results. */
export async function updateEditableApplication(
  id: number, userId: number, data: Partial<InsertApplication>, expected?: Application,
) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  return dbi.transaction(async tx => {
    const [account] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!account || account.loginMethod === "deleted") throw new TRPCError({ code: "UNAUTHORIZED" });
    const [current] = await tx.select().from(applications).where(eq(applications.id, id)).for("update");
    if (!current) throw new TRPCError({ code: "NOT_FOUND" });
    if (current.applicantId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
    if (!EDITABLE_STATUSES.has(current.status)) throw new TRPCError({ code: "CONFLICT", message: "Application is no longer editable. Refresh to view its current status." });
    if (expected && Object.keys(expected).some(k => JSON.stringify(current[k as keyof Application]) !== JSON.stringify(expected[k as keyof Application]))) {
      throw new TRPCError({ code: "CONFLICT", message: "Application changed during this request. Refresh and try again." });
    }
    const changes = { ...data };
    const changed = (field: keyof Application) => data[field] !== undefined && data[field] !== current[field];
    const gatewayChanged = GATEWAY_FIELDS.some(changed);
    const protocolChanged = STAGE2_FIELDS.some(changed) || changed("rejectionFileUrl");
    if (gatewayChanged) Object.assign(changes, {
      stage1Passed: false, stage1AiScore: null, stage1AiFeedback: null,
      proceedDespiteStage1: false, proceedDespiteStage1Reason: null,
      status: "stage1_pending",
    });
    if (gatewayChanged || protocolChanged) Object.assign(changes, {
      stage2Passed: false, stage2AiScore: null, stage2AiFeedback: null, stage2AiFieldScores: null,
      proceedDespiteStage2: false, proceedDespiteStage2Reason: null,
      ...(!gatewayChanged ? { status: "stage2_pending" } : {}),
    });
    await tx.update(applications).set(changes).where(eq(applications.id, id));
    const [updated] = await tx.select().from(applications).where(eq(applications.id, id));
    return updated;
  });
}

/** One durable submission claim, assignments, counters, audit and snapshot. */
export async function submitApplicationForReview(applicationId: number, applicantId: number) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  return dbi.transaction(async tx => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId)).for("update");
    if (!app) throw new TRPCError({ code: "NOT_FOUND" });
    if (app.applicantId !== applicantId) throw new TRPCError({ code: "FORBIDDEN" });
    if (app.status !== "submitted") throw new TRPCError({ code: "CONFLICT", message: "Application is not ready or has already been submitted." });
    const missing = listMissingRequirements(app);
    if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Complete the application before submission: ${missing.join(", ")}` });
    const rows = await tx.select({ member: committeeMembers }).from(committeeMembers)
      .innerJoin(users, eq(users.id, committeeMembers.userId))
      .where(and(eq(committeeMembers.isActive, true), sql`${committeeMembers.appointedAt} IS NOT NULL`, sql`CHAR_LENGTH(TRIM(COALESCE(${committeeMembers.qualificationReference}, ''))) >= 10`, ne(committeeMembers.userId, applicantId), sql`COALESCE(${users.loginMethod}, '') NOT IN ('digital_reviewer', 'deleted')`, sql`${users.openId} NOT LIKE 'digital-reviewer:%'`))
      .orderBy(committeeMembers.totalAssignments, committeeMembers.id);
    const selected = Array.from(new Map(rows.map(r => [r.member.userId, r.member])).values()).slice(0, 5);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    // Previous-round votes must never count towards a revised protocol.
    await tx.update(reviewAssignments).set({ status: "expired" }).where(eq(reviewAssignments.applicationId, applicationId));
    for (const member of selected) {
      await tx.insert(reviewAssignments).values({ applicationId, committeeMemberId: member.id, assignedBy: "system", status: "pending", expiresAt });
      await tx.update(committeeMembers).set({ totalAssignments: sql`${committeeMembers.totalAssignments} + 1` }).where(eq(committeeMembers.id, member.id));
    }
    const nextStatus = selected.length >= 5 ? "under_review" : "pending_admin";
    await tx.update(applications).set({ status: nextStatus, submittedAt: now, ...(app.submittedAt ? { submissionCount: sql`${applications.submissionCount} + 1` } : {}) }).where(eq(applications.id, applicationId));
    const [version] = await tx.select({ max: sql<number>`COALESCE(MAX(${applicationVersions.version}), 0)` }).from(applicationVersions).where(eq(applicationVersions.applicationId, applicationId));
    const snapshot = Object.fromEntries([...GATEWAY_FIELDS, ...STAGE2_FIELDS].map(k => [k, app[k]]));
    await tx.insert(applicationVersions).values({ applicationId, version: Number(version.max) + 1, snapshot: JSON.stringify(snapshot), status: nextStatus, stage1AiScore: app.stage1AiScore, stage2AiScore: app.stage2AiScore });
    await tx.insert(auditLog).values({ applicationId, userId: applicantId, action: "application_submitted", details: `Assigned to ${selected.length} human committee members; qualified human decision required.` });
    return { app, selected, nextStatus, activeMemberCount: rows.length };
  });
}

/** Final decisions require an explicitly appointed independent human signer. */
export async function finalizeApplicationDecision(input: {
  applicationId: number; actorUserId: number; decision: "approved" | "rejected"; notes?: string; direct?: boolean;
}) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  return dbi.transaction(async tx => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, input.applicationId)).for("update");
    if (!app) throw new TRPCError({ code: "NOT_FOUND" });
    const [actor] = await tx.select({ user: users, member: committeeMembers }).from(users)
      .innerJoin(committeeMembers, eq(committeeMembers.userId, users.id))
      .where(and(eq(users.id, input.actorUserId), eq(committeeMembers.isActive, true), sql`${committeeMembers.appointedAt} IS NOT NULL`, sql`CHAR_LENGTH(TRIM(COALESCE(${committeeMembers.qualificationReference}, ''))) >= 10`)).limit(1);
    if (!actor || actor.user.role !== "admin" || actor.user.loginMethod === "digital_reviewer" || actor.user.openId.startsWith("digital-reviewer:") || actor.user.id === app.applicantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "An independent, appointed human committee administrator must record the decision." });
    }
    if (!["under_review", "pending_admin"].includes(app.status) || !app.submittedAt) throw new TRPCError({ code: "CONFLICT", message: "A decision can only be made on a submitted application awaiting human review." });
    if (input.decision === "approved") {
      if (process.env.IRB_ISSUANCE_ENABLED !== "true") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Certificate issuance is disabled pending institutional authority and qualified committee activation." });
      const missing = listMissingRequirements(app);
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Application requirements remain incomplete: ${missing.join(", ")}` });
      const votes = await tx.select({ userId: users.id, status: reviewAssignments.status }).from(reviewAssignments)
        .innerJoin(committeeMembers, eq(committeeMembers.id, reviewAssignments.committeeMemberId))
        .innerJoin(users, eq(users.id, committeeMembers.userId))
        .where(and(eq(reviewAssignments.applicationId, app.id), eq(committeeMembers.isActive, true), sql`${committeeMembers.appointedAt} IS NOT NULL`, sql`CHAR_LENGTH(TRIM(COALESCE(${committeeMembers.qualificationReference}, ''))) >= 10`, ne(users.id, app.applicantId), sql`COALESCE(${users.loginMethod}, '') NOT IN ('digital_reviewer', 'deleted')`, sql`${users.openId} NOT LIKE 'digital-reviewer:%'`));
      const approvals = new Set(votes.filter(v => v.status === "approved").map(v => v.userId)).size;
      const required = app.irbCategory === "full_board" ? 3 : 1;
      if (approvals < required || votes.some(v => v.status === "rejected")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `At least ${required} independent human approval(s) and resolution of committee rejections are required.` });
    }
    const status = input.decision === "approved" ? "approved" : app.submissionCount >= 2 ? "permanently_rejected" : "rejected";
    const irbNumber = input.decision === "approved" ? `IRB-SA-${new Date().getUTCFullYear()}-${randomBytes(10).toString("hex").toUpperCase()}` : null;
    await tx.update(applications).set({ status, irbNumber, humanDecisionAt: new Date(), humanDecisionByUserId: input.actorUserId, adminNotes: input.notes || null, approvedAt: input.decision === "approved" ? new Date() : null, rejectionReason: input.decision === "rejected" ? input.notes || "Application rejected by the human committee" : null, certificateUrl: null }).where(eq(applications.id, app.id));
    await tx.update(reviewAssignments).set({ status: "expired" }).where(and(eq(reviewAssignments.applicationId, app.id), eq(reviewAssignments.status, "pending")));
    await tx.insert(auditLog).values({ applicationId: app.id, userId: input.actorUserId, action: input.decision === "approved" ? input.direct ? "admin_direct_approval" : "admin_approved" : "admin_rejected", details: `Human committee decision. ${input.notes || ""}${irbNumber ? ` IRB Number: ${irbNumber}` : ""}` });
    const [updated] = await tx.select().from(applications).where(eq(applications.id, app.id));
    return updated;
  });
}

/**
 * SA-08: atomic resubmit. Updates application status + submittedAt and
 * (when isResubmission) increments submissionCount in a single SQL
 * statement, so two concurrent submit calls can't both read 1 and both
 * write 2. Drizzle's `sql` template forwards the column-level
 * `submission_count = submission_count + 1` expression to MySQL.
 */
export async function applyResubmission(
  id: number,
  data: Partial<InsertApplication>,
  isResubmission: boolean,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = { ...data };
  if (isResubmission) {
    set.submissionCount = sql`${applications.submissionCount} + 1`;
  }
  await db.update(applications).set(set as any).where(eq(applications.id, id));
}

export async function generateIrbNumber(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Counts are not a sequence: deletes and concurrent decisions can collide.
  return `IRB-SA-${new Date().getUTCFullYear()}-${randomBytes(10).toString("hex").toUpperCase()}`;
}

export async function getApplicationStats() {
  const database = await getDb();
  if (!database) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Statistics are temporarily unavailable." });
  const [row] = await database.select({
    total: count(),
    approved: sql<number>`COALESCE(SUM(${applications.status} = 'approved' AND ${applications.humanDecisionAt} IS NOT NULL), 0)`,
    rejected: sql<number>`COALESCE(SUM(${applications.status} IN ('rejected', 'permanently_rejected')), 0)`,
    pending: sql<number>`COALESCE(SUM(${applications.status} NOT IN ('approved', 'rejected', 'permanently_rejected', 'draft', 'retracted', 'hidden')), 0)`,
    retracted: sql<number>`COALESCE(SUM(${applications.status} = 'retracted'), 0)`,
    submissions: sql<number>`COALESCE(SUM(${applications.submittedAt} IS NOT NULL), 0)`,
    chatbot: sql<number>`COALESCE(SUM(${applications.intakeChannel} = 'chatbot'), 0)`,
    traditional: sql<number>`COALESCE(SUM(${applications.intakeChannel} = 'traditional'), 0)`,
    avgProcessingDays: sql<number | null>`AVG(CASE WHEN ${applications.status} = 'approved' AND ${applications.humanDecisionAt} IS NOT NULL AND ${applications.submittedAt} IS NOT NULL THEN TIMESTAMPDIFF(SECOND, ${applications.submittedAt}, ${applications.approvedAt}) / 86400.0 ELSE NULL END)`,
  }).from(applications);
  return {
    total: Number(row.total), approved: Number(row.approved), rejected: Number(row.rejected), pending: Number(row.pending),
    retracted: Number(row.retracted), submissions: Number(row.submissions), chatbot: Number(row.chatbot), traditional: Number(row.traditional),
    avgProcessingDays: row.avgProcessingDays == null ? null : Number(row.avgProcessingDays),
  };
}

// ─── Research Authors helpers ───────────────────────────────────────────────

export async function addResearchAuthor(data: InsertResearchAuthor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, data.applicationId)).for("update");
    if (!app || !EDITABLE_STATUSES.has(app.status)) throw new TRPCError({ code: "CONFLICT", message: "Application is no longer editable." });
    const [total] = await tx.select({ count: count() }).from(researchAuthors).where(eq(researchAuthors.applicationId, data.applicationId));
    if (total.count >= 25) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum number of co-investigators reached." });
    const result = await tx.insert(researchAuthors).values(data);
    return result[0].insertId;
  });
}

export async function getAuthorsByApplication(applicationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(researchAuthors).where(eq(researchAuthors.applicationId, applicationId)).orderBy(researchAuthors.id);
}

export async function removeAuthor(id: number, applicationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Scope the delete to the owning application so a caller authorised on
  // application A cannot delete an author row belonging to application B
  // by passing a foreign author id (cross-tenant IDOR).
  await db.transaction(async tx => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId)).for("update");
    if (!app || !EDITABLE_STATUSES.has(app.status)) throw new TRPCError({ code: "CONFLICT", message: "Application is no longer editable." });
    await tx.delete(researchAuthors).where(and(eq(researchAuthors.id, id), eq(researchAuthors.applicationId, applicationId)));
  });
}

export async function removeAllAuthorsByApplication(applicationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(researchAuthors).where(eq(researchAuthors.applicationId, applicationId));
}

// ─── Support Ticket helpers ─────────────────────────────────────────────────

export async function createSupportTicket(data: InsertSupportTicket) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(supportTickets).values(data);
  return result[0].insertId;
}

export async function getAllSupportTickets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
}

export async function updateSupportTicket(id: number, data: Partial<InsertSupportTicket>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(supportTickets).set(data).where(eq(supportTickets.id, id));
}

// ─── Committee Member helpers ───────────────────────────────────────────────

export async function addCommitteeMember(data: InsertCommitteeMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(committeeMembers).values(data);
  return result[0].insertId;
}

export async function getCommitteeMemberByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(committeeMembers).where(eq(committeeMembers.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllCommitteeMembers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(committeeMembers).orderBy(desc(committeeMembers.createdAt));
}

export async function getActiveCommitteeMembers() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ member: committeeMembers }).from(committeeMembers)
    .innerJoin(users, eq(users.id, committeeMembers.userId))
    .where(and(eq(committeeMembers.isActive, true), sql`${committeeMembers.appointedAt} IS NOT NULL`, sql`CHAR_LENGTH(TRIM(COALESCE(${committeeMembers.qualificationReference}, ''))) >= 10`, sql`COALESCE(${users.loginMethod}, '') NOT IN ('digital_reviewer', 'deleted')`, sql`${users.openId} NOT LIKE 'digital-reviewer:%'`));
  return rows.map(r => r.member);
}

export async function updateCommitteeMember(id: number, data: Partial<InsertCommitteeMember>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(committeeMembers).set(data).where(eq(committeeMembers.id, id));
}

export async function removeCommitteeMember(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(committeeMembers).set({ isActive: false }).where(eq(committeeMembers.id, id));
}

// ─── Review Assignment helpers ──────────────────────────────────────────────

export async function createReviewAssignment(data: InsertReviewAssignment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reviewAssignments).values(data);
  return result[0].insertId;
}

/** Lock the parent before assigning to serialize assignments with final decisions. */
export async function assignHumanReviewer(applicationId: number, committeeMemberId: number) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  return dbi.transaction(async tx => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId)).for("update");
    if (!app) throw new TRPCError({ code: "NOT_FOUND" });
    if (!["under_review", "pending_admin"].includes(app.status)) throw new TRPCError({ code: "CONFLICT", message: "Application is not awaiting committee review." });
    const [record] = await tx.select({ member: committeeMembers, user: users }).from(committeeMembers).innerJoin(users, eq(users.id, committeeMembers.userId)).where(eq(committeeMembers.id, committeeMemberId));
    if (!record || !record.member.isActive || !record.member.appointedAt || !record.member.qualificationReference || record.user.loginMethod === "digital_reviewer" || record.user.openId.startsWith("digital-reviewer:") || record.user.id === app.applicantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an independently appointed human reviewer." });
    const existing = await tx.select().from(reviewAssignments).where(and(eq(reviewAssignments.applicationId, applicationId), eq(reviewAssignments.committeeMemberId, committeeMemberId), ne(reviewAssignments.status, "expired")));
    if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Reviewer already assigned to this submission." });
    const inserted = await tx.insert(reviewAssignments).values({ applicationId, committeeMemberId, assignedBy: "admin", status: "pending", expiresAt: new Date(Date.now() + 86_400_000) });
    await tx.update(committeeMembers).set({ totalAssignments: sql`${committeeMembers.totalAssignments} + 1` }).where(eq(committeeMembers.id, committeeMemberId));
    return inserted[0].insertId;
  });
}

/** A single vote and its counters are committed together, exactly once. */
export async function recordHumanReview(input: { reviewId: number; userId: number; decision: "approved" | "rejected"; comments?: string }) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const [lookup] = await dbi.select().from(reviewAssignments).where(eq(reviewAssignments.id, input.reviewId));
  if (!lookup) throw new TRPCError({ code: "NOT_FOUND" });
  return dbi.transaction(async tx => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, lookup.applicationId)).for("update");
    if (!app || !["under_review", "pending_admin"].includes(app.status)) throw new TRPCError({ code: "CONFLICT", message: "Application is no longer accepting committee votes." });
    const [review] = await tx.select().from(reviewAssignments).where(eq(reviewAssignments.id, input.reviewId)).for("update");
    const [record] = await tx.select({ member: committeeMembers, user: users }).from(committeeMembers).innerJoin(users, eq(users.id, committeeMembers.userId)).where(eq(committeeMembers.id, review.committeeMemberId));
    if (!record || record.user.id !== input.userId || !record.member.isActive || !record.member.appointedAt || !record.member.qualificationReference || record.user.loginMethod === "digital_reviewer" || record.user.openId.startsWith("digital-reviewer:") || record.user.id === app.applicantId) throw new TRPCError({ code: "FORBIDDEN", message: "Only the independent appointed human reviewer may vote." });
    const now = new Date();
    if (review.status !== "pending" || review.expiresAt.getTime() <= now.getTime()) throw new TRPCError({ code: "CONFLICT", message: "Review is already completed or expired." });
    await tx.update(reviewAssignments).set({ status: input.decision, comments: input.comments || null, respondedAt: now }).where(eq(reviewAssignments.id, input.reviewId));
    const responseMs = Math.max(0, Math.min(2_147_483_647, now.getTime() - review.assignedAt.getTime()));
    await tx.update(committeeMembers).set({
      averageResponseTimeMs: sql`ROUND((COALESCE(${committeeMembers.averageResponseTimeMs}, 0) * ${committeeMembers.totalResponses} + ${responseMs}) / (${committeeMembers.totalResponses} + 1))`,
      totalResponses: sql`${committeeMembers.totalResponses} + 1`,
      ...(input.decision === "approved" ? { totalApprovals: sql`${committeeMembers.totalApprovals} + 1` } : { totalRejections: sql`${committeeMembers.totalRejections} + 1` }),
    }).where(eq(committeeMembers.id, record.member.id));
    const votes = await tx.select({ status: reviewAssignments.status, userId: users.id }).from(reviewAssignments)
      .innerJoin(committeeMembers, eq(committeeMembers.id, reviewAssignments.committeeMemberId)).innerJoin(users, eq(users.id, committeeMembers.userId))
      .where(and(eq(reviewAssignments.applicationId, app.id), eq(committeeMembers.isActive, true), sql`${committeeMembers.appointedAt} IS NOT NULL`, ne(users.id, app.applicantId), sql`COALESCE(${users.loginMethod}, '') NOT IN ('digital_reviewer', 'deleted')`, sql`${users.openId} NOT LIKE 'digital-reviewer:%'`));
    const approvals = new Set(votes.filter(v => v.status === "approved").map(v => v.userId)).size;
    const rejections = new Set(votes.filter(v => v.status === "rejected").map(v => v.userId)).size;
    // Escalate consensus either way to the human decision authority. A vote
    // recorded after another transaction's final decision cannot reopen it.
    if (approvals >= 3 || rejections >= 3) await tx.update(applications).set({ status: "pending_admin" }).where(eq(applications.id, app.id));
    await tx.insert(auditLog).values({ applicationId: app.id, userId: input.userId, action: `review_${input.decision}`, details: input.comments || `Human committee reviewer ${input.decision} the application.` });
    return { success: true, approvals, rejections, applicationId: app.id, applicantId: app.applicantId };
  });
}

export async function getReviewsByApplication(applicationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reviewAssignments).where(eq(reviewAssignments.applicationId, applicationId)).orderBy(desc(reviewAssignments.assignedAt));
}

export async function getReviewsByCommitteeMember(committeeMemberId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reviewAssignments).where(eq(reviewAssignments.committeeMemberId, committeeMemberId)).orderBy(desc(reviewAssignments.assignedAt));
}

export async function getPendingReviewsByMember(committeeMemberId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reviewAssignments).where(
    and(
      eq(reviewAssignments.committeeMemberId, committeeMemberId),
      eq(reviewAssignments.status, "pending")
    )
  ).orderBy(desc(reviewAssignments.assignedAt));
}

export async function updateReviewAssignment(id: number, data: Partial<InsertReviewAssignment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reviewAssignments).set(data).where(eq(reviewAssignments.id, id));
}

export async function getReviewAssignmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reviewAssignments).where(eq(reviewAssignments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function expireOldReviews() {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.update(reviewAssignments)
    .set({ status: "expired" })
    .where(and(eq(reviewAssignments.status, "pending"), lte(reviewAssignments.expiresAt, now)));
}

export async function countApprovalsByApplication(applicationId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ cnt: count() }).from(reviewAssignments)
    .where(and(eq(reviewAssignments.applicationId, applicationId), eq(reviewAssignments.status, "approved")));
  return result[0]?.cnt ?? 0;
}

export async function countRejectionsByApplication(applicationId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ cnt: count() }).from(reviewAssignments)
    .where(and(eq(reviewAssignments.applicationId, applicationId), eq(reviewAssignments.status, "rejected")));
  return result[0]?.cnt ?? 0;
}

// ─── Audit Log helpers ──────────────────────────────────────────────────────

export async function addAuditLog(data: InsertAuditLogEntry) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values(data);
}

export async function getAuditLogByApplication(applicationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).where(eq(auditLog.applicationId, applicationId)).orderBy(desc(auditLog.createdAt));
}

export async function getFullAuditLog() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(500);
}

// ─── File Upload helpers ───────────────────────────────────────────────────

export async function addFileUpload(data: InsertFileUpload, cleanupReservationId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    await lockStorageQuota(tx);
    const [user] = await tx.select().from(users).where(eq(users.id, data.userId)).for("update");
    if (!user || user.loginMethod === "deleted") throw new TRPCError({ code: "UNAUTHORIZED" });
    if (cleanupReservationId !== undefined) await commitStorageReservation(tx, cleanupReservationId, data);
    await assertStorageAllowance(tx, data.userId, data.fileSize || 0);
    if (data.applicationId) {
      const [app] = await tx.select().from(applications).where(eq(applications.id, data.applicationId)).for("update");
      if (!app || !EDITABLE_STATUSES.has(app.status) || (app.applicantId !== data.userId && user.role !== "admin")) throw new TRPCError({ code: "CONFLICT", message: "Application is no longer accepting uploads." });
    }
    const result = await tx.insert(fileUploads).values(data);
    const id = result[0].insertId;
    await tx.update(fileUploads).set({ fileUrl: `/api/irb/files/${id}` }).where(eq(fileUploads.id, id));
    return id;
  });
}

export async function getFileUploadById(id: number) {
  const dbi = await getDb();
  if (!dbi) return null;
  const [row] = await dbi.select().from(fileUploads).where(eq(fileUploads.id, id)).limit(1);
  return row ?? null;
}

export async function getFileUploadByUrl(fileUrl: string) {
  const dbi = await getDb();
  if (!dbi) return null;
  const [row] = await dbi.select().from(fileUploads).where(eq(fileUploads.fileUrl, fileUrl)).limit(1);
  return row ?? null;
}

export async function bindOwnedUpload(id: number, userId: number, applicationId: number) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const result = await dbi.update(fileUploads).set({ applicationId }).where(and(eq(fileUploads.id, id), eq(fileUploads.userId, userId), or(isNull(fileUploads.applicationId), eq(fileUploads.applicationId, applicationId))));
  return result[0].affectedRows === 1;
}

export async function getUserUploadUsage(userId: number) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const [row] = await dbi.select({ bytes: sql<number>`COALESCE(SUM(${fileUploads.fileSize}), 0)`, count: count() }).from(fileUploads).where(eq(fileUploads.userId, userId));
  return { bytes: Number(row.bytes), count: Number(row.count) };
}

export async function getFilesByApplication(applicationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fileUploads).where(eq(fileUploads.applicationId, applicationId)).orderBy(desc(fileUploads.createdAt));
}

export async function getFileUploadByKey(fileKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(fileUploads).where(eq(fileUploads.fileKey, fileKey)).limit(1);
  return rows[0] ?? null;
}

// ─── Expire and reassign reviews ──────────────────────────────────────────

export async function expireAndGetExpiredReviews() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  // Find pending reviews that have expired
  const expired = await db.select().from(reviewAssignments).where(
    and(eq(reviewAssignments.status, "pending"), lte(reviewAssignments.expiresAt, now))
  );
  // Mark them as expired
  if (expired.length > 0) {
    await db.update(reviewAssignments)
      .set({ status: "expired" })
      .where(and(eq(reviewAssignments.status, "pending"), lte(reviewAssignments.expiresAt, now)));
  }
  return expired;
}

// ─── Analytics helpers ────────────────────────────────────────────────────

export async function getMonthlyAnalytics(months: number = 12) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT 
      DATE_FORMAT(createdAt, '%Y-%m') as month,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status IN ('rejected', 'permanently_rejected') THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status IN ('under_review', 'pending_admin', 'submitted') THEN 1 ELSE 0 END) as pending,
      AVG(CASE WHEN approvedAt IS NOT NULL AND submittedAt IS NOT NULL 
        THEN TIMESTAMPDIFF(HOUR, submittedAt, approvedAt) ELSE NULL END) as avgReviewHours
    FROM applications
    WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${months} MONTH)
    GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
    ORDER BY month ASC
  `);
  return (result as any)[0] || [];
}

export type AnalyticsGranularity = "day" | "week" | "month" | "quarter" | "year";

const PERIOD_SQL: Record<AnalyticsGranularity, { bucket: string; interval: string }> = {
  day: { bucket: "DATE_FORMAT(createdAt, '%Y-%m-%d')", interval: "INTERVAL 30 DAY" },
  week: { bucket: "DATE_FORMAT(createdAt, '%x-W%v')", interval: "INTERVAL 16 WEEK" },
  month: { bucket: "DATE_FORMAT(createdAt, '%Y-%m')", interval: "INTERVAL 12 MONTH" },
  quarter: { bucket: "CONCAT(YEAR(createdAt), '-Q', QUARTER(createdAt))", interval: "INTERVAL 24 MONTH" },
  year: { bucket: "YEAR(createdAt)", interval: "INTERVAL 5 YEAR" },
};

export async function getPeriodAnalytics(granularity: AnalyticsGranularity = "month") {
  const spec = PERIOD_SQL[granularity] ?? PERIOD_SQL.month;
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT
      ${sql.raw(spec.bucket)} as period,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status IN ('rejected', 'permanently_rejected') THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'retracted' THEN 1 ELSE 0 END) as retracted,
      SUM(CASE WHEN status IN ('under_review', 'pending_admin', 'submitted') THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN submittedAt IS NOT NULL THEN 1 ELSE 0 END) as submissions,
      SUM(CASE WHEN intakeChannel = 'chatbot' THEN 1 ELSE 0 END) as chatbot,
      SUM(CASE WHEN intakeChannel = 'traditional' OR intakeChannel IS NULL THEN 1 ELSE 0 END) as traditional,
      AVG(CASE WHEN approvedAt IS NOT NULL AND submittedAt IS NOT NULL
        THEN TIMESTAMPDIFF(HOUR, submittedAt, approvedAt) ELSE NULL END) as avgReviewHours
    FROM applications
    WHERE createdAt >= DATE_SUB(NOW(), ${sql.raw(spec.interval)})
    GROUP BY period
    ORDER BY period ASC
  `);
  return (result as any)[0] || [];
}

export async function getStatusDistribution() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT status, COUNT(*) as count FROM applications GROUP BY status ORDER BY count DESC
  `);
  return (result as any)[0] || [];
}

export async function getResearchTypeDistribution() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT COALESCE(researchType, 'unknown') as researchType, COUNT(*) as count 
    FROM applications 
    WHERE status != 'draft'
    GROUP BY researchType ORDER BY count DESC
  `);
  return (result as any)[0] || [];
}

export async function getReviewerPerformance() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(committeeMembers).where(and(eq(committeeMembers.isActive, true), sql`${committeeMembers.appointedAt} IS NOT NULL`, sql`CHAR_LENGTH(TRIM(COALESCE(${committeeMembers.qualificationReference}, ''))) >= 10`));
}

// ─── Application Version History helpers ─────────────────────────────────

export async function saveApplicationVersion(data: InsertApplicationVersion) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(applicationVersions).values(data);
  return result[0].insertId;
}

export async function getApplicationVersions(applicationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(applicationVersions)
    .where(eq(applicationVersions.applicationId, applicationId))
    .orderBy(desc(applicationVersions.version));
}

export async function getLatestVersionNumber(applicationId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ maxV: sql`MAX(${applicationVersions.version})` })
    .from(applicationVersions)
    .where(eq(applicationVersions.applicationId, applicationId));
  return (result[0]?.maxV as number) || 0;
}

// ─── User Management helpers ─────────────────────────────────────────────

export async function searchUsersByEmail(query: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(users)
    .where(sql`${users.email} LIKE ${`%${query}%`}`)
    .orderBy(desc(users.createdAt))
    .limit(50);
  return rows.map(withoutPassword);
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function getUserCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ cnt: count() }).from(users);
  return result[0]?.cnt ?? 0;
}

// ─── Public Statistics helpers ───────────────────────────────────────────

export async function getPublicStats() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Statistics are temporarily unavailable." });
  
  const totalApproved = await db.select({ cnt: count() }).from(applications).where(and(eq(applications.status, "approved"), sql`${applications.humanDecisionAt} IS NOT NULL`, sql`${applications.humanDecisionByUserId} IS NOT NULL`));
  const totalApplications = await db.select({ cnt: count() }).from(applications).where(ne(applications.status, "draft"));
  
  const avgTime = await db.execute(sql`
    SELECT AVG(TIMESTAMPDIFF(HOUR, submittedAt, approvedAt)) as avgHours
    FROM applications WHERE approvedAt IS NOT NULL AND submittedAt IS NOT NULL AND humanDecisionAt IS NOT NULL
  `);
  
  const researchTypes = await db.execute(sql`
    SELECT COALESCE(researchType, 'other') as type, COUNT(*) as count
    FROM applications WHERE status != 'draft'
    GROUP BY researchType ORDER BY count DESC
  `);
  
  const monthlyTrends = await db.execute(sql`
    SELECT DATE_FORMAT(createdAt, '%Y-%m') as month,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'approved' AND humanDecisionAt IS NOT NULL THEN 1 ELSE 0 END) as approved
    FROM applications WHERE status != 'draft'
    AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(createdAt, '%Y-%m') ORDER BY month ASC
  `);
  
  return {
    totalApproved: totalApproved[0]?.cnt ?? 0,
    totalApplications: totalApplications[0]?.cnt ?? 0,
    avgProcessingHours: (avgTime as any)[0]?.[0]?.avgHours == null ? null : Number((avgTime as any)[0][0].avgHours),
    researchTypes: (researchTypes as any)[0] || [],
    monthlyTrends: (monthlyTrends as any)[0] || [],
  };
}

// ─── Public Registry helpers ─────────────────────────────────────────────
//
// The public registry exposes only the approved-record projection. Hidden / retracted apps are
// excluded from the registry entirely (the verify route handles those
// separately). PII-light projection only — no email, no internal IDs.

export interface RegistrySearchInput {
  query?: string;
  researchType?: string;
  year?: number;
  page?: number;
  pageSize?: number;
}

export async function searchPublicRegistry(input: RegistrySearchInput) {
  if (ENV.isProduction && process.env.PUBLIC_REGISTRY_ENABLED !== "true") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Public registry publication has not been enabled by the operator." });
  const dbi = await getDb();
  if (!dbi) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Registry is temporarily unavailable." });
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conds: any[] = [eq(applications.status, "approved"), sql`${applications.humanDecisionAt} IS NOT NULL`, sql`${applications.humanDecisionByUserId} IS NOT NULL`];
  if (input.researchType) {
    conds.push(eq(applications.researchType, input.researchType as any));
  }
  if (input.year && Number.isFinite(input.year)) {
    conds.push(sql`YEAR(${applications.approvedAt}) = ${input.year}`);
  }
  if (input.query && input.query.trim().length >= 3) {
    // SA-12: require ≥3 chars so single-letter wildcards can't be used as an
    // enumeration oracle against the entire registry.
    const q = `%${input.query.trim()}%`;
    conds.push(
      or(
        sql`${applications.researchTitle} LIKE ${q}`,
        sql`${applications.principalInvestigator} LIKE ${q}`,
        sql`${applications.piInstitution} LIKE ${q}`,
        sql`${applications.irbNumber} LIKE ${q}`
      )!
    );
  }
  const whereClause = and(...conds);

  const totalRow = await dbi.select({ cnt: count() }).from(applications).where(whereClause);
  // SA-12: piDepartment was leaking through the public registry. Returning
  // the same projection as verifyIrb (institution-level only) so the two
  // public surfaces don't disagree about what's exposable.
  const rows = await dbi
    .select({
      irbNumber: applications.irbNumber,
      researchTitle: applications.researchTitle,
      principalInvestigator: applications.principalInvestigator,
      piInstitution: applications.piInstitution,
      researchType: applications.researchType,
      irbCategory: applications.irbCategory,
      approvedAt: applications.approvedAt,
      hasCertificate: sql<boolean>`${applications.certificateUrl} IS NOT NULL`,
    })
    .from(applications)
    .where(whereClause)
    .orderBy(desc(applications.approvedAt))
    .limit(pageSize)
    .offset(offset);

  return {
    items: rows,
    total: totalRow[0]?.cnt ?? 0,
    page,
    pageSize,
  };
}

/** Lightweight aggregate counts used to populate the registry page header. */
export async function getRegistryStats() {
  if (ENV.isProduction && process.env.PUBLIC_REGISTRY_ENABLED !== "true") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Public registry publication has not been enabled by the operator." });
  const dbi = await getDb();
  if (!dbi) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Registry statistics are temporarily unavailable." });
  const byType = await dbi.execute(sql`
    SELECT COALESCE(researchType, 'other') AS type, COUNT(*) AS count
    FROM applications WHERE status='approved' AND humanDecisionAt IS NOT NULL AND humanDecisionByUserId IS NOT NULL
    GROUP BY researchType ORDER BY count DESC
  `);
  const byYear = await dbi.execute(sql`
    SELECT YEAR(approvedAt) AS year, COUNT(*) AS count
    FROM applications WHERE status='approved' AND humanDecisionAt IS NOT NULL AND humanDecisionByUserId IS NOT NULL AND approvedAt IS NOT NULL
    GROUP BY YEAR(approvedAt) ORDER BY year DESC
  `);
  const byInstitution = await dbi.execute(sql`
    SELECT piInstitution AS institution, COUNT(*) AS count
    FROM applications WHERE status='approved' AND humanDecisionAt IS NOT NULL AND humanDecisionByUserId IS NOT NULL AND piInstitution IS NOT NULL
    GROUP BY piInstitution ORDER BY count DESC LIMIT 10
  `);
  return {
    byType: (byType as any)[0] || [],
    byYear: (byYear as any)[0] || [],
    byInstitution: (byInstitution as any)[0] || [],
  };
}

// ─── Adverse Events ──────────────────────────────────────────────────────

export async function createAdverseEvent(data: InsertAdverseEvent) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const r = await dbi.insert(adverseEvents).values(data);
  return r[0].insertId;
}

export async function getAdverseEventsByApplication(applicationId: number) {
  const dbi = await getDb();
  if (!dbi) return [];
  return dbi.select().from(adverseEvents)
    .where(eq(adverseEvents.applicationId, applicationId))
    .orderBy(desc(adverseEvents.occurredAt));
}

export async function getAllAdverseEvents() {
  const dbi = await getDb();
  if (!dbi) return [];
  return dbi.select().from(adverseEvents).orderBy(desc(adverseEvents.createdAt)).limit(500);
}

export async function updateAdverseEvent(id: number, data: Partial<InsertAdverseEvent>) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  await dbi.update(adverseEvents).set(data).where(eq(adverseEvents.id, id));
}

// ─── Amendments ──────────────────────────────────────────────────────────

export async function createAmendment(data: InsertAmendment) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const r = await dbi.insert(amendments).values(data);
  return r[0].insertId;
}

export async function getAmendmentsByApplication(applicationId: number) {
  const dbi = await getDb();
  if (!dbi) return [];
  return dbi.select().from(amendments)
    .where(eq(amendments.applicationId, applicationId))
    .orderBy(desc(amendments.createdAt));
}

export async function getAllAmendments() {
  const dbi = await getDb();
  if (!dbi) return [];
  return dbi.select().from(amendments).orderBy(desc(amendments.createdAt)).limit(500);
}

export async function updateAmendment(id: number, data: Partial<InsertAmendment>) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  await dbi.update(amendments).set(data).where(eq(amendments.id, id));
}

export async function decideAmendment(input: { id: number; actorUserId: number; decision: "approved" | "rejected"; adminNotes?: string }) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  return dbi.transaction(async tx => {
    const [amendment] = await tx.select().from(amendments).where(eq(amendments.id, input.id)).for("update");
    if (!amendment) throw new TRPCError({ code: "NOT_FOUND" });
    if (!["submitted", "under_review"].includes(amendment.status)) throw new TRPCError({ code: "CONFLICT", message: "This amendment has already been decided." });
    const [app] = await tx.select().from(applications).where(eq(applications.id, amendment.applicationId)).for("update");
    const [actor] = await tx.select({ user: users, member: committeeMembers }).from(users).innerJoin(committeeMembers, eq(committeeMembers.userId, users.id)).where(and(eq(users.id, input.actorUserId), eq(committeeMembers.isActive, true))).limit(1);
    if (!app || !actor || actor.user.role !== "admin" || !actor.member.appointedAt || !actor.member.qualificationReference || actor.user.loginMethod === "digital_reviewer" || actor.user.id === app.applicantId || actor.user.id === amendment.requestedByUserId) throw new TRPCError({ code: "FORBIDDEN", message: "An independent appointed human committee administrator must decide the amendment." });
    if (!["under_review", "pending_admin", "approved"].includes(app.status)) throw new TRPCError({ code: "CONFLICT", message: "Parent application is not active." });
    if (input.decision === "approved" && (process.env.IRB_ISSUANCE_ENABLED !== "true" || (app.status === "approved" && !app.humanDecisionAt))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Institutional authority and a verified parent approval are required." });
    await tx.update(amendments).set({ status: input.decision, adminNotes: input.adminNotes || null, decidedAt: new Date() }).where(eq(amendments.id, input.id));
    await tx.insert(auditLog).values({ applicationId: app.id, userId: input.actorUserId, action: "amendment_decided", details: `Human committee decision on amendment #${input.id}: ${input.decision}. ${input.adminNotes || ""}` });
  });
}

/** A seven-day deduplicated annual review reminder, durable with its audit. */
export async function enqueueContinuingReviewReminder(applicationId: number, actorUserId: number, daysAhead: number) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  return dbi.transaction(async tx => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId)).for("update");
    if (!app || app.status !== "approved" || !app.approvedAt || !app.humanDecisionAt) return false;
    const recent = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.applicationId, applicationId), eq(auditLog.action, "continuing_review_reminder_sent"), gt(auditLog.createdAt, new Date(Date.now() - 7 * 86_400_000)))).limit(1);
    if (recent.length) return false;
    const anniversary = new Date(app.approvedAt);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    if (anniversary.getTime() - Date.now() > daysAhead * 86_400_000) return false;
    await tx.insert(notifications).values({ userId: app.applicantId, applicationId, type: "general", title: "Annual continuing review reminder", message: `The annual review anniversary of ${app.irbNumber || `application #${app.id}`} is approaching or overdue. Contact the responsible committee about its continuing-review requirements and approval conditions.` });
    await tx.insert(auditLog).values({ applicationId, userId: actorUserId, action: "continuing_review_reminder_sent", details: `Annual anniversary ${anniversary.toISOString()}; ${daysAhead}-day reminder window. This reminder is not a renewal decision.` });
    return true;
  });
}

// ─── ORCID linking ───────────────────────────────────────────────────────
//
// Stub: OAuth dance is gated on registering with ORCID's developer
// programme. For now we accept a manually-typed ORCID iD and validate
// the 0000-0000-0000-0000 format. Once OAuth is wired, set verified=true
// only after the OAuth round-trip succeeds.

const ORCID_FMT = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

export function isValidOrcidId(s: string): boolean {
  return ORCID_FMT.test(s);
}

export async function setUserOrcid(userId: number, orcidId: string | null, verified = false) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  if (orcidId && !isValidOrcidId(orcidId)) {
    throw new Error("Invalid ORCID iD format (expected 0000-0000-0000-0000)");
  }
  await dbi.update(users).set({ orcidId, orcidVerified: verified }).where(eq(users.id, userId));
}

// ─── AI Swarm Reviews (owner-only) ───────────────────────────────────────

export async function createAiSwarmReview(data: InsertAiSwarmReview) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  const r = await dbi.insert(aiSwarmReviews).values(data);
  return r[0].insertId;
}

export async function updateAiSwarmReview(id: number, data: Partial<InsertAiSwarmReview>) {
  const dbi = await getDb();
  if (!dbi) throw new Error("Database not available");
  await dbi.update(aiSwarmReviews).set(data).where(eq(aiSwarmReviews.id, id));
}

export async function getAiSwarmReviewsByApplication(applicationId: number) {
  const dbi = await getDb();
  if (!dbi) return [];
  return dbi.select().from(aiSwarmReviews)
    .where(eq(aiSwarmReviews.applicationId, applicationId))
    .orderBy(desc(aiSwarmReviews.createdAt), aiSwarmReviews.panel)
    .limit(100);
}

export const MAX_APPLICATION_CHAT_MESSAGES = 1000;
type ChatTransaction = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0];

async function lockChatApplication(tx: ChatTransaction, applicationId: number, userId: number) {
  // Match account-erasure lock order, and reject in-flight sessions whose
  // account was erased after request authentication.
  const [account] = await tx.select({ id: users.id, loginMethod: users.loginMethod }).from(users).where(eq(users.id, userId)).for("update");
  if (!account || account.loginMethod === "deleted") throw new TRPCError({ code: "FORBIDDEN" });
  const [application] = await tx.select({ applicantId: applications.applicantId }).from(applications).where(eq(applications.id, applicationId)).for("update");
  if (!application) throw new TRPCError({ code: "NOT_FOUND" });
  if (application.applicantId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
}

async function assertChatCapacity(tx: ChatTransaction, applicationId: number, incoming: number) {
  // A bounded locking read sees the latest committed count even under MySQL's
  // repeatable-read isolation. All chat insertions hold the application lock.
  const rows = await tx.select({ id: chatApplicationMessages.id }).from(chatApplicationMessages)
    .where(eq(chatApplicationMessages.applicationId, applicationId)).limit(MAX_APPLICATION_CHAT_MESSAGES).for("update");
  if (rows.length + incoming > MAX_APPLICATION_CHAT_MESSAGES) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "This application's chat history has reached its capacity. You can continue editing the application manually or contact support." });
  }
}

/** Atomically reserve both sides of a turn before any provider attempt. Empty
 * assistant rows are pending reservations, hidden from history but counted.
 * They remain bounded if a process stops; existing records are never purged.
 */
export async function beginChatApplicationTurn(data: { applicationId: number; userId: number; content: string; lang: "ar" | "en" }): Promise<number> {
  if (!data.content.trim() || data.content.length > 4000) throw new TRPCError({ code: "BAD_REQUEST", message: "Chat message exceeds the allowed length." });
  const dbi = await getDb();
  if (!dbi) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Chat history storage is temporarily unavailable." });
  return dbi.transaction(async tx => {
    await lockChatApplication(tx, data.applicationId, data.userId);
    await assertChatCapacity(tx, data.applicationId, 2);
    await tx.insert(chatApplicationMessages).values({ ...data, role: "user" });
    const result = await tx.insert(chatApplicationMessages).values({ ...data, role: "assistant", content: "" });
    return result[0].insertId;
  });
}

export async function completeChatApplicationTurn(data: { assistantMessageId: number; applicationId: number; userId: number; content: string }): Promise<void> {
  if (!data.content.trim() || data.content.length > 4000) throw new TRPCError({ code: "BAD_REQUEST", message: "Chat response exceeds the allowed length." });
  const dbi = await getDb();
  if (!dbi) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Chat history storage is temporarily unavailable." });
  await dbi.transaction(async tx => {
    await lockChatApplication(tx, data.applicationId, data.userId);
    const result = await tx.update(chatApplicationMessages).set({ content: data.content }).where(and(
      eq(chatApplicationMessages.id, data.assistantMessageId), eq(chatApplicationMessages.applicationId, data.applicationId),
      eq(chatApplicationMessages.userId, data.userId), eq(chatApplicationMessages.role, "assistant"), eq(chatApplicationMessages.content, ""),
    ));
    if (result[0].affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "This chat response can no longer be recorded." });
  });
}

/** Compatibility helper for internal callers; it cannot bypass the same cap. */
export async function insertChatApplicationMessage(data: InsertChatApplicationMessage) {
  if (!data.content.trim() || data.content.length > 4000) throw new TRPCError({ code: "BAD_REQUEST" });
  const dbi = await getDb();
  if (!dbi) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Chat history storage is temporarily unavailable." });
  return dbi.transaction(async tx => {
    await lockChatApplication(tx, data.applicationId, data.userId);
    await assertChatCapacity(tx, data.applicationId, 1);
    const result = await tx.insert(chatApplicationMessages).values(data);
    return result[0].insertId;
  });
}

export async function getChatApplicationMessages(applicationId: number, userId: number) {
  const dbi = await getDb();
  if (!dbi) return [];
  const rows = await dbi.select().from(chatApplicationMessages)
    .where(and(
      eq(chatApplicationMessages.applicationId, applicationId),
      eq(chatApplicationMessages.userId, userId),
      ne(chatApplicationMessages.content, ""),
    ))
    .orderBy(desc(chatApplicationMessages.id))
    .limit(200);
  return rows.reverse();
}

// ─── First-party analytics (owner observability) ─────────────────────────

export async function ingestAnalyticsEvent(input: {
  sessionId: string;
  path: string;
  eventType: "pageview" | "heartbeat" | "leave";
  dwellMs: number;
  userId?: number | null;
  ipHash?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  uaClass?: string | null;
}) {
  const dbi = await getDb();
  if (!dbi) return { ok: false as const };
  const now = new Date();
  const dwell = Math.max(0, Math.min(input.dwellMs || 0, 120_000));
  const pageInc = input.eventType === "pageview" ? 1 : 0;

  await dbi.insert(analyticsSessions).values({
    sessionId: input.sessionId,
    userId: input.userId ?? null,
    ipHash: input.ipHash ?? null,
    country: input.country ?? null,
    region: input.region ?? null,
    city: input.city ?? null,
    uaClass: input.uaClass ?? null,
    startedAt: now,
    lastSeenAt: now,
    pageviews: pageInc,
    dwellMs: dwell,
  }).onDuplicateKeyUpdate({
    set: {
      lastSeenAt: now,
      pageviews: sql`${analyticsSessions.pageviews} + ${pageInc}`,
      dwellMs: sql`${analyticsSessions.dwellMs} + ${dwell}`,
      ...(input.userId != null ? { userId: input.userId } : {}),
      ...(input.country ? { country: input.country } : {}),
      ...(input.region ? { region: input.region } : {}),
      ...(input.city ? { city: input.city } : {}),
    },
  });

  await dbi.insert(analyticsEvents).values({
    sessionId: input.sessionId,
    path: input.path,
    eventType: input.eventType,
    dwellMs: dwell,
    createdAt: now,
  });

  return { ok: true as const };
}

export async function getObservabilityMetrics() {
  const dbi = await getDb();
  if (!dbi) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Observability data is temporarily unavailable." });

  const [sessionAgg] = await dbi.select({
    sessions: count(),
    pageviews: sql<number>`COALESCE(SUM(${analyticsSessions.pageviews}), 0)`,
    avgDwellMs: sql<number | null>`AVG(${analyticsSessions.dwellMs})`,
  }).from(analyticsSessions);

  const accountsTotal = await getUserCount();
  const [accounts7dRow] = await dbi.select({ cnt: count() }).from(users)
    .where(sql`${users.createdAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  const [accounts24hRow] = await dbi.select({ cnt: count() }).from(users)
    .where(sql`${users.createdAt} >= DATE_SUB(NOW(), INTERVAL 1 DAY)`);
  const [activeUsers7dRow] = await dbi.select({ cnt: count() }).from(users)
    .where(sql`${users.lastSignedIn} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);

  const [appsTotalRow] = await dbi.select({ cnt: count() }).from(applications)
    .where(ne(applications.status, "draft"));
  const statusRows = await dbi.execute(sql`
    SELECT status, COUNT(*) as count FROM applications
    WHERE status != 'draft'
    GROUP BY status ORDER BY count DESC
  `);
  const pathRows = await dbi.execute(sql`
    SELECT path, COUNT(*) as count FROM analytics_events
    WHERE eventType = 'pageview' AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY path ORDER BY count DESC LIMIT 15
  `);
  const geoRows = await dbi.execute(sql`
    SELECT COALESCE(country, 'Unknown') as country, COUNT(*) as sessions
    FROM analytics_sessions
    GROUP BY country ORDER BY sessions DESC LIMIT 20
  `);
  const dayRows = await dbi.execute(sql`
    SELECT DATE_FORMAT(startedAt, '%Y-%m-%d') as day,
      COUNT(*) as sessions,
      COALESCE(SUM(pageviews), 0) as pageviews
    FROM analytics_sessions
    WHERE startedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY day ORDER BY day ASC
  `);

  const today = new Date().toISOString().slice(0, 10);
  const [llmRow] = await dbi.select({ cnt: sql<number>`COALESCE(SUM(${llmUsageDaily.count}), 0)` })
    .from(llmUsageDaily)
    .where(and(eq(llmUsageDaily.day, today), sql`${llmUsageDaily.scope} LIKE 'user:%'`));
  const llmDayRows = await dbi.execute(sql`
    SELECT day, COALESCE(SUM(count), 0) as count FROM llm_usage_daily
    WHERE scope LIKE 'user:%' AND day >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 14 DAY), '%Y-%m-%d')
    GROUP BY day ORDER BY day ASC
  `);
  const intakeRows = await dbi.execute(sql`
    SELECT COALESCE(intakeChannel, 'traditional') as channel, COUNT(*) as count
    FROM applications GROUP BY intakeChannel
  `);
  const [sub7] = await dbi.select({ cnt: count() }).from(applications)
    .where(sql`${applications.submittedAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  const [appr7] = await dbi.select({ cnt: count() }).from(applications)
    .where(and(eq(applications.status, "approved"), sql`${applications.approvedAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`));
  const [retr] = await dbi.select({ cnt: count() }).from(applications)
    .where(eq(applications.status, "retracted"));

  // drizzle-orm mysql2 `execute` returns [rows, fields] — same shape as
  // getPublicStats(). Prefer that tuple form over treating the pair as rows.
  const asRows = (raw: unknown): Record<string, unknown>[] => {
    if (Array.isArray(raw) && Array.isArray(raw[0])) {
      return raw[0] as Record<string, unknown>[];
    }
    const r = raw as { rows?: Record<string, unknown>[] };
    if (Array.isArray(r?.rows)) return r.rows;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null && !Array.isArray(raw[0])) {
      return raw as Record<string, unknown>[];
    }
    return [];
  };

  return {
    sessions: Number(sessionAgg?.sessions ?? 0),
    pageviews: Number(sessionAgg?.pageviews ?? 0),
    avgDwellMs: sessionAgg?.avgDwellMs == null ? null : Math.round(Number(sessionAgg.avgDwellMs)),
    accountsTotal,
    accounts7d: Number(accounts7dRow?.cnt ?? 0),
    accounts24h: Number(accounts24hRow?.cnt ?? 0),
    activeUsers7d: Number(activeUsers7dRow?.cnt ?? 0),
    applicationsTotal: Number(appsTotalRow?.cnt ?? 0),
    applicationsByStatus: asRows(statusRows)
      .filter(r => r.status != null && String(r.status).length > 0)
      .map(r => ({
        status: String(r.status),
        count: Number(r.count ?? 0),
      })),
    topPaths: asRows(pathRows)
      .filter(r => r.path != null && String(r.path).length > 0)
      .map(r => ({
        path: String(r.path),
        count: Number(r.count ?? 0),
      })),
    geo: asRows(geoRows).map(r => ({
      country: String(r.country ?? "Unknown"),
      sessions: Number(r.sessions ?? 0),
    })),
    visitsByDay: asRows(dayRows)
      .filter(r => r.day != null && String(r.day).length > 0)
      .map(r => ({
        day: String(r.day),
        sessions: Number(r.sessions ?? 0),
        pageviews: Number(r.pageviews ?? 0),
      })),
    llmToday: Number(llmRow?.cnt ?? 0),
    llmByDay: asRows(llmDayRows)
      .filter(r => r.day != null && String(r.day).length > 0)
      .map(r => ({ day: String(r.day), count: Number(r.count ?? 0) })),
    applicationsByIntake: asRows(intakeRows).map(r => ({
      channel: String(r.channel ?? "traditional"),
      count: Number(r.count ?? 0),
    })),
    submissions7d: Number(sub7?.cnt ?? 0),
    approvals7d: Number(appr7?.cnt ?? 0),
    retractions: Number(retr?.cnt ?? 0),
  };
}
