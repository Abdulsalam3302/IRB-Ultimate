import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import * as db from "./db";
import { appRouter } from "./routers";
import { normalizeStorageKey } from "./storage";
import { listMissingRequirements } from "./services/irb.validation";
import * as schema from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const connection = process.env.DATABASE_URL;
const localTestDb = Boolean(connection && (() => { const url = new URL(connection); return ["127.0.0.1", "localhost"].includes(url.hostname) && /test/.test(url.pathname); })());
const run = describe.skipIf(!localTestDb);
const token = randomBytes(6).toString("hex");
const userIds: number[] = [];
const appIds: number[] = [];
const memberIds: number[] = [];
let applicant: schema.User;
let outsider: schema.User;
let humans: schema.User[];
const originalIssuance = process.env.IRB_ISSUANCE_ENABLED;

function caller(user: schema.User | null) {
  return appRouter.createCaller({ user, req: { protocol: "http", headers: {} }, res: {} } as TrpcContext);
}

async function user(label: string, role: "admin" | "user" = "user", method = "password") {
  const openId = `workflow-${token}-${label}`;
  await db.upsertUser({ openId, email: `${label}-${token}@example.test`, name: label, role, loginMethod: method, passwordHash: "never-expose-this-hash" });
  const created = (await db.getUserByOpenId(openId))!;
  userIds.push(created.id);
  return created;
}

async function application(overrides: Partial<schema.InsertApplication> = {}) {
  const id = await db.createApplication({ applicantId: applicant.id, status: "submitted", declarationHonesty: true, declarationNbceCertification: true, declarationConsentTruth: true, declarationAcceptPolicy: true, declarationCompletedAt: new Date(), researchType: "observational", irbCategory: "full_board", researchTitle: "Synthetic workflow regression", principalInvestigator: "Synthetic Investigator", piEmail: applicant.email!, piInstitution: "Synthetic test institution", piDepartment: "Synthetic department", stage1Passed: true, stage2Passed: true, researchObjectives: "Synthetic objectives", methodology: "Synthetic methodology", sampleSize: "100 synthetic records", targetPopulation: "Synthetic population", inclusionCriteria: "Synthetic inclusion criteria", exclusionCriteria: "Synthetic exclusion criteria", dataCollectionMethods: "Synthetic collection", informedConsentProcess: "Synthetic consent process", riskAssessment: "Synthetic risk assessment", benefitAssessment: "Synthetic benefit assessment", confidentialityMeasures: "Synthetic confidentiality", conflictOfInterest: "No synthetic conflict", ...overrides });
  appIds.push(id);
  return (await db.getApplicationById(id))!;
}

run("transactional workflow authority and privacy (isolated local database)", () => {
  beforeAll(async () => {
    applicant = await user("applicant");
    outsider = await user("outsider");
    humans = [];
    for (let i = 0; i < 6; i++) {
      const reviewer = await user(`human-${i}`, "admin");
      humans.push(reviewer);
      memberIds.push(await db.addCommitteeMember({ userId: reviewer.id, isActive: true, qualificationReference: "Synthetic test appointment reference only", appointedAt: new Date(), appointedByUserId: reviewer.id }));
    }
  });

  afterEach(() => {
    if (originalIssuance === undefined) delete process.env.IRB_ISSUANCE_ENABLED;
    else process.env.IRB_ISSUANCE_ENABLED = originalIssuance;
  });

  afterAll(async () => {
    const database = await db.getDb();
    if (database) {
      if (appIds.length) {
        for (const table of [schema.researchAuthors, schema.reviewAssignments, schema.applicationVersions, schema.adverseEvents, schema.amendments, schema.aiSwarmReviews, schema.chatApplicationMessages, schema.fileUploads, schema.notifications, schema.auditLog]) {
          await database.delete(table).where(inArray(table.applicationId, appIds));
        }
        await database.delete(schema.applications).where(inArray(schema.applications.id, appIds));
      }
      if (userIds.length) {
        await database.delete(schema.fileUploads).where(inArray(schema.fileUploads.userId, userIds));
        await database.delete(schema.committeeMembers).where(inArray(schema.committeeMembers.userId, userIds));
        await database.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
    }
    await db.closeDatabase();
  });

  it("rejects incomplete declarations even when completion timestamp and pass flags are set", async () => {
    const app = await application({ declarationHonesty: false });
    expect(listMissingRequirements(app)).toContain("declaration_honesty");
    await expect(db.submitApplicationForReview(app.id, applicant.id)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.getReviewsByApplication(app.id)).toHaveLength(0);
  });

  it("does not accept unresolved AI template markers as application facts", async () => {
    const app = await application({ methodology: "[NEEDS APPLICANT: provide actual study methods]" });
    expect(listMissingRequirements(app)).toContain("methodology");
    await expect(db.submitApplicationForReview(app.id, applicant.id)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("commits one submission, one snapshot, and five assignments under concurrent requests", async () => {
    const app = await application();
    const results = await Promise.allSettled([db.submitApplicationForReview(app.id, applicant.id), db.submitApplicationForReview(app.id, applicant.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.getReviewsByApplication(app.id)).toHaveLength(5);
    expect(await db.getApplicationVersions(app.id)).toHaveLength(1);
    expect((await db.getApplicationById(app.id))?.submissionCount).toBe(1);
  });

  it("rejects another account and removes stale passes after an edit", async () => {
    const app = await application({ status: "stage2_pending" });
    await expect(db.updateEditableApplication(app.id, outsider.id, { methodology: "changed" }, app)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const changed = await db.updateEditableApplication(app.id, applicant.id, { researchTitle: "Revised title" }, app);
    expect(changed).toMatchObject({ stage1Passed: false, stage2Passed: false, stage1AiScore: null, stage2AiScore: null, status: "stage1_pending" });
    await expect(db.updateEditableApplication(app.id, applicant.id, { stage1Passed: true }, app)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cannot change authors or append uploads after final submission", async () => {
    const app = await application({ status: "approved" });
    await expect(caller(applicant).authors.add({ applicationId: app.id, name: "Extra Author", email: "author@example.test" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.addFileUpload({ applicationId: app.id, userId: applicant.id, fileName: "test.pdf", fileKey: `${applicant.id}/test.pdf`, fileUrl: "", fileSize: 4 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("blocks foreign and external document references before changing a declaration", async () => {
    const app = await application({ status: "draft" });
    await expect(caller(applicant).application.saveDeclaration({ id: app.id, declarationHonesty: true, declarationNbceCertification: true, declarationConsentTruth: true, declarationAcceptPolicy: true, nbceCertificateUrl: "https://attacker.example/private-document" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("records one vote under concurrent retries and never reopens a terminal application", async () => {
    const app = await application();
    await db.submitApplicationForReview(app.id, applicant.id);
    const [review] = await db.getReviewsByApplication(app.id);
    const member = (await db.getAllCommitteeMembers()).find(m => m.id === review.committeeMemberId)!;
    const input = { reviewId: review.id, userId: member.userId, decision: "approved" as const };
    const results = await Promise.allSettled([db.recordHumanReview(input), db.recordHumanReview(input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await db.transitionApplicationStatus(app.id, ["under_review", "pending_admin"], { status: "retracted" });
    const next = (await db.getReviewsByApplication(app.id)).find(r => r.status === "pending")!;
    const nextMember = (await db.getAllCommitteeMembers()).find(m => m.id === next.committeeMemberId)!;
    await expect(db.recordHumanReview({ reviewId: next.id, userId: nextMember.userId, decision: "approved" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.getApplicationById(app.id))?.status).toBe("retracted");
  });

  it("requires institutional activation and human quorum, then commits approval once", async () => {
    const app = await application();
    await db.submitApplicationForReview(app.id, applicant.id);
    const decide = () => db.finalizeApplicationDecision({ applicationId: app.id, actorUserId: humans[0].id, decision: "approved", notes: "Synthetic human committee decision" });
    delete process.env.IRB_ISSUANCE_ENABLED;
    await expect(decide()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    process.env.IRB_ISSUANCE_ENABLED = "true";
    await expect(decide()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const reviews = await db.getReviewsByApplication(app.id);
    const members = await db.getAllCommitteeMembers();
    for (const review of reviews.slice(0, 3)) await db.recordHumanReview({ reviewId: review.id, userId: members.find(m => m.id === review.committeeMemberId)!.userId, decision: "approved" });
    const decisions = await Promise.allSettled([decide(), decide()]);
    expect(decisions.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.getApplicationById(app.id))?.irbNumber).toMatch(/^IRB-SA-\d{4}-[A-F0-9]{20}$/);
    expect((await db.getAuditLogByApplication(app.id)).filter(a => a.action === "admin_approved")).toHaveLength(1);
  });

  it("disqualifies legacy automatic seats and inactive reviewers from application access", async () => {
    const app = await application();
    const autoUser = await user("legacy-auto", "admin", "digital_reviewer");
    const autoId = await db.addCommitteeMember({ userId: autoUser.id, isActive: true });
    memberIds.push(autoId);
    expect((await db.getActiveCommitteeMembers()).some(m => m.id === autoId)).toBe(false);
    await db.createReviewAssignment({ applicationId: app.id, committeeMemberId: autoId, status: "pending", expiresAt: new Date(Date.now() + 60_000) });
    await expect(db.recordHumanReview({ reviewId: (await db.getReviewsByApplication(app.id))[0].id, userId: autoUser.id, decision: "approved" })).rejects.toThrow();
    const outsiderMember = await db.addCommitteeMember({ userId: outsider.id, isActive: false, appointedAt: new Date(), qualificationReference: "Synthetic old qualification" });
    memberIds.push(outsiderMember);
    await db.createReviewAssignment({ applicationId: app.id, committeeMemberId: outsiderMember, status: "pending", expiresAt: new Date(Date.now() + 60_000) });
    await expect(caller(outsider).application.getById({ id: app.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not expose password hashes through search or private URLs/internal IDs through registry", async () => {
    const database = (await db.getDb())!;
    await database.update(schema.users).set({ passwordHash: "synthetic-password-hash" }).where(inArray(schema.users.id, [applicant.id]));
    const users = await db.searchUsersByEmail(applicant.email!);
    expect(users[0].passwordHash).toBeNull();
    await application({ status: "approved", irbNumber: `IRB-SA-${token}`, certificateUrl: "https://private.example/signed-secret", approvedAt: new Date(), humanDecisionByUserId: humans[0].id, humanDecisionAt: new Date() });
    const registry = await db.searchPublicRegistry({ query: `IRB-SA-${token}` });
    expect(registry.items).toHaveLength(1);
    expect(registry.items[0]).not.toHaveProperty("certificateUrl");
    expect(registry.items[0]).not.toHaveProperty("id");
  });

  it("does not verify a legacy approval without human decision provenance", async () => {
    const legacy = await application({ status: "approved", irbNumber: `IRB-LEGACY-${token}`, approvedAt: new Date() });
    expect(await caller(null).verify.verifyIrb({ irbNumber: legacy.irbNumber! })).toEqual({ found: false });
    expect((await db.searchPublicRegistry({ query: legacy.irbNumber! })).items).toHaveLength(0);
  });

  it("deduplicates annual review reminders across concurrent operators", async () => {
    const approvedAt = new Date();
    approvedAt.setUTCFullYear(approvedAt.getUTCFullYear() - 1);
    const app = await application({ status: "approved", approvedAt, humanDecisionByUserId: humans[0].id, humanDecisionAt: approvedAt });
    const results = await Promise.all([db.enqueueContinuingReviewReminder(app.id, humans[0].id, 30), db.enqueueContinuingReviewReminder(app.id, humans[1].id, 30)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.getAuditLogByApplication(app.id)).filter(log => log.action === "continuing_review_reminder_sent")).toHaveLength(1);
  });

  it("does not allow repeated or unqualified amendment decisions", async () => {
    process.env.IRB_ISSUANCE_ENABLED = "true";
    const app = await application({ status: "approved", humanDecisionByUserId: humans[0].id, humanDecisionAt: new Date() });
    const amendmentId = await db.createAmendment({ applicationId: app.id, requestedByUserId: applicant.id, type: "minor", title: "Synthetic amendment", rationale: "Synthetic protocol change rationale" });
    await expect(db.decideAmendment({ id: amendmentId, actorUserId: outsider.id, decision: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const results = await Promise.allSettled([db.decideAmendment({ id: amendmentId, actorUserId: humans[0].id, decision: "approved" }), db.decideAmendment({ id: amendmentId, actorUserId: humans[1].id, decision: "rejected" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("storage key boundaries", () => {
  it.each(["../private", "/absolute", "certificates/../secret", "user/.hidden", "user//file", "user\\file", "user/%2e%2e/file", "user/file\n"])("rejects invalid key %j", key => {
    expect(() => normalizeStorageKey(key)).toThrow("Invalid storage key");
  });
  it("preserves one unambiguous valid key", () => {
    expect(normalizeStorageKey("123/2026-random-protocol.pdf")).toBe("123/2026-random-protocol.pdf");
  });
});
