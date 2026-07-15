import { and, eq, desc, sql, ne, count, avg, inArray, isNull, or, lte } from "drizzle-orm";
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
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { createMysqlPool } from "./_core/mysql";

let _db: ReturnType<typeof drizzle> | null = null;

// Capture the owner openId ONCE at module load (SA-26). Subsequent edits
// to process.env or ENV.ownerOpenId won't change who gets auto-promoted —
// a filesystem-write attack against the running container's .env can no
// longer silently re-attribute admin on next login.
const BOOT_OWNER_OPEN_ID = ENV.ownerOpenId;
const BOOT_OWNER_EMAIL = ENV.ownerEmail;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (ENV.isProduction) {
        _db = drizzle(createMysqlPool(process.env.DATABASE_URL));
      } else {
        _db = drizzle(process.env.DATABASE_URL);
      }
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
    const textFields = ["name", "email", "loginMethod"] as const;
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
    else if (BOOT_OWNER_EMAIL && user.email?.toLowerCase() === BOOT_OWNER_EMAIL) {
      // Email-based promotion is a ONE-TIME bootstrap, same policy as the
      // native-register and Supabase paths: once any admin exists, an
      // unverified email claim on a legacy-OAuth login can never mint a
      // new admin. The genuine owner keeps admin because the role is
      // already persisted on their row.
      if (!(await adminExists())) {
        values.role = 'admin';
        updateSet.role = 'admin';
      }
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
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
 * SECURITY (admin bootstrap): the platform owner email (BOOT_OWNER_EMAIL) is
 * promoted to admin ONLY when no admin account exists yet — a one-time
 * bootstrap during initial setup. Once an admin exists the path is closed,
 * so an attacker cannot self-register the owner email later to seize admin.
 * Native registration is otherwise never auto-promoted; subsequent admins are
 * granted by an existing admin via updateUserRole or by OWNER_OPEN_ID match.
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
  const isOwnerEmail = Boolean(BOOT_OWNER_EMAIL) && normalizedEmail === BOOT_OWNER_EMAIL;
  const role: "user" | "admin" = isOwnerEmail && !(await adminExists()) ? "admin" : "user";
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

  const [authors, versions, aes, ams, files, myNotifications, myAudit, myTickets] = await Promise.all([
    appIds.length ? db.select().from(researchAuthors).where(inArray(researchAuthors.applicationId, appIds)) : Promise.resolve([]),
    appIds.length ? db.select().from(applicationVersions).where(inArray(applicationVersions.applicationId, appIds)) : Promise.resolve([]),
    appIds.length ? db.select().from(adverseEvents).where(inArray(adverseEvents.applicationId, appIds)) : Promise.resolve([]),
    appIds.length ? db.select().from(amendments).where(inArray(amendments.applicationId, appIds)) : Promise.resolve([]),
    db.select().from(fileUploads).where(eq(fileUploads.userId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)),
    db.select().from(auditLog).where(eq(auditLog.userId, userId)),
    db.select().from(supportTickets).where(eq(supportTickets.userId, userId)),
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
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const apps = await db.select({ id: applications.id, status: applications.status })
    .from(applications).where(eq(applications.applicantId, userId));
  const NEVER_SUBMITTED = new Set([
    "draft", "declaration_pending",
    "stage1_pending", "stage1_failed",
    "stage2_pending", "stage2_failed",
  ]);
  const draftIds = apps.filter(a => NEVER_SUBMITTED.has(a.status as string)).map(a => a.id);
  const retained = apps.length - draftIds.length;

  if (draftIds.length) {
    await db.delete(researchAuthors).where(inArray(researchAuthors.applicationId, draftIds));
    await db.delete(reviewAssignments).where(inArray(reviewAssignments.applicationId, draftIds));
    await db.delete(applicationVersions).where(inArray(applicationVersions.applicationId, draftIds));
    await db.delete(adverseEvents).where(inArray(adverseEvents.applicationId, draftIds));
    await db.delete(amendments).where(inArray(amendments.applicationId, draftIds));
    await db.delete(aiSwarmReviews).where(inArray(aiSwarmReviews.applicationId, draftIds));
    await db.delete(fileUploads).where(inArray(fileUploads.applicationId, draftIds));
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
    passwordHash: null,
    role: "user",
    orcidId: null,
    orcidVerified: false,
  }).where(eq(users.id, userId));

  return { deletedDraftApplications: draftIds.length, retainedRegulatoryApplications: retained };
}

// ─── Application helpers ────────────────────────────────────────────────────

export async function createApplication(data: InsertApplication) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(applications).values(data);
  return result[0].insertId;
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
  const year = new Date().getFullYear();
  const result = await db.select({ cnt: count() }).from(applications).where(sql`YEAR(${applications.createdAt}) = ${year}`);
  const num = (result[0]?.cnt ?? 0) + 1;
  return `IRB-SA-${year}-${String(num).padStart(5, "0")}`;
}

export async function getApplicationStats() {
  const db = await getDb();
  if (!db) return { total: 0, approved: 0, rejected: 0, pending: 0, avgProcessingDays: 0 };
  const total = await db.select({ cnt: count() }).from(applications);
  const approved = await db.select({ cnt: count() }).from(applications).where(eq(applications.status, "approved"));
  const rejected = await db.select({ cnt: count() }).from(applications).where(
    or(eq(applications.status, "rejected"), eq(applications.status, "permanently_rejected"))
  );
  const pending = await db.select({ cnt: count() }).from(applications).where(
    and(
      ne(applications.status, "approved"),
      ne(applications.status, "rejected"),
      ne(applications.status, "permanently_rejected"),
      ne(applications.status, "draft")
    )
  );
  return {
    total: total[0]?.cnt ?? 0,
    approved: approved[0]?.cnt ?? 0,
    rejected: rejected[0]?.cnt ?? 0,
    pending: pending[0]?.cnt ?? 0,
    avgProcessingDays: 0,
  };
}

// ─── Research Authors helpers ───────────────────────────────────────────────

export async function addResearchAuthor(data: InsertResearchAuthor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(researchAuthors).values(data);
  return result[0].insertId;
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
  await db
    .delete(researchAuthors)
    .where(and(eq(researchAuthors.id, id), eq(researchAuthors.applicationId, applicationId)));
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
  return db.select().from(committeeMembers).where(eq(committeeMembers.isActive, true));
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

export async function addFileUpload(data: InsertFileUpload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(fileUploads).values(data);
  return result[0].insertId;
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
  return db.select().from(committeeMembers).where(eq(committeeMembers.isActive, true));
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
  return db.select().from(users)
    .where(sql`${users.email} LIKE ${`%${query}%`}`)
    .orderBy(desc(users.createdAt))
    .limit(50);
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
  if (!db) return { totalApproved: 0, totalApplications: 0, avgProcessingHours: 0, researchTypes: [], monthlyTrends: [] };
  
  const totalApproved = await db.select({ cnt: count() }).from(applications).where(eq(applications.status, "approved"));
  const totalApplications = await db.select({ cnt: count() }).from(applications).where(ne(applications.status, "draft"));
  
  const avgTime = await db.execute(sql`
    SELECT AVG(TIMESTAMPDIFF(HOUR, submittedAt, approvedAt)) as avgHours
    FROM applications WHERE approvedAt IS NOT NULL AND submittedAt IS NOT NULL
  `);
  
  const researchTypes = await db.execute(sql`
    SELECT COALESCE(researchType, 'other') as type, COUNT(*) as count
    FROM applications WHERE status != 'draft'
    GROUP BY researchType ORDER BY count DESC
  `);
  
  const monthlyTrends = await db.execute(sql`
    SELECT DATE_FORMAT(createdAt, '%Y-%m') as month,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
    FROM applications WHERE status != 'draft'
    AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(createdAt, '%Y-%m') ORDER BY month ASC
  `);
  
  return {
    totalApproved: totalApproved[0]?.cnt ?? 0,
    totalApplications: totalApplications[0]?.cnt ?? 0,
    avgProcessingHours: (avgTime as any)[0]?.[0]?.avgHours ?? 0,
    researchTypes: (researchTypes as any)[0] || [],
    monthlyTrends: (monthlyTrends as any)[0] || [],
  };
}

// ─── Public Registry helpers ─────────────────────────────────────────────
//
// Approved IRBs are public information. Hidden / retracted apps are
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
  const dbi = await getDb();
  if (!dbi) return { items: [], total: 0, page: 1, pageSize: 20 };
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conds: any[] = [eq(applications.status, "approved")];
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
      id: applications.id,
      irbNumber: applications.irbNumber,
      researchTitle: applications.researchTitle,
      principalInvestigator: applications.principalInvestigator,
      piInstitution: applications.piInstitution,
      researchType: applications.researchType,
      irbCategory: applications.irbCategory,
      approvedAt: applications.approvedAt,
      certificateUrl: applications.certificateUrl,
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
  const dbi = await getDb();
  if (!dbi) return { byType: [], byYear: [], byInstitution: [] };
  const byType = await dbi.execute(sql`
    SELECT COALESCE(researchType, 'other') AS type, COUNT(*) AS count
    FROM applications WHERE status='approved'
    GROUP BY researchType ORDER BY count DESC
  `);
  const byYear = await dbi.execute(sql`
    SELECT YEAR(approvedAt) AS year, COUNT(*) AS count
    FROM applications WHERE status='approved' AND approvedAt IS NOT NULL
    GROUP BY YEAR(approvedAt) ORDER BY year DESC
  `);
  const byInstitution = await dbi.execute(sql`
    SELECT piInstitution AS institution, COUNT(*) AS count
    FROM applications WHERE status='approved' AND piInstitution IS NOT NULL
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
  if (!dbi) {
    return {
      sessions: 0,
      pageviews: 0,
      avgDwellMs: 0,
      accountsTotal: 0,
      accounts7d: 0,
      accounts24h: 0,
      activeUsers7d: 0,
      applicationsTotal: 0,
      applicationsByStatus: [] as { status: string; count: number }[],
      topPaths: [] as { path: string; count: number }[],
      geo: [] as { country: string; sessions: number }[],
      visitsByDay: [] as { day: string; sessions: number; pageviews: number }[],
      llmToday: 0,
    };
  }

  const [sessionAgg] = await dbi.select({
    sessions: count(),
    pageviews: sql<number>`COALESCE(SUM(${analyticsSessions.pageviews}), 0)`,
    avgDwellMs: sql<number>`COALESCE(AVG(${analyticsSessions.dwellMs}), 0)`,
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
    WHERE startedAt >= DATE_SUB(NOW(), INTERVAL 14 DAY)
    GROUP BY day ORDER BY day ASC
  `);

  const today = new Date().toISOString().slice(0, 10);
  const [llmRow] = await dbi.select({ cnt: sql<number>`COALESCE(SUM(${llmUsageDaily.count}), 0)` })
    .from(llmUsageDaily)
    .where(eq(llmUsageDaily.day, today));

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
    avgDwellMs: Math.round(Number(sessionAgg?.avgDwellMs ?? 0)),
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
  };
}
