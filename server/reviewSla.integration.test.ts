import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as database from "./db";
import { applications, auditLog, committeeMembers, notifications, reviewAssignments, users } from "../drizzle/schema";
const mocks = vi.hoisted(() => ({ mail: vi.fn() }));
vi.mock("./emailService", () => ({ enqueueAdministrativeEmail: mocks.mail }));
import { notifyScreeningEscalation, reassignExpiredReviews, runReviewSlaSweep } from "./services/reviewSla";

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const isolated = url && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_test");
let db: NonNullable<Awaited<ReturnType<typeof database.getDb>>>;
const userIds: number[] = [], appIds: number[] = [], memberIds: number[] = [];
const HOUR = 3600_000;
// Sweeps are scoped to this suite's applications and reviewers: suites share one database and run in parallel.
const sweep = (ids: number[]) => runReviewSlaSweep(new Date(), { applicationIds: ids, committeeMemberIds: memberIds });

async function user(role: "user" | "admin" = "user") {
  const id = (await db.insert(users).values({ openId: `sla-${randomUUID()}`, loginMethod: "test", role, email: `${randomUUID()}@example.test` }))[0].insertId;
  userIds.push(id); return id;
}
async function reviewer(totalAssignments = 0) {
  const userId = await user();
  const id = (await db.insert(committeeMembers).values({ userId, isActive: true, appointedAt: new Date(), qualificationReference: "Synthetic appointment reference", totalAssignments }))[0].insertId;
  memberIds.push(id); return { userId, id };
}
async function application(applicantId: number, submittedHoursAgo: number, irbCategory: "full_board" | "expedited" = "expedited") {
  const id = (await db.insert(applications).values({ applicantId, status: "under_review", irbCategory, researchTitle: "Synthetic SLA study", submittedAt: new Date(Date.now() - submittedHoursAgo * HOUR) }))[0].insertId;
  appIds.push(id); return id;
}
async function lapse(applicationId: number, committeeMemberId: number) {
  await db.insert(reviewAssignments).values({ applicationId, committeeMemberId, assignedBy: "system", status: "pending", assignedAt: new Date(Date.now() - 25 * HOUR), expiresAt: new Date(Date.now() - HOUR) });
}
const assignmentsFor = (applicationId: number) => db.select().from(reviewAssignments).where(eq(reviewAssignments.applicationId, applicationId));
const live = async (applicationId: number) => (await assignmentsFor(applicationId)).filter(row => row.status === "pending" && row.expiresAt.getTime() > Date.now());
const noticesFor = (applicationId: number, userId: number) => db.select().from(notifications).where(and(eq(notifications.applicationId, applicationId), eq(notifications.userId, userId)));

describe.skipIf(!isolated)("24-hour review service standard with isolated SQL", () => {
  beforeAll(async () => { db = (await database.getDb())!; });
  beforeEach(() => { vi.resetAllMocks(); mocks.mail.mockResolvedValue({ id: null, status: "disabled" }); });
  afterAll(async () => {
    if (appIds.length) {
      await db.delete(notifications).where(inArray(notifications.applicationId, appIds));
      await db.delete(reviewAssignments).where(inArray(reviewAssignments.applicationId, appIds));
      await db.delete(applications).where(inArray(applications.id, appIds));
    }
    await db.delete(auditLog).where(eq(auditLog.action, "review_sla_reassign"));
    if (memberIds.length) await db.delete(committeeMembers).where(inArray(committeeMembers.id, memberIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await database.closeDatabase();
  });

  it("reassigns a lapsed review to the least-loaded independent reviewer and escalates once to admins", async () => {
    const applicant = await user();
    const admin = await user("admin");
    const lapsed = await reviewer(0);
    const busy = await reviewer(1_000_000);
    await reviewer(1); // a less-loaded independent reviewer must be preferred over the busy one
    const app = await application(applicant, 30);
    await lapse(app, lapsed.id);

    const first = await sweep([app]);
    expect(first.expired).toBe(1);
    const rows = await assignmentsFor(app);
    expect(rows.find(row => row.committeeMemberId === lapsed.id)?.status).toBe("expired");
    const current = await live(app);
    expect(current).toHaveLength(1);
    expect([lapsed.id, busy.id]).not.toContain(current[0].committeeMemberId);
    expect(current[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ eventId: `review-sla:assigned:${current[0].id}` }));
    expect((await noticesFor(app, admin)).map(row => row.title)).toEqual([expect.stringContaining("24-hour review target missed")]);
    expect(await noticesFor(app, applicant)).toHaveLength(0);
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ userId: admin, eventId: expect.stringMatching(/^review-sla:overdue:/) }));

    mocks.mail.mockClear();
    await sweep([app]);
    expect(await noticesFor(app, admin)).toHaveLength(1);
    expect(await live(app)).toHaveLength(1);
    expect(mocks.mail).not.toHaveBeenCalledWith(expect.objectContaining({ userId: admin }));
  });

  it("never creates duplicate live assignments when sweeps run concurrently", async () => {
    const applicant = await user();
    const lapsed = await reviewer(0);
    const app = await application(applicant, 2);
    await lapse(app, lapsed.id);
    await Promise.all([1, 2, 3, 4].map(() => reassignExpiredReviews(null, { applicationIds: [app], committeeMemberIds: memberIds })));
    expect(await live(app)).toHaveLength(1);
  });

  it("restores a full-board application to five reviewers, counting votes already cast", async () => {
    const applicant = await user();
    const members = await Promise.all([0, 1, 2, 3, 4, 5, 6].map(() => reviewer(0)));
    const app = await application(applicant, 3, "full_board");
    await db.insert(reviewAssignments).values({ applicationId: app, committeeMemberId: members[0].id, assignedBy: "system", status: "approved", assignedAt: new Date(Date.now() - 25 * HOUR), expiresAt: new Date(Date.now() - HOUR) });
    for (const member of members.slice(1, 5)) await lapse(app, member.id);
    const result = await sweep([app]);
    expect(result.expired).toBe(4);
    const current = await live(app);
    expect(current).toHaveLength(4);
    expect(current.map(row => row.committeeMemberId)).not.toContain(members[0].id);
  });

  it("heals an application orphaned without any live assignment", async () => {
    const applicant = await user();
    const member = await reviewer(0);
    const app = await application(applicant, 1);
    await db.insert(reviewAssignments).values({ applicationId: app, committeeMemberId: member.id, assignedBy: "system", status: "expired", assignedAt: new Date(Date.now() - 30 * HOUR), expiresAt: new Date(Date.now() - 6 * HOUR) });
    const result = await sweep([app]);
    expect(result.reassigned + result.renewed).toBe(1);
    expect(await live(app)).toHaveLength(1);
  });

  it("reminds a reviewer once when an assignment is due within six hours", async () => {
    const applicant = await user();
    const member = await reviewer(0);
    const app = await application(applicant, 20);
    await db.insert(reviewAssignments).values({ applicationId: app, committeeMemberId: member.id, assignedBy: "system", status: "pending", assignedAt: new Date(Date.now() - 20 * HOUR), expiresAt: new Date(Date.now() + 4 * HOUR) });
    await sweep([app]);
    await sweep([app]);
    const reminders = (await noticesFor(app, member.userId)).filter(row => row.type === "review_reminder");
    expect(reminders).toHaveLength(1);
    expect(mocks.mail.mock.calls.filter(([input]) => String(input.eventId).startsWith("review-sla:due-soon:"))).toHaveLength(1);
  });

  it("escalates resubmissions that still carry an earlier decision timestamp", async () => {
    const applicant = await user();
    const admin = await user("admin");
    const member = await reviewer(0);
    const app = await application(applicant, 30);
    await db.update(applications).set({ humanDecisionAt: new Date(Date.now() - 40 * HOUR) }).where(eq(applications.id, app));
    await db.insert(reviewAssignments).values({ applicationId: app, committeeMemberId: member.id, assignedBy: "system", status: "pending", expiresAt: new Date(Date.now() + 20 * HOUR) });
    expect((await sweep([app])).escalations).toBe(1);
    expect(await noticesFor(app, admin)).toHaveLength(1);
  });

  it("escalates screening findings to administrators once per version and never to the applicant", async () => {
    const applicant = await user("admin");
    const admin = await user("admin");
    const app = await application(applicant, 0);
    await notifyScreeningEscalation(app, 1, applicant);
    await notifyScreeningEscalation(app, 1, applicant);
    await notifyScreeningEscalation(app, 2, applicant);
    const titles = (await noticesFor(app, admin)).map(row => row.title);
    expect(titles).toHaveLength(2);
    expect(titles.every(title => title.startsWith("Screening flagged items"))).toBe(true);
    expect(await noticesFor(app, applicant)).toHaveLength(0);
  });
});
