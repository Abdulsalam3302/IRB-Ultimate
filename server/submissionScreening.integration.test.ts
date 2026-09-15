import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as database from "./db";
import { applications, applicationVersions, committeeMembers, notifications, reviewAssignments, users } from "../drizzle/schema";
import { applicationScreeningJobs } from "../drizzle/screeningSchema";
const mocks = vi.hoisted(() => ({ model: vi.fn(), reserve: vi.fn(), acknowledgement: vi.fn(), assignment: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.model, safeJsonParse: JSON.parse }));
vi.mock("./_core/budget", () => ({ reserveLlmCall: mocks.reserve }));
vi.mock("./emailService", () => ({ queueApplicationEmail: mocks.acknowledgement, enqueueAdministrativeEmail: mocks.assignment }));
vi.mock("./literature", () => ({ searchLiterature: vi.fn(async () => ({ items: [] })), formatLiteratureForPrompt: vi.fn(() => ""), buildLiteratureQuery: vi.fn(() => "synthetic") }));
import { STAGE1_REVIEW_FIELDS } from "./aiReview";
import { STAGE2_FIELDS } from "./services/irb.validation";
import { evaluateStageSnapshot, stageReviewFingerprint, stageReviewInput, STAGE_REVIEW_VERSION } from "./services/applicationStageReview";
import { getSubmissionScreeningStatus, parseScreeningSnapshot, runSubmissionScreeningBatch, screeningOutcome } from "./services/submissionScreening";

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const isolated = url && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_test");
let db: NonNullable<Awaited<ReturnType<typeof database.getDb>>>;
const userIds: number[] = [], appIds: number[] = [], memberIds: number[] = [];
function assessment(stage: 1 | 2) {
  return { score: 90, feedback: "Synthetic advisory assessment.", recommendations: [], hasRedFlags: false,
    fieldScores: (stage === 1 ? STAGE1_REVIEW_FIELDS : STAGE2_FIELDS).map(field => ({ field, score: 90, feedback: "Supplied evidence reviewed.", suggestion: "" })) };
}
const response = (stage: 1 | 2) => ({ choices: [{ message: { content: JSON.stringify(assessment(stage)) } }] });
const protocol = () => ({ researchType: "retrospective" as const, irbCategory: "expedited" as const, researchTitle: "Synthetic retrospective study", principalInvestigator: "Synthetic applicant", piInstitution: "Synthetic institution", piDepartment: "Research", fundingSource: "No external funding", estimatedDuration: "Six months", ...Object.fromEntries(STAGE2_FIELDS.map(field => [field, `Verified synthetic protocol evidence for ${field}.`])) });
async function fixture(options: { snapshot?: string; patch?: Record<string, unknown> } = {}) {
  const token = randomUUID();
  const owner = (await db.insert(users).values({ openId: `screening-owner-${token}`, loginMethod: "test", role: "user" }))[0].insertId;
  userIds.push(owner);
  const reviewer = (await db.insert(users).values({ openId: `screening-reviewer-${token}`, loginMethod: "test", role: "user" }))[0].insertId;
  userIds.push(reviewer);
  const member = (await db.insert(committeeMembers).values({ userId: reviewer, isActive: true, specialization: "Synthetic research ethics" }))[0].insertId; memberIds.push(member);
  const app = (await db.insert(applications).values({ applicantId: owner, status: "under_review", ...protocol() }))[0].insertId; appIds.push(app);
  await db.insert(reviewAssignments).values({ applicationId: app, committeeMemberId: member, assignedBy: "system", expiresAt: new Date(Date.now() + 3600_000) });
  const snapshot = options.snapshot ?? JSON.stringify({ ...protocol(), ...options.patch, applicantId: owner, id: app, status: "under_review" });
  await db.insert(applicationVersions).values({ applicationId: app, version: 1, snapshot, status: "under_review" });
  const job = (await db.insert(applicationScreeningJobs).values({ applicationId: app, applicantId: owner, applicationVersion: 1, snapshotJson: snapshot }))[0].insertId;
  return { owner, reviewer, app, job, snapshot };
}
const jobRow = async (id: number) => (await db.select().from(applicationScreeningJobs).where(eq(applicationScreeningJobs.id, id)))[0];
const due = async (id: number) => db.update(applicationScreeningJobs).set({ nextAttemptAt: new Date(Date.now() - 3000) }).where(eq(applicationScreeningJobs.id, id));

describe.skipIf(!isolated)("durable submission screening with isolated SQL and synthetic providers", () => {
  beforeAll(async () => { db = (await database.getDb())!; });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reserve.mockResolvedValue({ ok: true });
    mocks.model.mockImplementation(async input => response(input.response_format.json_schema.name === "stage1_review" ? 1 : 2));
    mocks.acknowledgement.mockResolvedValue({ id: null, status: "disabled" });
    mocks.assignment.mockResolvedValue({ id: null, status: "disabled" });
  });
  afterAll(async () => {
    if (appIds.length) {
      await db.delete(notifications).where(inArray(notifications.applicationId, appIds));
      await db.delete(reviewAssignments).where(inArray(reviewAssignments.applicationId, appIds));
      await db.delete(applicationVersions).where(inArray(applicationVersions.applicationId, appIds));
      await db.delete(applications).where(inArray(applications.id, appIds));
    }
    if (memberIds.length) await db.delete(committeeMembers).where(inArray(committeeMembers.id, memberIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await database.closeDatabase();
  });
  it("screens the immutable submission and keeps official decisions and applicant review fields unchanged", async () => {
    const f = await fixture();
    await db.update(applications).set({ methodology: "Later live draft value must never be sent" }).where(eq(applications.id, f.app));
    const before = (await db.select().from(applications).where(eq(applications.id, f.app)))[0];
    expect(await runSubmissionScreeningBatch({ applicationId: f.app })).toEqual({ processed: 1, outcome: "ready_for_human_decision" });
    expect(mocks.model).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.model.mock.calls)).not.toContain("Later live draft");
    expect(JSON.stringify(mocks.model.mock.calls)).toContain("Verified synthetic protocol evidence for methodology");
    expect((await db.select().from(applications).where(eq(applications.id, f.app)))[0]).toEqual(before);
    expect(await jobRow(f.job)).toMatchObject({ status: "completed", attempts: 1, leaseToken: null, leaseUntil: null });
    expect(await getSubmissionScreeningStatus(f.app)).toMatchObject({ status: "completed", outcome: "ready_for_human_decision", stage1: { status: "completed", score: 90 }, stage2: { status: "completed", score: 90 } });
    const publicResult = JSON.stringify(await getSubmissionScreeningStatus(f.app));
    expect(publicResult).not.toMatch(/snapshotJson|leaseToken|leaseUntil|notification|applicantId|worklist:/);
    expect(mocks.acknowledgement).toHaveBeenCalledWith({ applicationId: f.app, event: "submitted", eventId: `submission:${f.app}:version:1` });
    expect((await db.select().from(notifications).where(eq(notifications.applicationId, f.app)))).toHaveLength(2);
    expect(await runSubmissionScreeningBatch({ applicationId: f.app })).toEqual({ processed: 0 });
  });
  it("reuses exact validated saved assessments without provider calls or allowance reservations", async () => {
    const f = await fixture(); const app = parseScreeningSnapshot({ snapshotJson: f.snapshot, applicationId: f.app, applicantId: f.owner });
    for (const stage of [1, 2] as const) {
      const result = await evaluateStageSnapshot(stage, app, f.owner);
      app[stage === 1 ? "stage1AiFeedback" : "stage2AiFeedback"] = JSON.stringify({ ...result, reviewVersion: STAGE_REVIEW_VERSION, inputFingerprint: stageReviewFingerprint(stage, stageReviewInput(stage, app)) });
    }
    await db.update(applicationScreeningJobs).set({ snapshotJson: JSON.stringify(app) }).where(eq(applicationScreeningJobs.id, f.job));
    mocks.model.mockClear(); mocks.reserve.mockClear();
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("ready_for_human_decision");
    expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("escalates missing evidence without claiming all populated protocol fields are empty", async () => {
    const f = await fixture({ patch: { sampleSize: "50", methodology: "Existing applicant text [MISSING: recruitment procedure]" } });
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("human_review_required");
    expect(mocks.model).toHaveBeenCalledTimes(1);
    expect(await getSubmissionScreeningStatus(f.app)).toMatchObject({ status: "escalated", stage2: { status: "needs_information", score: null, issues: [{ field: "methodology", reason: "unresolved_placeholder" }] } });
  });
  it("provider outages and quota exhaustion escalate with null scores and never auto-approve", async () => {
    const f = await fixture(); mocks.reserve.mockResolvedValue({ ok: false, resetAt: "tomorrow" });
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("human_review_required");
    expect(mocks.model).not.toHaveBeenCalled();
    expect(await getSubmissionScreeningStatus(f.app)).toMatchObject({ stage1: { status: "unavailable", score: null }, stage2: { status: "unavailable", score: null } });
    expect((await db.select().from(applications).where(eq(applications.id, f.app)))[0]).toMatchObject({ status: "under_review", humanDecisionAt: null, stage1AiScore: null, stage2AiScore: null });
  });
  it("admits one of two workers for the same durable job", async () => {
    const f = await fixture(); let release!: (value: unknown) => void;
    mocks.model.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = runSubmissionScreeningBatch({ applicationId: f.app });
    await vi.waitFor(() => expect(mocks.model).toHaveBeenCalledTimes(1));
    expect(await runSubmissionScreeningBatch({ applicationId: f.app })).toEqual({ processed: 0 });
    release(response(1)); await first;
    expect(mocks.model).toHaveBeenCalledTimes(2); expect((await jobRow(f.job)).attempts).toBe(1);
  });
  it("recovers an expired lease after an interrupted process", async () => {
    const f = await fixture();
    await db.update(applicationScreeningJobs).set({ status: "running", leaseToken: randomUUID(), attempts: 1, leaseUntil: new Date(Date.now() - 2000), nextAttemptAt: new Date(Date.now() - 2000) }).where(eq(applicationScreeningJobs.id, f.job));
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("ready_for_human_decision");
    expect(await jobRow(f.job)).toMatchObject({ attempts: 2, status: "completed", leaseToken: null });
  });
  it("a stale worker cannot overwrite the new lease holder's completed result", async () => {
    const f = await fixture(); let release!: (value: unknown) => void;
    mocks.model.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const stale = runSubmissionScreeningBatch({ applicationId: f.app });
    await vi.waitFor(() => expect(mocks.model).toHaveBeenCalledTimes(1));
    await db.update(applicationScreeningJobs).set({ leaseUntil: new Date(Date.now() - 2000), nextAttemptAt: new Date(Date.now() - 2000) }).where(eq(applicationScreeningJobs.id, f.job));
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("ready_for_human_decision");
    const completed = await jobRow(f.job);
    release(response(1)); expect((await stale).outcome).toBe("superseded");
    expect(await jobRow(f.job)).toEqual(completed);
    expect(mocks.model).toHaveBeenCalledTimes(3); expect(mocks.reserve).toHaveBeenCalledTimes(3);
    expect((await db.select().from(notifications).where(eq(notifications.applicationId, f.app)))).toHaveLength(2);
  });
  it("rejects a superseded submission's in-flight model result", async () => {
    const f = await fixture();
    mocks.model.mockImplementationOnce(async () => { await db.insert(applicationVersions).values({ applicationId: f.app, version: 2, snapshot: f.snapshot, status: "under_review" }); return response(1); });
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("superseded");
    expect(mocks.model).toHaveBeenCalledTimes(1); expect(await jobRow(f.job)).toMatchObject({ status: "escalated", lastErrorCode: "submission_superseded" });
    expect(await getSubmissionScreeningStatus(f.app)).toBeNull();
  });
  it("an account erased during provider work cannot recreate a private screening result", async () => {
    const f = await fixture();
    mocks.model.mockImplementationOnce(async () => { await db.update(users).set({ loginMethod: "deleted" }).where(eq(users.id, f.owner)); return response(1); });
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("superseded");
    expect(await jobRow(f.job)).toBeUndefined(); expect(mocks.model).toHaveBeenCalledTimes(1);
  });
  it("mail queue failure does not block screening, while retries reuse assessments and in-app receipts", async () => {
    const f = await fixture(); mocks.acknowledgement.mockRejectedValueOnce(new Error("Sensitive provider detail must not escape"));
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("ready_for_human_decision");
    expect(await jobRow(f.job)).toMatchObject({ status: "pending", lastErrorCode: "notification_enqueue_unavailable" });
    expect(await getSubmissionScreeningStatus(f.app)).toMatchObject({ status: "completed", outcome: "ready_for_human_decision" });
    await due(f.job); await runSubmissionScreeningBatch({ applicationId: f.app });
    expect(mocks.model).toHaveBeenCalledTimes(2); expect(mocks.reserve).toHaveBeenCalledTimes(2);
    expect((await db.select().from(notifications).where(eq(notifications.applicationId, f.app)))).toHaveLength(2);
    expect(await jobRow(f.job)).toMatchObject({ status: "completed", attempts: 2, lastErrorCode: null });
    expect(JSON.stringify(await getSubmissionScreeningStatus(f.app))).not.toContain("Sensitive provider");
  });
  it("notification retries stop after three attempts without retrying already escalated AI outages", async () => {
    const f = await fixture(); mocks.acknowledgement.mockRejectedValue(new Error("Synthetic unavailable queue")); mocks.reserve.mockResolvedValue({ ok: false, resetAt: "tomorrow" });
    for (let i = 0; i < 3; i++) { await due(f.job); await runSubmissionScreeningBatch({ applicationId: f.app }); }
    expect(mocks.reserve).toHaveBeenCalledTimes(2); expect(mocks.model).not.toHaveBeenCalled();
    expect(await jobRow(f.job)).toMatchObject({ attempts: 3, status: "escalated" });
    await due(f.job); expect(await runSubmissionScreeningBatch({ applicationId: f.app })).toEqual({ processed: 0 });
    expect((await db.select().from(notifications).where(eq(notifications.applicationId, f.app)))).toHaveLength(2);
  });
  it("rejects malformed snapshots and duplicate version jobs", async () => {
    const f = await fixture({ snapshot: "{broken" });
    await expect(db.insert(applicationScreeningJobs).values({ applicationId: f.app, applicantId: f.owner, applicationVersion: 1, snapshotJson: f.snapshot })).rejects.toThrow();
    expect((await runSubmissionScreeningBatch({ applicationId: f.app })).outcome).toBe("human_review_required");
    expect(mocks.model).not.toHaveBeenCalled(); expect(await jobRow(f.job)).toMatchObject({ status: "escalated", lastErrorCode: "invalid_snapshot" });
  });
  it("a forged completion marker cannot upgrade invalid assessment details in the public projection", async () => {
    const f = await fixture();
    await db.update(applicationScreeningJobs).set({ status: "completed", resultJson: JSON.stringify({ outcome: "ready_for_human_decision", stage1: { status: "completed", score: 100, passed: true }, stage2: { status: "completed", score: 100, passed: true }, snapshotJson: "sensitive", leaseToken: "private" }) }).where(eq(applicationScreeningJobs.id, f.job));
    expect(await getSubmissionScreeningStatus(f.app)).toMatchObject({ status: "escalated", outcome: "human_review_required", stage1: { score: null }, stage2: { score: null } });
  });
  it("physical deletion cascades private snapshot jobs", async () => {
    const f = await fixture(); await db.delete(applications).where(eq(applications.id, f.app));
    expect(await jobRow(f.job)).toBeUndefined();
  });
});

describe("submission snapshot and advisory authority boundaries", () => {
  it("JSON cannot replace durable identity, status, or decision bindings", () => {
    const snapshot = parseScreeningSnapshot({ snapshotJson: JSON.stringify({ ...protocol(), id: 99, applicantId: 999, status: "approved", humanDecisionByUserId: 1 }), applicationId: 1, applicantId: 2 });
    expect(snapshot).toMatchObject({ id: 1, applicantId: 2 }); expect(snapshot.status).toBeUndefined(); expect(snapshot.humanDecisionByUserId).toBeUndefined();
  });
  it("invalid or oversized snapshots never become partial models of a submission", () => {
    for (const snapshotJson of ["[]", "{", JSON.stringify({ methodology: 5 }), JSON.stringify({ methodology: "x".repeat(1_000_001) })]) expect(() => parseScreeningSnapshot({ snapshotJson, applicationId: 1, applicantId: 2 })).toThrow();
  });
  it("red flags, scores below70, unknown results and failed checks all require human review", () => {
    const pass = { ...assessment(1), status: "completed", passed: true, issues: [] } as const;
    expect(screeningOutcome(pass, pass)).toBe("ready_for_human_decision");
    for (const changed of [{ ...pass, score: 69 }, { ...pass, passed: false }, { ...pass, hasRedFlags: true }, { ...pass, status: "unavailable", score: null }]) expect(screeningOutcome(pass, changed as never)).toBe("human_review_required");
  });
});
