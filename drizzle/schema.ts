import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Native email/password auth — scrypt hash (format: scrypt$N$r$p$salt$hash).
  // NULL for users who signed up via an OAuth/social provider (no local
  // password). Login-by-password only succeeds when this is set.
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // ORCID iD — optional; pre-fills PI fields on Stage 1 once linked.
  // 19-char "0000-0000-0000-0000" format. We don't run the OAuth dance
  // ourselves yet; the column lets the UI store / display once we do.
  orcidId: varchar("orcidId", { length: 19 }),
  orcidVerified: boolean("orcidVerified").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Committee members table
export const committeeMembers = mysqlTable("committee_members", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  specialization: varchar("specialization", { length: 255 }),
  title: varchar("title", { length: 128 }),
  institution: varchar("institution", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  totalAssignments: int("totalAssignments").default(0).notNull(),
  totalResponses: int("totalResponses").default(0).notNull(),
  totalApprovals: int("totalApprovals").default(0).notNull(),
  totalRejections: int("totalRejections").default(0).notNull(),
  averageResponseTimeMs: int("averageResponseTimeMs").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommitteeMember = typeof committeeMembers.$inferSelect;
export type InsertCommitteeMember = typeof committeeMembers.$inferInsert;

// IRB Applications table
export const applications = mysqlTable("applications", {
  id: int("id").autoincrement().primaryKey(),
  applicantId: int("applicantId").notNull(),
  irbNumber: varchar("irbNumber", { length: 64 }).unique(),

  // Status workflow (added retracted, hidden)
  status: mysqlEnum("status", [
    "draft",
    "declaration_pending",
    "stage1_pending",
    "stage1_failed",
    "stage2_pending",
    "stage2_failed",
    "submitted",
    "under_review",
    "pending_admin",
    "approved",
    "rejected",
    "resubmission_required",
    "permanently_rejected",
    "retracted",
    "hidden",
  ]).default("draft").notNull(),

  submissionCount: int("submissionCount").default(1).notNull(),

  // Declaration phase (Phase 0)
  declarationHonesty: boolean("declarationHonesty").default(false),
  declarationNbceCertification: boolean("declarationNbceCertification").default(false),
  declarationConsentTruth: boolean("declarationConsentTruth").default(false),
  declarationAcceptPolicy: boolean("declarationAcceptPolicy").default(false),
  nbceCertificateUrl: text("nbceCertificateUrl"),
  declarationCompletedAt: timestamp("declarationCompletedAt"),

  // Stage 1: Research type & IRB classification
  researchType: mysqlEnum("researchType", [
    "clinical_trial",
    "observational",
    "retrospective",
    "survey_questionnaire",
    "case_study",
    "laboratory",
    "educational",
    "social_behavioral",
    "other",
  ]),
  irbCategory: mysqlEnum("irbCategory", [
    "full_board",
    "expedited",
    "exempt",
  ]),
  researchTitle: text("researchTitle"),
  principalInvestigator: varchar("principalInvestigator", { length: 255 }),
  piEmail: varchar("piEmail", { length: 320 }),
  piInstitution: varchar("piInstitution", { length: 255 }),
  piDepartment: varchar("piDepartment", { length: 255 }),
  fundingSource: varchar("fundingSource", { length: 255 }),
  estimatedDuration: varchar("estimatedDuration", { length: 128 }),
  stage1AiScore: int("stage1AiScore"),
  stage1AiFeedback: text("stage1AiFeedback"),
  stage1Passed: boolean("stage1Passed"),

  // Research-type-specific fields
  questionnaireFileUrl: text("questionnaireFileUrl"),
  retrospectiveDataSource: text("retrospectiveDataSource"),
  clinicalTrialDetails: text("clinicalTrialDetails"),
  supplementaryFilesJson: text("supplementaryFilesJson"),
  labHeadApproval: boolean("labHeadApproval"),
  labHeadName: varchar("labHeadName", { length: 255 }),
  labHeadEmail: varchar("labHeadEmail", { length: 320 }),
  labHeadPhone: varchar("labHeadPhone", { length: 64 }),

  // Stage 2: Research details
  researchObjectives: text("researchObjectives"),
  methodology: text("methodology"),
  sampleSize: text("sampleSize"),
  targetPopulation: text("targetPopulation"),
  inclusionCriteria: text("inclusionCriteria"),
  exclusionCriteria: text("exclusionCriteria"),
  dataCollectionMethods: text("dataCollectionMethods"),
  informedConsentProcess: text("informedConsentProcess"),
  riskAssessment: text("riskAssessment"),
  benefitAssessment: text("benefitAssessment"),
  confidentialityMeasures: text("confidentialityMeasures"),
  conflictOfInterest: text("conflictOfInterest"),
  previousIrbApproval: text("previousIrbApproval"),
  additionalDocumentsUrl: text("additionalDocumentsUrl"),
  rejectionFileUrl: text("rejectionFileUrl"),
  stage2AiScore: int("stage2AiScore"),
  stage2AiFeedback: text("stage2AiFeedback"),
  stage2AiFieldScores: text("stage2AiFieldScores"), // JSON: per-field color scores
  stage2Passed: boolean("stage2Passed"),

  // Proceed despite AI score (red flag)
  proceedDespiteStage1: boolean("proceedDespiteStage1").default(false),
  proceedDespiteStage1Reason: text("proceedDespiteStage1Reason"),
  proceedDespiteStage2: boolean("proceedDespiteStage2").default(false),
  proceedDespiteStage2Reason: text("proceedDespiteStage2Reason"),

  // Admin notes
  adminNotes: text("adminNotes"),
  rejectionReason: text("rejectionReason"),
  retractionReason: text("retractionReason"),

  // Certificate
  certificateUrl: text("certificateUrl"),
  retractionCertificateUrl: text("retractionCertificateUrl"),
  approvedAt: timestamp("approvedAt"),
  retractedAt: timestamp("retractedAt"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  submittedAt: timestamp("submittedAt"),
});

export type Application = typeof applications.$inferSelect;
export type InsertApplication = typeof applications.$inferInsert;

// Research authors table
export const researchAuthors = mysqlTable("research_authors", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  institution: varchar("institution", { length: 255 }),
  department: varchar("department", { length: 255 }),
  country: varchar("country", { length: 128 }).default("Saudi Arabia"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ResearchAuthor = typeof researchAuthors.$inferSelect;
export type InsertResearchAuthor = typeof researchAuthors.$inferInsert;

// Support tickets table
export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["issue", "suggestion", "question", "other"]).default("question").notNull(),
  message: text("message").notNull(),
  userId: int("userId"),
  status: mysqlEnum("ticketStatus", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

// Review assignments
export const reviewAssignments = mysqlTable("review_assignments", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  committeeMemberId: int("committeeMemberId").notNull(),
  assignedBy: mysqlEnum("assignedBy", ["system", "admin"]).default("system").notNull(),

  status: mysqlEnum("status", [
    "pending",
    "approved",
    "rejected",
    "expired",
  ]).default("pending").notNull(),

  comments: text("comments"),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type ReviewAssignment = typeof reviewAssignments.$inferSelect;
export type InsertReviewAssignment = typeof reviewAssignments.$inferInsert;

// Audit log
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId"),
  userId: int("userId"),
  action: varchar("action", { length: 128 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;

// In-app notifications table
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  applicationId: int("applicationId"),
  type: mysqlEnum("notifType", [
    "application_submitted",
    "ai_review_passed",
    "ai_review_failed",
    "committee_assigned",
    "review_received",
    "admin_approved",
    "admin_rejected",
    "resubmission_required",
    "certificate_issued",
    "review_assignment",
    "review_reminder",
    "retracted",
    "general",
  ]).default("general").notNull(),
  title: varchar("notifTitle", { length: 255 }).notNull(),
  message: text("notifMessage").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// File uploads table
export const fileUploads = mysqlTable("file_uploads", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId"),
  userId: int("userId").notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"),
  category: mysqlEnum("fileCategory", [
    "questionnaire",
    "supplementary",
    "nbce_certificate",
    "rejection_file",
    "additional_document",
    "other",
  ]).default("other").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileUpload = typeof fileUploads.$inferSelect;
export type InsertFileUpload = typeof fileUploads.$inferInsert;

// Application version history — snapshots saved on each submission
export const applicationVersions = mysqlTable("application_versions", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  version: int("version").notNull(), // 1, 2, 3...
  snapshot: text("snapshot").notNull(), // JSON snapshot of all application fields
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  stage1AiScore: int("stage1AiScore"),
  stage2AiScore: int("stage2AiScore"),
  status: varchar("versionStatus", { length: 64 }).notNull(),
  changedFields: text("changedFields"), // JSON array of field names that changed from previous version
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApplicationVersion = typeof applicationVersions.$inferSelect;
export type InsertApplicationVersion = typeof applicationVersions.$inferInsert;

// ─── Adverse events — required by NBCE for any active human-subjects
//     study. Applicants file as soon as a serious AE occurs; admin
//     reviews and either acknowledges or escalates.
export const adverseEvents = mysqlTable("adverse_events", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  reportedByUserId: int("reportedByUserId").notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  severity: mysqlEnum("severity", ["mild", "moderate", "serious", "life_threatening", "fatal"]).notNull(),
  expected: boolean("expected").default(false).notNull(),
  relatedToStudy: mysqlEnum("relatedToStudy", ["unrelated", "possibly", "probably", "definitely", "unknown"]).notNull(),
  description: text("description").notNull(),
  actionTaken: text("actionTaken"),
  outcome: mysqlEnum("outcome", ["recovered", "recovering", "ongoing", "permanent_disability", "death", "unknown"]),
  status: mysqlEnum("aeStatus", ["reported", "under_review", "acknowledged", "escalated", "closed"]).default("reported").notNull(),
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdverseEvent = typeof adverseEvents.$inferSelect;
export type InsertAdverseEvent = typeof adverseEvents.$inferInsert;

// ─── Protocol amendments — change requests against an approved or
//     in-review study (site additions, sample-size bumps, eligibility
//     tweaks). Each amendment carries its own diff against the parent
//     application; admin approves or rejects.
export const amendments = mysqlTable("amendments", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  requestedByUserId: int("requestedByUserId").notNull(),
  type: mysqlEnum("amendmentType", [
    "minor",          // typos, clarifications, contact updates
    "moderate",       // sample size, timeline, additional sites
    "major",          // new arm, new procedure, new population
  ]).default("minor").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  rationale: text("rationale").notNull(),
  changedFieldsJson: text("changedFieldsJson"), // {field: {before, after}}
  status: mysqlEnum("amStatus", [
    "submitted", "under_review", "approved", "rejected",
  ]).default("submitted").notNull(),
  adminNotes: text("adminNotes"),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Amendment = typeof amendments.$inferSelect;
export type InsertAmendment = typeof amendments.$inferInsert;
