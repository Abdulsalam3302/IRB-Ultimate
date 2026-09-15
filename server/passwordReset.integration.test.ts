import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { passwordResetTokens } from "../drizzle/authSchema";
import { users } from "../drizzle/schema";
import * as db from "./db";
import { completePasswordReset, resetTokenHash } from "./_core/passwordReset";
import { verifyPassword } from "./_core/passwords";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "../shared/const";

const run = describe.skipIf(!process.env.DATABASE_URL);
const newPassword = "Synthetic-new-password-2026";
run("single-use password recovery and session invalidation", () => {
  let userId: number;
  let openId: string;
  beforeAll(async () => {
    openId = `reset-test:${randomBytes(8).toString("hex")}`;
    const user = await db.createLocalUser({
      openId,
      name: "Recovery fixture",
      email: `${openId.replace(":", "-")}@example.test`,
      passwordHash: "existing-synthetic-hash",
    });
    userId = user!.id;
  });
  afterAll(async () => {
    const database = await db.getDb();
    if (database && userId)
      await database.delete(users).where(eq(users.id, userId));
  });
  async function token(expiresAt = new Date(Date.now() + 60000)) {
    const value = randomBytes(32).toString("hex");
    await (await db.getDb())!
      .insert(passwordResetTokens)
      .values({ tokenHash: resetTokenHash(value), userId, expiresAt });
    return value;
  }
  it("rejects expired/invalid tokens and short passwords without modifying credentials", async () => {
    expect(
      await completePasswordReset(
        await token(new Date(Date.now() - 10000)),
        newPassword
      )
    ).toBe(false);
    expect(await completePasswordReset(await token(), "short")).toBe(false);
    expect(await completePasswordReset("unknown", newPassword)).toBe(false);
    expect(
      (await db.getLocalUserByEmail(
        `${openId.replace(":", "-")}@example.test`
      ))!.passwordHash
    ).toBe("existing-synthetic-hash");
  });
  it("allows only one concurrent redemption and revokes pre-reset sessions", async () => {
    const oldSession = await sdk.createSessionToken(openId);
    const value = await token();
    const result = await Promise.all([
      completePasswordReset(value, newPassword),
      completePasswordReset(value, newPassword),
    ]);
    expect(result.sort()).toEqual([false, true]);
    const credential = (await db.getLocalUserByEmail(
      `${openId.replace(":", "-")}@example.test`
    ))!;
    expect(await verifyPassword(newPassword, credential.passwordHash)).toBe(
      true
    );
    expect(credential.authVersion).toBe(1);
    await expect(
      sdk.authenticateRequest({
        headers: { cookie: `${COOKIE_NAME}=${oldSession}` },
      } as any)
    ).rejects.toThrow();
    const freshSession = await sdk.createSessionToken(openId, {
      authVersion: credential.authVersion,
    });
    expect(
      (
        await sdk.authenticateRequest({
          headers: { cookie: `${COOKIE_NAME}=${freshSession}` },
        } as any)
      ).id
    ).toBe(userId);
    expect(await completePasswordReset(value, newPassword)).toBe(false);
    expect(
      await (await db.getDb())!
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, userId))
    ).toHaveLength(0);
  });
  it("rejects a login session bound to credentials verified before the reset", async () => {
    const staleCredentialSession = await sdk.createSessionToken(openId, {
      authVersion: 0,
    });
    await expect(
      sdk.authenticateRequest({
        headers: { cookie: `${COOKIE_NAME}=${staleCredentialSession}` },
      } as any)
    ).rejects.toThrow();
  });
});
