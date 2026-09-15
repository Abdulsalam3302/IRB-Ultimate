import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TrpcContext } from "../_core/context";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  allow: vi.fn(),
  pdf: vi.fn(),
}));
vi.mock("./transport", async actual => ({
  ...(await actual<typeof import("./transport")>()),
  sendMail: mocks.send,
}));
vi.mock("../_core/requestLimits", () => ({ consumeRateLimit: mocks.allow }));
vi.mock("../certificateV2", () => ({ renderCertificatePdf: mocks.pdf }));
vi.mock("../_core/env", async actual => {
  const original = await actual<typeof import("../_core/env")>();
  return {
    ENV: {
      ...original.ENV,
      ownerOpenId: "email-test-owner",
      isProduction: false,
    },
  };
});
import { getDb } from "../db";
import { passwordResetTokens } from "../../drizzle/authSchema";
import {
  users,
  emailOutbox,
  emailSuppressions,
  emailDeliveryEvents,
  emailCampaigns,
  applications,
} from "../../drizzle/schema";
import {
  enqueueMail,
  runEmailOutboxBatch,
  recordDeliveryEvent,
  suppressRecipient,
  cancelAccountEmails,
  cancelPendingPasswordResetEmails,
} from "./outbox";
import { queueApplicationEmail, queuePasswordResetEmail } from "./events";
import { mailAdminRouter } from "./adminRouter";
import { mailConfig } from "./config";
import { brandedMail } from "./templates";
import { recipientHash } from "./crypto";

const databaseUrl = process.env.DATABASE_URL || "";
const isolated =
  !!databaseUrl &&
  ["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname) &&
  new URL(databaseUrl).pathname.endsWith("_test");
const suite = describe.skipIf(!isolated);
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
const ids: number[] = [],
  apps: number[] = [],
  campaigns: string[] = [],
  eventIds: string[] = [];
let uid: number, email: string;
async function account() {
  const token = randomUUID();
  const inserted = await db
    .insert(users)
    .values({
      openId: `email-${token}`,
      email: `email-${token}@example.test`,
      loginMethod: "password",
      role: "user",
    })
    .$returningId();
  ids.push(inserted[0].id);
  return { id: inserted[0].id, email: `email-${token}@example.test` };
}
async function enqueue(
  eventId = randomUUID(),
  category: "transactional" | "bulk" = "transactional"
) {
  const payload = brandedMail(
    {
      to: email,
      subjectEn: "Test",
      subjectAr: "اختبار",
      titleEn: "Notice",
      titleAr: "إشعار",
      bodyEn: "Synthetic",
      bodyAr: "تجريبي",
      unsubscribeUrl:
        category === "bulk"
          ? "https://irb.example.test/api/email/unsubscribe/test"
          : undefined,
    },
    mailConfig()!
  );
  return enqueueMail({
    userId: uid,
    eventId,
    kind: "integration",
    category,
    payload,
  });
}
async function row(id: string) {
  return (await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)))[0];
}
async function due(id: string) {
  await db
    .update(emailOutbox)
    .set({ nextAttemptAt: new Date(Date.now() - 2000) })
    .where(eq(emailOutbox.id, id));
}
function caller(role = "admin", openId = "email-test-owner") {
  return mailAdminRouter.createCaller({
    user: { id: uid, openId, role, authLevel: "aal1" },
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
}
const copy = {
  subjectEn: "Account update",
  subjectAr: "تحديث الحساب",
  bodyEn: "Optional synthetic update",
  bodyAr: "تحديث اختياري تجريبي",
};

suite("durable email delivery with isolated SQL and mocked providers", () => {
  beforeAll(async () => {
    db = (await getDb())!;
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("MAIL_PROVIDER", "resend");
    vi.stubEnv("MAIL_ENCRYPTION_KEY", "34".repeat(32));
    vi.stubEnv("RESEND_API_KEY", "synthetic-key");
    vi.stubEnv("MAIL_FROM", "committee@irb-sa.org");
    vi.stubEnv("PUBLIC_APP_URL", "https://irb.example.test");
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    mocks.allow.mockResolvedValue({ allowed: true, retryAfter: 1 });
    mocks.send.mockImplementation(async () => ({
      outcome: "accepted",
      providerId: `synthetic_${randomUUID()}`,
    }));
    mocks.pdf.mockResolvedValue(
      Buffer.from("%PDF-1.4\nSynthetic test certificate")
    );
    const user = await account();
    uid = user.id;
    email = user.email;
  });
  afterEach(async () => {
    const rows = await db
      .select({
        hash: emailOutbox.recipientHash,
        providerId: emailOutbox.providerId,
      })
      .from(emailOutbox)
      .where(inArray(emailOutbox.userId, ids));
    for (const r of rows) {
      await db
        .delete(emailSuppressions)
        .where(eq(emailSuppressions.recipientHash, r.hash));
      if (r.providerId)
        await db
          .delete(emailDeliveryEvents)
          .where(eq(emailDeliveryEvents.providerId, r.providerId));
    }
    if (eventIds.length)
      await db
        .delete(emailDeliveryEvents)
        .where(inArray(emailDeliveryEvents.id, eventIds.splice(0)));
    await db.delete(emailOutbox).where(inArray(emailOutbox.userId, ids));
    await db
      .delete(passwordResetTokens)
      .where(inArray(passwordResetTokens.userId, ids));
    if (campaigns.length)
      await db
        .delete(emailCampaigns)
        .where(inArray(emailCampaigns.id, campaigns.splice(0)));
    if (apps.length)
      await db
        .delete(applications)
        .where(inArray(applications.id, apps.splice(0)));
    await db.delete(users).where(inArray(users.id, ids.splice(0)));
    vi.unstubAllEnvs();
  });
  it("deduplicates concurrent enqueue attempts before any provider request", async () => {
    const event = randomUUID(),
      results = await Promise.all(
        Array.from({ length: 6 }, () => enqueue(event))
      );
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
    const saved = await row(results[0].id!);
    expect(saved.payload).not.toContain(email);
    expect(saved.status).toBe("queued");
  });
  it("concurrent workers claim once and record acceptance without claiming delivery", async () => {
    const queued = await enqueue();
    await Promise.all([runEmailOutboxBatch(1), runEmailOutboxBatch(1)]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(await row(queued.id!)).toMatchObject({
      status: "accepted",
      payload: null,
      attempts: 1,
      deliveredAt: null,
    });
  });
  it("uses the same dispatch ID and payload after an uncertain Resend attempt", async () => {
    const queued = await enqueue();
    mocks.send.mockResolvedValueOnce({
      outcome: "retry",
      code: "uncertain",
      ambiguous: true,
    });
    await runEmailOutboxBatch(1);
    expect((await row(queued.id!)).status).toBe("queued");
    await due(queued.id!);
    await runEmailOutboxBatch(1);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][1]).toBe(mocks.send.mock.calls[1][1]);
    expect(mocks.send.mock.calls[0][0]).toEqual(mocks.send.mock.calls[1][0]);
  });
  it("never retries beyond the Resend idempotency window", async () => {
    const queued = await enqueue();
    await db
      .update(emailOutbox)
      .set({
        status: "sending",
        firstDispatchAt: new Date(Date.now() - 24 * 3600_000),
        nextAttemptAt: new Date(Date.now() - 2000),
      })
      .where(eq(emailOutbox.id, queued.id!));
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect((await row(queued.id!)).status).toBe("unknown");
  });
  it("never replays a crashed SMTP dispatch without a portable idempotency guarantee", async () => {
    vi.stubEnv("MAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "synthetic");
    vi.stubEnv("SMTP_PASSWORD", "synthetic");
    const queued = await enqueue();
    await db
      .update(emailOutbox)
      .set({
        status: "sending",
        firstDispatchAt: new Date(),
        nextAttemptAt: new Date(Date.now() - 2000),
      })
      .where(eq(emailOutbox.id, queued.id!));
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect((await row(queued.id!)).status).toBe("unknown");
  });
  it("does not falsely call an already-dispatched message cancelled after erasure", async () => {
    const queued = await enqueue();
    await db
      .update(emailOutbox)
      .set({ status: "sending", firstDispatchAt: new Date() })
      .where(eq(emailOutbox.id, queued.id!));
    await cancelAccountEmails(db, uid);
    expect(await row(queued.id!)).toMatchObject({
      status: "unknown",
      payload: null,
      lastCode: "account_erased",
    });
  });
  it("prioritizes transactional messages and reserves daily capacity from optional campaigns", async () => {
    const optional = await enqueue(undefined, "bulk"),
      transactional = await enqueue();
    mocks.allow.mockImplementation(async (scope: string) => ({
      allowed: scope !== "mail-bulk-daily",
      retryAfter: 60,
    }));
    await runEmailOutboxBatch(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await row(transactional.id!)).status).toBe("accepted");
    await runEmailOutboxBatch(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await row(optional.id!)).status).toBe("queued");
    expect(mocks.allow).toHaveBeenCalledWith(
      "mail-bulk-daily",
      "platform",
      70,
      86400_000
    );
  });
  it("refuses replay after provider credentials or sender configuration changes", async () => {
    const queued = await enqueue();
    vi.stubEnv("RESEND_API_KEY", "another-provider-account");
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await row(queued.id!)).toMatchObject({
      status: "failed",
      lastCode: "transport_configuration_changed",
    });
  });
  it("suppresses queued optional mail after unsubscribe, while retaining transactional mail", async () => {
    const optional = await enqueue(undefined, "bulk"),
      transactional = await enqueue();
    await suppressRecipient(
      recipientHash(email, mailConfig()!),
      false,
      "unsubscribed"
    );
    await runEmailOutboxBatch(1);
    await runEmailOutboxBatch(1);
    expect((await row(optional.id!)).status).toBe("suppressed");
    expect((await row(transactional.id!)).status).toBe("accepted");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("persists bounced suppression for all mail and cannot downgrade it via later delivered events", async () => {
    const queued = await enqueue();
    await runEmailOutboxBatch(1);
    const saved = await row(queued.id!);
    const bounce = `evt_${randomUUID()}`,
      delivered = `evt_${randomUUID()}`;
    eventIds.push(bounce, delivered);
    await recordDeliveryEvent(bounce, saved.providerId!, "email.bounced");
    await recordDeliveryEvent(delivered, saved.providerId!, "email.delivered");
    expect((await row(queued.id!)).status).toBe("bounced");
    expect((await enqueue()).status).toBe("suppressed");
  });
  it("reconciles a signed provider event that arrived before acceptance was persisted", async () => {
    const providerId = `synthetic_${randomUUID()}`,
      event = `evt_${randomUUID()}`;
    eventIds.push(event);
    await recordDeliveryEvent(event, providerId, "email.delivered");
    mocks.send.mockResolvedValue({ outcome: "accepted", providerId });
    const queued = await enqueue();
    await runEmailOutboxBatch(1);
    expect((await row(queued.id!)).status).toBe("delivered");
  });
  it("cancels expired reset links without calling a provider", async () => {
    const queued = await queuePasswordResetEmail({
      userId: uid,
      eventId: randomUUID(),
      resetUrl: `https://irb.example.test/reset-password#token=${"ab".repeat(32)}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db
      .update(emailOutbox)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(emailOutbox.id, queued.id!));
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await row(queued.id!)).toMatchObject({
      status: "cancelled",
      payload: null,
    });
  });
  it.each(["missing", "other_user", "expired", "consumed"])(
    "does not dispatch a reset token whose current binding is %s",
    async state => {
      const token = randomBytes(32).toString("hex"),
        tokenHash = createHash("sha256").update(token).digest("hex");
      const other = state === "other_user" ? await account() : null;
      if (state !== "missing")
        await db
          .insert(passwordResetTokens)
          .values({
            userId: other?.id ?? uid,
            tokenHash,
            expiresAt: new Date(
              Date.now() + (state === "expired" ? -5000 : 60_000)
            ),
            consumedAt: state === "consumed" ? new Date() : null,
          });
      const queued = await queuePasswordResetEmail({
        userId: uid,
        eventId: randomUUID(),
        resetUrl: `https://irb.example.test/reset-password#token=${token}`,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await runEmailOutboxBatch(1);
      expect(mocks.send).not.toHaveBeenCalled();
      expect(await row(queued.id!)).toMatchObject({
        status: "cancelled",
        payload: null,
        lastCode: "password_reset_invalidated",
      });
    }
  );
  it("dispatches an exact live reset token and keeps its raw secret out of plaintext database columns", async () => {
    const token = randomBytes(32).toString("hex"),
      tokenHash = createHash("sha256").update(token).digest("hex");
    await db
      .insert(passwordResetTokens)
      .values({
        userId: uid,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      });
    const queued = await queuePasswordResetEmail({
      userId: uid,
      eventId: randomUUID(),
      resetUrl: `https://irb.example.test/reset-password#token=${token}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(JSON.stringify(await row(queued.id!))).not.toContain(token);
    await runEmailOutboxBatch(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].passwordReset).toEqual({
      userId: uid,
      tokenHash,
    });
    expect(mocks.send.mock.calls[0][0].text).toContain(
      "invalidates previous links"
    );
    expect((await row(queued.id!)).status).toBe("accepted");
  });
  it("rechecks reset validity after worker claim and immediately before provider admission", async () => {
    const token = randomBytes(32).toString("hex"),
      tokenHash = createHash("sha256").update(token).digest("hex");
    await db
      .insert(passwordResetTokens)
      .values({
        userId: uid,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      });
    const queued = await queuePasswordResetEmail({
      userId: uid,
      eventId: randomUUID(),
      resetUrl: `https://irb.example.test/reset-password#token=${token}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.allow.mockImplementationOnce(async () => {
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash));
      return { allowed: true, retryAfter: 1 };
    });
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect((await row(queued.id!)).lastCode).toBe("password_reset_invalidated");
  });
  it("cancels superseded queued reset messages while preserving a prior dispatch's uncertainty", async () => {
    const input = {
      userId: uid,
      resetUrl: `https://irb.example.test/reset-password#token=${"cd".repeat(32)}`,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const queued = await queuePasswordResetEmail({
        ...input,
        eventId: randomUUID(),
      }),
      uncertain = await queuePasswordResetEmail({
        ...input,
        eventId: randomUUID(),
      });
    await db
      .update(emailOutbox)
      .set({ firstDispatchAt: new Date(), status: "sending" })
      .where(eq(emailOutbox.id, uncertain.id!));
    await db.transaction(async tx => {
      await tx.select().from(users).where(eq(users.id, uid)).for("update");
      await cancelPendingPasswordResetEmails(tx, uid);
    });
    expect(await row(queued.id!)).toMatchObject({
      status: "cancelled",
      payload: null,
    });
    expect(await row(uncertain.id!)).toMatchObject({
      status: "unknown",
      payload: null,
    });
    await runEmailOutboxBatch(2);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rechecks recipient identity and cancels on account email changes or erasure", async () => {
    const queued = await enqueue();
    await db
      .update(users)
      .set({ email: "changed@example.test" })
      .where(eq(users.id, uid));
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect((await row(queued.id!)).status).toBe("cancelled");
    await db.update(users).set({ email }).where(eq(users.id, uid));
    const second = await enqueue();
    await db.transaction(async tx => {
      await tx.select().from(users).where(eq(users.id, uid)).for("update");
      await cancelAccountEmails(tx, uid);
    });
    expect(await row(second.id!)).toMatchObject({
      status: "cancelled",
      payload: null,
    });
  });
  it("does not dispatch when shared pacing or daily allowance is unavailable", async () => {
    const queued = await enqueue();
    mocks.allow.mockResolvedValue({
      allowed: false,
      retryAfter: 60,
      unavailable: true,
    });
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await row(queued.id!)).toMatchObject({
      status: "queued",
      attempts: 0,
      firstDispatchAt: null,
    });
  });
  it("generates a real PDF attachment only for the bound final human decision, and cancels a changed decision", async () => {
    const inserted = await db
      .insert(applications)
      .values({
        applicantId: uid,
        status: "approved",
        irbNumber: `IRB-TEST-${randomUUID()}`,
        approvedAt: new Date(),
        humanDecisionAt: new Date(),
        humanDecisionByUserId: uid,
      })
      .$returningId();
    const appId = inserted[0].id;
    apps.push(appId);
    const queued = await queueApplicationEmail({
      applicationId: appId,
      event: "approved",
    });
    await runEmailOutboxBatch(1);
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].attachments).toHaveLength(1);
    expect((await row(queued.id!)).status).toBe("accepted");
    const changed = await queueApplicationEmail({
      applicationId: appId,
      event: "approved",
      eventId: randomUUID(),
    });
    await db
      .update(applications)
      .set({ status: "retracted", retractedAt: new Date() })
      .where(eq(applications.id, appId));
    await runEmailOutboxBatch(1);
    expect((await row(changed.id!)).lastCode).toBe("decision_changed");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not replace certificate preparation failure with a certificate-free decision email", async () => {
    const inserted = await db
      .insert(applications)
      .values({
        applicantId: uid,
        status: "rejected",
        humanDecisionAt: new Date(),
        humanDecisionByUserId: uid,
      })
      .$returningId();
    apps.push(inserted[0].id);
    const queued = await queueApplicationEmail({
      applicationId: inserted[0].id,
      event: "rejected",
    });
    mocks.pdf.mockRejectedValue(new Error("Synthetic renderer unavailable"));
    await runEmailOutboxBatch(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await row(queued.id!)).toMatchObject({
      status: "queued",
      lastCode: "certificate_preparation_unavailable",
    });
  });
  it("does not treat legacy approvals lacking human provenance as emailable decisions", async () => {
    const inserted = await db
      .insert(applications)
      .values({ applicantId: uid, status: "approved" })
      .$returningId();
    apps.push(inserted[0].id);
    await expect(
      queueApplicationEmail({
        applicationId: inserted[0].id,
        event: "approved",
      })
    ).rejects.toThrow(/provenance/);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("returns a private paginated directory and blocks secondary admins from preparing bulk sends", async () => {
    const result = await caller().directory({
      search: email,
      page: 1,
      pageSize: 10,
      role: "all",
    });
    expect(result.total).toBe(1);
    expect(result.accounts[0].email).toBe(email);
    expect(result.accounts[0]).not.toHaveProperty("passwordHash");
    await expect(
      caller("admin", "secondary-admin").preview({
        copy,
        audience: { search: email, role: "all" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires preview and exact confirmation, snapshots recipients, and never sends during preparation", async () => {
    const preview = await caller().preview({
      copy,
      audience: { search: email, role: "all" },
    });
    campaigns.push(preview.id);
    expect(preview.recipientCount).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
    await expect(
      caller().confirm({
        id: preview.id,
        confirmation: "yes",
        authorizedAudience: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const first = await caller().confirm({
        id: preview.id,
        confirmation: preview.confirmation,
        authorizedAudience: true,
      }),
      second = await caller().confirm({
        id: preview.id,
        confirmation: preview.confirmation,
        authorizedAudience: true,
      });
    expect(first).toEqual(second);
    expect(first.queuedCount).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(
      (await db.select().from(emailOutbox).where(eq(emailOutbox.userId, uid)))
        .length
    ).toBe(1);
  });
  it("does not send a previewed message to a later replacement email address", async () => {
    const preview = await caller().preview({
      copy,
      audience: { search: email, role: "all" },
    });
    campaigns.push(preview.id);
    await db
      .update(users)
      .set({ email: "replacement@example.test" })
      .where(eq(users.id, uid));
    const confirmed = await caller().confirm({
      id: preview.id,
      confirmation: preview.confirmation,
      authorizedAudience: true,
    });
    expect(confirmed.queuedCount).toBe(0);
    expect(confirmed.skippedCount).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
