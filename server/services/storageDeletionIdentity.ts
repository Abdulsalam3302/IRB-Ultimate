import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storageDeletionJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { assertSafeEgress } from "../_core/ssrfGuard";
import { readBoundedText } from "../_core/httpSafety";
import { StorageDeletionBlockedError } from "../storage";
import type { StorageTransaction } from "./storageDeletion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function issuerOrigin(issuer: unknown): string | null {
  if (typeof issuer !== "string") return null;
  try {
    const url = new URL(issuer);
    return url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/auth/v1"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Completed jobs remain tombstones: a previously issued JWT must never recreate the user. */
export async function assertSupabaseIdentityActiveInTransaction(
  tx: StorageTransaction,
  openId: string,
  issuer?: string | null
) {
  if (!openId.startsWith("sb:")) return;
  const origin = issuerOrigin(issuer);
  const rows = await tx
    .select({ origin: storageDeletionJobs.storageOrigin })
    .from(storageDeletionJobs)
    .where(
      and(
        eq(storageDeletionJobs.reason, "identity_erasure"),
        eq(storageDeletionJobs.fileKey, openId.slice(3))
      )
    );
  // An unknown historical issuer is deliberately conservative; it cannot be
  // rebound to another tenant or used to circumvent a recorded closure.
  if (rows.some(row => !row.origin || !origin || row.origin === origin))
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "This institutional identity is closed.",
    });
}

export async function assertSupabaseIdentityActive(
  openId: string,
  issuer: string
): Promise<void> {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Identity status is unavailable.",
    });
  await assertSupabaseIdentityActiveInTransaction(db, openId, issuer);
}

export async function queueIdentityErasure(
  tx: StorageTransaction,
  user: { id: number; openId: string; identityIssuer?: string | null }
) {
  if (!user.openId.startsWith("sb:"))
    return {
      queuedIdentityDeletions: 0,
      blockedIdentityDeletions: 0,
      identityDeletionStatus: "not_required" as const,
    };
  const subject = user.openId.slice(3);
  const origin = issuerOrigin(user.identityIssuer);
  const error = !UUID.test(subject)
    ? "invalid_identity_scope"
    : !origin
      ? "unknown_identity_issuer"
      : null;
  await tx
    .insert(storageDeletionJobs)
    .values({
      userId: user.id,
      fileKey: subject,
      fileSize: 0,
      storageProvider: "supabase-auth",
      storageOrigin: origin,
      storageBucket: "",
      reason: "identity_erasure",
      status: error ? "blocked" : "pending",
      lastErrorCode: error,
      nextAttemptAt: new Date(Date.now() - 1000),
    });
  return {
    queuedIdentityDeletions: error ? 0 : 1,
    blockedIdentityDeletions: error ? 1 : 0,
    identityDeletionStatus: "pending" as const,
  };
}

/** Project Auth user only, never a Supabase dashboard/management identity. */
export async function deleteSupabaseIdentity(
  origin: string | null,
  subject: string
): Promise<void> {
  if (!origin || !UUID.test(subject))
    throw new StorageDeletionBlockedError("invalid_scope");
  const configuredOrigin = issuerOrigin(
    `${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1`
  );
  if (origin !== configuredOrigin)
    throw new StorageDeletionBlockedError("binding_changed");
  if (!/^sb_secret_[A-Za-z0-9_-]{20,200}$/.test(ENV.supabaseSecretKey))
    throw new Error("Identity cleanup requires configured server credentials");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Identity cleanup timed out"));
    }, 30_000);
    timer.unref();
  });
  const operation = async () => {
    await assertSafeEgress(origin);
    controller.signal.throwIfAborted();
    const url = `${origin}/auth/v1/admin/users/${subject}`;
    const request = async (method: "GET" | "DELETE") => {
      const response = await fetch(url, {
        method,
        headers: {
          apikey: ENV.supabaseSecretKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(method === "DELETE"
          ? { body: JSON.stringify({ should_soft_delete: false }) }
          : {}),
        signal: controller.signal,
        redirect: "error",
      });
      const body: unknown = JSON.parse(
        await readBoundedText(response, 64 * 1024)
      );
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("Invalid identity cleanup response");
      return { response, body: body as Record<string, unknown> };
    };
    const missing = (result: Awaited<ReturnType<typeof request>>) =>
      result.response.status === 404 &&
      (result.body.code === "user_not_found" ||
        // Older Auth servers use a numeric status plus a separate error code.
        (result.body.code === 404 &&
          result.body.error_code === "user_not_found"));
    const before = await request("GET");
    if (missing(before)) return;
    if (!before.response.ok || before.body.id !== subject)
      throw new Error("Identity cleanup scope could not be verified");
    const removed = await request("DELETE");
    if (!removed.response.ok && !missing(removed))
      throw new Error("Identity cleanup failed");
    const after = await request("GET");
    if (!missing(after))
      throw new Error("Identity absence could not be verified");
  };
  try {
    await Promise.race([operation(), deadline]);
  } catch {
    throw new Error("Identity cleanup could not be verified");
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
