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
} from "../drizzle/schema";
import { ENV } from './_core/env';
import mysql from 'mysql2';

let _db: ReturnType<typeof drizzle> | null = null;

// Capture the owner openId ONCE at module load (SA-26). Subsequent edits
// to process.env or ENV.ownerOpenId won't change who gets auto-promoted —
// a filesystem-write attack against the running container's .env can no
// longer silently re-attribute admin on next login.
const BOOT_OWNER_OPEN_ID = ENV.ownerOpenId;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // SA-19: force TLS in production. mysql2 enables TLS automatically when
      // the URL carries `?ssl={...}`, but we shouldn't depend on every
      // operator remembering to append that. In production we attach a
      // strict SSL block that rejects unauthenticated certs. In dev we keep
      // the URL-only path so localhost MySQL still works.
      if (ENV.isProduction) {
        const pool = mysql.createPool({
          uri: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: true },
          // Reasonable pool defaults for a small platform; tune via
          // DATABASE_POOL_MAX if you outgrow them.
          connectionLimit: parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10),
          waitForConnections: true,
        });
        _db = drizzle(pool);
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

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
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
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

export async function removeAuthor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(researchAuthors).where(eq(researchAuthors.id, id));
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
