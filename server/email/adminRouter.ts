import { randomUUID } from "node:crypto";
import { and, count, desc, eq, isNotNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, ownerProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { consumeRateLimit } from "../_core/requestLimits";
import { users, emailCampaigns, emailSuppressions } from "../../drizzle/schema";
import { mailConfig, normalizedEmail } from "./config";
import { decryptMail, encryptMail, recipientHash } from "./crypto";
import { brandedMail } from "./templates";
import { enqueueAdministrativeEmail } from "./events";
import { listEmailDeliveries } from "./outbox";

const copySchema = z
  .object({
    subjectEn: z.string().min(1).max(100),
    subjectAr: z.string().min(1).max(100),
    bodyEn: z.string().min(1).max(8000),
    bodyAr: z.string().min(1).max(8000),
  })
  .strict();
const audienceSchema = z
  .object({
    search: z.string().max(100).default(""),
    role: z.enum(["all", "user", "admin"]).default("all"),
  })
  .strict();
const campaignSchema = z.object({
  copy: copySchema,
  audience: z
    .array(
      z.object({
        userId: z.number().int().positive(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
    )
    .max(250),
});
function conditions(input: z.infer<typeof audienceSchema>) {
  const query = input.search.trim().replace(/[\\%_]/g, m => `\\${m}`);
  return and(
    isNotNull(users.email),
    sql`${users.loginMethod} <> 'deleted'`,
    input.role === "all" ? undefined : eq(users.role, input.role),
    query
      ? or(like(users.email, `%${query}%`), like(users.name, `%${query}%`))
      : undefined
  );
}
async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Email administration is unavailable.",
    });
  return db;
}
export const mailAdminRouter = router({
  configuration: adminProcedure.query(() => {
    const config = mailConfig();
    return {
      enabled: !!config,
      provider: config?.provider ?? "disabled",
      from: config?.from ?? "committee@irb-sa.org",
      dailyLimit: config?.dailyLimit ?? 90,
    };
  }),
  directory: adminProcedure
    .input(
      audienceSchema.extend({
        page: z.number().int().min(1).max(2000).default(1),
        pageSize: z.number().int().min(1).max(50).default(25),
      })
    )
    .query(async ({ input }) => {
      const db = await database(),
        where = conditions(input);
      const [total] = await db
        .select({ total: count() })
        .from(users)
        .where(where);
      const accounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(users.id)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);
      return {
        accounts,
        total: total.total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),
  deliveries: adminProcedure
    .input(
      z
        .object({
          userId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(({ input }) => listEmailDeliveries(input)),
  campaigns: ownerProcedure.query(async ({ ctx }) => {
    const db = await database();
    return db
      .select({
        id: emailCampaigns.id,
        status: emailCampaigns.status,
        recipientCount: emailCampaigns.recipientCount,
        queuedCount: emailCampaigns.queuedCount,
        skippedCount: emailCampaigns.skippedCount,
        createdAt: emailCampaigns.createdAt,
      })
      .from(emailCampaigns)
      .where(eq(emailCampaigns.createdByUserId, ctx.user.id))
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(20);
  }),
  preview: ownerProcedure
    .input(z.object({ copy: copySchema, audience: audienceSchema }))
    .mutation(async ({ ctx, input }) => {
      const config = mailConfig();
      if (!config)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Configure verified email delivery before preparing a send.",
        });
      const allowance = await consumeRateLimit(
        "mail-campaign-preview",
        String(ctx.user.id),
        20,
        86400_000
      );
      if (!allowance.allowed)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "The daily message-preview allowance is unavailable. Retry later.",
        });
      const db = await database();
      const accounts = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(conditions(input.audience))
        .orderBy(users.id)
        .limit(251);
      if (accounts.length > 250)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Narrow the audience to at most250 accounts per confirmed batch.",
        });
      const audience = [];
      let skipped = 0;
      for (const user of accounts) {
        let hash: string;
        try {
          hash = recipientHash(normalizedEmail(user.email!), config);
        } catch {
          skipped++;
          continue;
        }
        const [suppression] = await db
          .select({ hash: emailSuppressions.recipientHash })
          .from(emailSuppressions)
          .where(eq(emailSuppressions.recipientHash, hash));
        if (suppression) {
          skipped++;
          continue;
        }
        audience.push({ userId: user.id, hash });
      }
      if (!audience.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No eligible recipients match this audience.",
        });
      const preview = brandedMail(
        {
          to: config.from,
          ...input.copy,
          titleEn: input.copy.subjectEn,
          titleAr: input.copy.subjectAr,
          link: `${config.site}/dashboard`,
        },
        config
      );
      const id = randomUUID(),
        expiresAt = new Date(Date.now() + 30 * 60_000);
      await db.insert(emailCampaigns).values({
        id,
        createdByUserId: ctx.user.id,
        payload: encryptMail({ copy: input.copy, audience }, id, config),
        recipientCount: audience.length,
        expiresAt,
      });
      return {
        id,
        recipientCount: audience.length,
        excludedCount: skipped,
        expiresAt,
        subject: preview.subject,
        text: preview.text,
        confirmation: `SEND ${audience.length} EMAILS`,
      };
    }),
  confirm: ownerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        confirmation: z.string().max(40),
        authorizedAudience: z.literal(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const config = mailConfig();
      if (!config)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Email delivery is not configured.",
        });
      const db = await database();
      const campaign = await db.transaction(async tx => {
        const [row] = await tx
          .select()
          .from(emailCampaigns)
          .where(eq(emailCampaigns.id, input.id))
          .for("update");
        if (!row || row.createdByUserId !== ctx.user.id)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (input.confirmation !== `SEND ${row.recipientCount} EMAILS`)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Enter the exact confirmation shown in the preview.",
          });
        if (row.status === "queued") return row;
        if (
          row.status === "cancelled" ||
          (row.status === "preview" && row.expiresAt < new Date())
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "The preview has expired. Prepare a new preview.",
          });
        await tx
          .update(emailCampaigns)
          .set({ status: "queueing" })
          .where(eq(emailCampaigns.id, row.id));
        return row;
      });
      if (campaign.status === "queued")
        return {
          id: campaign.id,
          status: "queued" as const,
          queuedCount: campaign.queuedCount,
          skippedCount: campaign.skippedCount,
        };
      const payload = campaignSchema.parse(
        decryptMail(campaign.payload!, campaign.id, config)
      );
      let queuedCount = 0,
        skippedCount = 0;
      for (const recipient of payload.audience) {
        const result = await enqueueAdministrativeEmail({
          userId: recipient.userId,
          eventId: `campaign:${campaign.id}`,
          expectedRecipientHash: recipient.hash,
          category: "bulk",
          ...payload.copy,
        });
        if (
          result.status === "suppressed" ||
          result.status === "cancelled" ||
          result.status === "disabled"
        )
          skippedCount++;
        else queuedCount++;
      }
      await db
        .update(emailCampaigns)
        .set({ status: "queued", payload: null, queuedCount, skippedCount })
        .where(eq(emailCampaigns.id, campaign.id));
      return {
        id: campaign.id,
        status: "queued" as const,
        queuedCount,
        skippedCount,
      };
    }),
});
