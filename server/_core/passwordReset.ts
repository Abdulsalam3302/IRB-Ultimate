import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Express } from "express";
import {
  accountAuthState,
  passwordResetTokens,
} from "../../drizzle/authSchema";
import { users } from "../../drizzle/schema";
import { getDb, getLocalUserByEmail } from "../db";
import { queuePasswordResetEmail } from "../email/events";
import { cancelPendingPasswordResetEmails } from "../email/outbox";
import { mailConfig } from "../email/config";
import { consumeRateLimit } from "./requestLimits";
import { clientIpKey } from "./security";
import { hashPassword } from "./passwords";

export const resetTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const RESET_TTL_MS = 30 * 60_000;
const GENERIC_RESPONSE = { ok: true };

export async function requestPasswordReset(email: string) {
  const config = mailConfig();
  if (!config) return;
  const user = await getLocalUserByEmail(email);
  if (!user?.passwordHash || user.loginMethod === "deleted") return;
  const database = await getDb();
  if (!database) throw new Error("Recovery database unavailable");
  const token = randomBytes(32).toString("hex");
  const tokenHash = resetTokenHash(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  // Serialize recovery requests per account, and retain no plaintext token.
  await database.transaction(async tx => {
    const [current] = await tx
      .select({ id: users.id, loginMethod: users.loginMethod })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");
    if (!current || current.loginMethod === "deleted")
      throw new Error("Recovery account unavailable");
    await cancelPendingPasswordResetEmails(tx, user.id);
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    await tx
      .insert(passwordResetTokens)
      .values({ userId: user.id, tokenHash, expiresAt });
  });
  await queuePasswordResetEmail({
    userId: user.id,
    eventId: `reset:${tokenHash}`,
    expiresAt,
    resetUrl: `${config.site}/reset-password#token=${token}`,
  });
}

export async function completePasswordReset(
  token: string,
  password: string
): Promise<boolean> {
  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    password.length < 12 ||
    password.length > 200
  )
    return false;
  const database = await getDb();
  if (!database) throw new Error("Recovery database unavailable");
  const tokenHash = resetTokenHash(token);
  const [candidate] = await database
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!candidate) return false;
  const passwordHash = await hashPassword(password);
  return database.transaction(async tx => {
    // Same lock order as request/deletion: account first, then token.
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, candidate.userId))
      .for("update");
    if (!user?.passwordHash || user.loginMethod === "deleted") return false;
    const [current] = await tx
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      )
      .for("update");
    if (!current) return false;
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx
      .insert(accountAuthState)
      .values({ userId: user.id, version: 1 })
      .onDuplicateKeyUpdate({
        set: { version: sql`${accountAuthState.version} + 1` },
      });
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    await cancelPendingPasswordResetEmails(tx, user.id);
    return true;
  });
}

export function registerPasswordResetRoutes(app: Express) {
  app.get("/api/auth/recovery-status", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      res.json({ available: Boolean(mailConfig()) });
    } catch {
      res.json({ available: false });
    }
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    try {
      if (!mailConfig()) {
        res
          .status(503)
          .json({
            error:
              "Email recovery is not available yet. Contact platform support.",
          });
        return;
      }
      if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.json(GENERIC_RESPONSE);
        return;
      }
      const allowed = await consumeRateLimit(
        "password-reset-account",
        email,
        3,
        60 * 60_000
      );
      if (allowed.allowed) await requestPasswordReset(email);
    } catch {
      console.warn("[Recovery] Email could not be queued");
    }
    // Includes unknown, provider-only, throttled and disabled accounts.
    res.json(GENERIC_RESPONSE);
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const allowed = await consumeRateLimit(
        "password-reset-completion",
        clientIpKey(req),
        8,
        15 * 60_000
      );
      if (!allowed.allowed) {
        res
          .status(429)
          .json({ error: "Too many attempts. Please try again later." });
        return;
      }
      const { token, password } = req.body ?? {};
      if (
        typeof token !== "string" ||
        typeof password !== "string" ||
        !(await completePasswordReset(token, password))
      ) {
        res.status(400).json({
          error:
            "Use a valid, unexpired recovery link and a password of 12–200 characters.",
        });
        return;
      }
      res.json(GENERIC_RESPONSE);
    } catch {
      res.status(503).json({
        error:
          "Password recovery is temporarily unavailable. Please try again.",
      });
    }
  });
}
