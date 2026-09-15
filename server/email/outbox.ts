import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  applications,
  emailDeliveryEvents,
  emailCampaigns,
  emailOutbox,
  emailSuppressions,
  users,
  type EmailOutboxRow,
} from "../../drizzle/schema";
import { consumeRateLimit } from "../_core/requestLimits";
import { passwordResetTokens } from "../../drizzle/authSchema";
import { mailConfig, normalizedEmail } from "./config";
import { decryptMail, encryptMail, recipientHash } from "./crypto";
import {
  mailPayloadSchema,
  validatePdfAttachment,
  type MailPayload,
} from "./templates";
import { sendMail, transportHash, type DeliveryResult } from "./transport";

export type QueueResult = {
  id: string | null;
  status: EmailOutboxRow["status"] | "disabled";
};
async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Email delivery storage is unavailable.",
    });
  return db;
}
export async function enqueueMail(input: {
  userId: number;
  eventId: string;
  kind: string;
  category: "transactional" | "bulk";
  payload: MailPayload;
  expiresAt?: Date;
}): Promise<QueueResult> {
  const config = mailConfig();
  if (!config) return { id: null, status: "disabled" };
  if (
    !Number.isSafeInteger(input.userId) ||
    input.userId < 1 ||
    !input.eventId ||
    input.eventId.length > 200 ||
    !/^[a-z_]{1,40}$/.test(input.kind)
  )
    throw new Error("Invalid email event");
  const payload = mailPayloadSchema.parse(input.payload);
  if (input.category === "bulk" && !payload.unsubscribeUrl)
    throw new Error("Optional email requires unsubscribe");
  const id = randomUUID(),
    hash = recipientHash(payload.to, config),
    dedupeKey = createHash("sha256")
      .update(`${input.userId}:${input.kind}:${input.eventId}`)
      .digest("hex");
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 7 * 86400_000);
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= new Date() ||
    expiresAt.getTime() > Date.now() + 8 * 86400_000
  )
    throw new Error("Invalid email expiry");
  const db = await database();
  return db.transaction(async tx => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update");
    if (
      !user ||
      user.loginMethod === "deleted" ||
      !user.email ||
      recipientHash(user.email, config) !== hash
    )
      return { id: null, status: "suppressed" as const };
    const [existing] = await tx
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.dedupeKey, dedupeKey));
    if (existing) return { id: existing.id, status: existing.status };
    const [suppression] = await tx
      .select()
      .from(emailSuppressions)
      .where(eq(emailSuppressions.recipientHash, hash));
    const suppressed =
      !!suppression && (input.category === "bulk" || suppression.allMail);
    const queuedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await tx.insert(emailOutbox).values({
      id,
      dedupeKey,
      userId: input.userId,
      recipientHash: hash,
      category: input.category,
      kind: input.kind,
      provider: config.provider,
      transportHash: transportHash(config),
      status: suppressed ? "suppressed" : "queued",
      payload: suppressed ? null : encryptMail(payload, id, config),
      expiresAt,
      nextAttemptAt: queuedAt,
      createdAt: queuedAt,
    });
    return {
      id,
      status: suppressed ? ("suppressed" as const) : ("queued" as const),
    };
  });
}

/** Caller holds the account lock: same account→outbox order as admission. */
export async function cancelPendingPasswordResetEmails(
  tx: Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "update">,
  userId: number
) {
  await tx
    .update(emailOutbox)
    .set({
      status: sql`CASE WHEN ${emailOutbox.firstDispatchAt} IS NOT NULL THEN 'unknown' ELSE 'cancelled' END`,
      payload: null,
      leaseToken: null,
      lastCode: "password_reset_superseded",
    })
    .where(
      and(
        eq(emailOutbox.userId, userId),
        eq(emailOutbox.kind, "password_reset"),
        inArray(emailOutbox.status, ["queued", "sending"])
      )
    );
}

/** Caller holds the account lock: same account→outbox order as admission. */
export async function cancelAccountEmails(
  tx: Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "update">,
  userId: number
) {
  await tx
    .update(emailOutbox)
    .set({
      status: sql`CASE WHEN ${emailOutbox.status} = 'sending' AND ${emailOutbox.firstDispatchAt} IS NOT NULL THEN 'unknown' ELSE 'cancelled' END`,
      payload: null,
      leaseToken: null,
      lastCode: "account_erased",
    })
    .where(
      and(
        eq(emailOutbox.userId, userId),
        inArray(emailOutbox.status, ["queued", "sending"])
      )
    );
  // Delivered/accepted receipts retain only non-content metadata after erasure.
  await tx
    .update(emailOutbox)
    .set({ payload: null })
    .where(eq(emailOutbox.userId, userId));
  await tx
    .update(emailCampaigns)
    .set({ status: "cancelled", payload: null })
    .where(
      and(
        eq(emailCampaigns.createdByUserId, userId),
        inArray(emailCampaigns.status, ["preview", "queueing"])
      )
    );
}

async function claim() {
  const db = await database(),
    now = new Date();
  const [candidate] = await db
    .select({ id: emailOutbox.id, userId: emailOutbox.userId })
    .from(emailOutbox)
    .where(
      and(
        inArray(emailOutbox.status, ["queued", "sending"]),
        lte(emailOutbox.nextAttemptAt, now)
      )
    )
    .orderBy(
      sql`CASE WHEN ${emailOutbox.category} = 'transactional' THEN 0 ELSE 1 END`,
      emailOutbox.createdAt
    )
    .limit(1);
  if (!candidate) return null;
  return db.transaction(async tx => {
    const [account] = await tx
      .select()
      .from(users)
      .where(eq(users.id, candidate.userId))
      .for("update");
    const [row] = await tx
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.id, candidate.id))
      .for("update");
    if (
      !row ||
      !["queued", "sending"].includes(row.status) ||
      row.nextAttemptAt > now
    )
      return null;
    const config = mailConfig();
    if (!config) return null;
    const stop = async (status: EmailOutboxRow["status"], code: string) => {
      await tx
        .update(emailOutbox)
        .set({ status, lastCode: code, payload: null, leaseToken: null })
        .where(eq(emailOutbox.id, row.id));
      return null;
    };
    if (
      !account ||
      account.loginMethod === "deleted" ||
      !account.email ||
      recipientHash(account.email, config) !== row.recipientHash
    )
      return stop("cancelled", "recipient_changed_or_erased");
    if (
      row.provider !== config.provider ||
      row.transportHash !== transportHash(config)
    )
      return stop(
        row.firstDispatchAt ? "unknown" : "failed",
        "transport_configuration_changed"
      );
    if (row.status === "sending" && row.provider === "smtp")
      return stop("unknown", "smtp_previous_attempt_unconfirmed");
    if (
      row.firstDispatchAt &&
      now.getTime() - row.firstDispatchAt.getTime() >= 23 * 3600_000
    )
      return stop("unknown", "idempotency_window_expired");
    if (row.expiresAt <= now)
      return stop(
        row.firstDispatchAt ? "unknown" : "cancelled",
        "message_expired"
      );
    if (row.attempts >= 6)
      return stop(row.firstDispatchAt ? "unknown" : "failed", "attempt_limit");
    const [suppression] = await tx
      .select()
      .from(emailSuppressions)
      .where(eq(emailSuppressions.recipientHash, row.recipientHash));
    if (suppression && (row.category === "bulk" || suppression.allMail))
      return stop("suppressed", "recipient_suppressed");
    const leaseToken = randomUUID();
    await tx
      .update(emailOutbox)
      .set({
        status: "sending",
        leaseToken,
        nextAttemptAt: new Date(now.getTime() + 120_000),
      })
      .where(eq(emailOutbox.id, row.id));
    return { ...row, status: "sending" as const, leaseToken };
  });
}
async function settle(row: EmailOutboxRow, result: DeliveryResult) {
  const db = await database();
  const where = and(
    eq(emailOutbox.id, row.id),
    eq(emailOutbox.status, "sending"),
    eq(emailOutbox.leaseToken, row.leaseToken!)
  );
  if (result.outcome === "accepted") {
    await db
      .update(emailOutbox)
      .set({
        status: "accepted",
        providerId: result.providerId,
        acceptedAt: new Date(),
        payload: null,
        leaseToken: null,
        lastCode: null,
      })
      .where(where);
    await reconcileDelivery(result.providerId);
    return;
  }
  const exhausted = row.attempts >= 6;
  const status =
    result.outcome === "retry"
      ? exhausted
        ? result.ambiguous
          ? "unknown"
          : "failed"
        : "queued"
      : result.outcome;
  await db
    .update(emailOutbox)
    .set({
      status,
      lastCode: result.code,
      leaseToken: null,
      payload: status === "queued" ? row.payload : null,
      nextAttemptAt: new Date(
        Date.now() +
          Math.min(3600_000, 30_000 * 2 ** Math.max(0, row.attempts - 1))
      ),
    })
    .where(where);
}
export async function runEmailOutboxBatch(
  limit = 3
): Promise<{ processed: number }> {
  const config = mailConfig();
  if (!config) return { processed: 0 };
  let processed = 0;
  for (let i = 0; i < Math.max(1, Math.min(10, limit)); i++) {
    const row = await claim();
    if (!row) break;
    const db = await database();
    const where = and(
      eq(emailOutbox.id, row.id),
      eq(emailOutbox.status, "sending"),
      eq(emailOutbox.leaseToken, row.leaseToken!)
    );
    let payload: MailPayload;
    try {
      payload = mailPayloadSchema.parse(
        decryptMail(row.payload!, row.id, config)
      );
    } catch {
      await settle(row, {
        outcome: "failed",
        code: "encrypted_payload_unavailable",
      });
      processed++;
      continue;
    }
    if (
      normalizedEmail(payload.to) !== payload.to ||
      recipientHash(payload.to, config) !== row.recipientHash
    ) {
      await settle(row, {
        outcome: "failed",
        code: "recipient_binding_invalid",
      });
      processed++;
      continue;
    }
    if (
      (row.kind === "password_reset") !== !!payload.passwordReset ||
      (payload.passwordReset && payload.passwordReset.userId !== row.userId)
    ) {
      await settle(row, { outcome: "failed", code: "reset_binding_invalid" });
      processed++;
      continue;
    }
    if (payload.decision) {
      const [app] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, payload.decision.applicationId));
      const timestamp =
        app?.status === "retracted" ? app.retractedAt : app?.humanDecisionAt;
      if (
        !app ||
        app.applicantId !== row.userId ||
        app.status !== payload.decision.status ||
        !timestamp ||
        new Date(timestamp).toISOString() !== payload.decision.decisionAt
      ) {
        await settle(row, { outcome: "failed", code: "decision_changed" });
        processed++;
        continue;
      }
      if (payload.certificateRequired && !payload.attachments.length) {
        try {
          const [applicant] = await db
            .select()
            .from(users)
            .where(eq(users.id, row.userId));
          const { renderCertificatePdf } = await import("../certificateV2");
          const pdf = await renderCertificatePdf({
            app,
            applicantName: applicant?.name ?? null,
            applicantEmail: applicant?.email ?? null,
          });
          try {
            payload.attachments = [
              validatePdfAttachment({
                filename: `IRB-${app.id}-${app.status}.pdf`,
                contentType: "application/pdf",
                content: pdf,
              }),
            ];
          } finally {
            pdf.fill(0);
          }
          row.payload = encryptMail(payload, row.id, config);
          const changed = await db
            .update(emailOutbox)
            .set({ payload: row.payload })
            .where(where);
          if (Number((changed as any)[0]?.affectedRows) !== 1) continue;
        } catch {
          row.attempts++;
          await db
            .update(emailOutbox)
            .set({ attempts: row.attempts })
            .where(where);
          await settle(row, {
            outcome: "retry",
            code: "certificate_preparation_unavailable",
          });
          processed++;
          continue;
        }
      }
    }
    const pace = await consumeRateLimit("mail-per-second", "platform", 1, 1000);
    const bulkLimit = Math.max(
      0,
      config.dailyLimit - Math.min(20, Math.ceil(config.dailyLimit / 3))
    );
    const bulk =
      pace.allowed && row.category === "bulk"
        ? bulkLimit > 0
          ? await consumeRateLimit(
              "mail-bulk-daily",
              "platform",
              bulkLimit,
              86400_000
            )
          : { allowed: false, retryAfter: 86400 }
        : pace;
    const daily =
      pace.allowed && bulk.allowed
        ? await consumeRateLimit(
            "mail-daily",
            "platform",
            config.dailyLimit,
            86400_000
          )
        : bulk;
    if (!pace.allowed || !bulk.allowed || !daily.allowed) {
      await db
        .update(emailOutbox)
        .set({
          status: "queued",
          leaseToken: null,
          nextAttemptAt: new Date(
            Date.now() + Math.max(1000, (daily.retryAfter || 60) * 1000)
          ),
          lastCode: "delivery_allowance_unavailable",
        })
        .where(where);
      break;
    }
    // Mark dispatch durably before crossing the provider boundary. Losing the
    // process now is recoverable with Resend's SAME key, conservative for SMTP.
    const dispatchedAt = new Date();
    row.attempts++;
    row.firstDispatchAt ??= dispatchedAt;
    const admitted = await db.transaction(async tx => {
      // Reset requests and account erasure take this same account lock. Once
      // dispatch is admitted, a later reset may invalidate a link already in
      // transit; such a message cannot truthfully be described as unsent.
      const [account] = await tx
        .select()
        .from(users)
        .where(eq(users.id, row.userId))
        .for("update");
      if (
        !account ||
        account.loginMethod === "deleted" ||
        !account.email ||
        recipientHash(account.email, config) !== row.recipientHash
      )
        return false;
      if (payload.passwordReset) {
        const [reset] = await tx
          .select({ tokenHash: passwordResetTokens.tokenHash })
          .from(passwordResetTokens)
          .where(
            and(
              eq(
                passwordResetTokens.tokenHash,
                payload.passwordReset.tokenHash
              ),
              eq(passwordResetTokens.userId, row.userId),
              isNull(passwordResetTokens.consumedAt),
              gt(passwordResetTokens.expiresAt, new Date())
            )
          );
        if (!reset) {
          await tx
            .update(emailOutbox)
            .set({
              status: row.attempts > 1 ? "unknown" : "cancelled",
              payload: null,
              leaseToken: null,
              lastCode: "password_reset_invalidated",
            })
            .where(where);
          return false;
        }
      }
      const update = await tx
        .update(emailOutbox)
        .set({ attempts: row.attempts, firstDispatchAt: row.firstDispatchAt })
        .where(where);
      return Number((update as any)[0]?.affectedRows) === 1;
    });
    if (!admitted) {
      processed++;
      continue;
    }
    const result = await sendMail(payload, row.id, config);
    await settle(row, result);
    processed++;
  }
  return { processed };
}

export async function suppressRecipient(
  hash: string,
  allMail: boolean,
  reason: "unsubscribed" | "bounced" | "complained"
) {
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw new Error("Invalid suppression identity");
  const db = await database();
  await db
    .insert(emailSuppressions)
    .values({ recipientHash: hash, allMail, reason })
    .onDuplicateKeyUpdate({
      set: {
        allMail: sql`${emailSuppressions.allMail} OR ${allMail}`,
        reason: sql`CASE WHEN ${emailSuppressions.allMail} THEN ${emailSuppressions.reason} ELSE ${reason} END`,
      },
    });
}
export async function recordDeliveryEvent(
  id: string,
  providerId: string,
  type: string
) {
  if (
    !/^[A-Za-z0-9_-]{1,255}$/.test(id) ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(providerId) ||
    ![
      "email.sent",
      "email.delivered",
      "email.bounced",
      "email.complained",
      "email.failed",
      "email.suppressed",
    ].includes(type)
  )
    return;
  const db = await database();
  await db
    .insert(emailDeliveryEvents)
    .values({ id, providerId, type })
    .onDuplicateKeyUpdate({ set: { id: sql`${emailDeliveryEvents.id}` } });
  await reconcileDelivery(providerId);
}
async function reconcileDelivery(providerId: string) {
  const db = await database();
  const [row] = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.provider, "resend"),
        eq(emailOutbox.providerId, providerId)
      )
    )
    .limit(1);
  if (!row) return;
  const events = await db
    .select({ type: emailDeliveryEvents.type })
    .from(emailDeliveryEvents)
    .where(eq(emailDeliveryEvents.providerId, providerId));
  const types = new Set(events.map(e => e.type));
  const state = types.has("email.complained")
    ? "complained"
    : types.has("email.bounced")
      ? "bounced"
      : types.has("email.delivered")
        ? "delivered"
        : types.has("email.suppressed")
          ? "suppressed"
          : types.has("email.failed")
            ? "failed"
            : null;
  if (!state) return;
  // Reordered callbacks may add evidence, but cannot clear a terminal bounce or
  // complaint. No callback can authorize a new send or expose a message body.
  const terminal =
    state === "complained"
      ? []
      : state === "bounced"
        ? ["complained"]
        : ["bounced", "complained"];
  await db
    .update(emailOutbox)
    .set({
      status: state,
      ...(state === "delivered" ? { deliveredAt: new Date() } : {}),
      payload: null,
    })
    .where(
      and(
        eq(emailOutbox.id, row.id),
        terminal.length
          ? sql`${emailOutbox.status} NOT IN (${sql.join(
              terminal.map(s => sql`${s}`),
              sql`,`
            )})`
          : undefined
      )
    );
  if (state === "bounced" || state === "complained")
    await suppressRecipient(row.recipientHash, true, state);
}
export async function listEmailDeliveries(
  input: { userId?: number; limit?: number } = {}
) {
  const db = await database();
  return db
    .select({
      id: emailOutbox.id,
      userId: emailOutbox.userId,
      kind: emailOutbox.kind,
      category: emailOutbox.category,
      status: emailOutbox.status,
      attempts: emailOutbox.attempts,
      lastCode: emailOutbox.lastCode,
      createdAt: emailOutbox.createdAt,
      acceptedAt: emailOutbox.acceptedAt,
      deliveredAt: emailOutbox.deliveredAt,
    })
    .from(emailOutbox)
    .where(input.userId ? eq(emailOutbox.userId, input.userId) : undefined)
    .orderBy(desc(emailOutbox.createdAt))
    .limit(Math.max(1, Math.min(100, input.limit ?? 50)));
}
export function startEmailOutboxWorker() {
  let running = false,
    stopped = false;
  let nextCleanup = 0;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await runEmailOutboxBatch(3);
      if (mailConfig() && Date.now() >= nextCleanup) {
        const db = await database();
        await db
          .update(emailCampaigns)
          .set({ status: "cancelled", payload: null })
          .where(
            and(
              eq(emailCampaigns.status, "preview"),
              lte(emailCampaigns.expiresAt, new Date())
            )
          )
          .limit(100);
        nextCleanup = Date.now() + 3600_000;
      }
    } catch {
      console.warn("[Email] Queue processing unavailable");
    } finally {
      running = false;
    }
  };
  const interval = setInterval(() => {
    void tick();
  }, 10_000);
  interval.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
