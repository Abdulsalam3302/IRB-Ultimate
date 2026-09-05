import { and, count, eq, inArray, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  applications,
  fileUploads,
  storageDeletionJobs,
  storageQuotaLock,
  users,
  type FileUpload,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { boundedInt } from "../_core/limits";
import {
  getStorageBinding,
  normalizeStorageKey,
  storageDeleteBound,
  StorageDeletionBlockedError,
  type StorageBinding,
} from "../storage";
import { deleteSupabaseIdentity } from "./storageDeletionIdentity";

export type StorageTransaction = Pick<
  NonNullable<Awaited<ReturnType<typeof getDb>>>,
  "select" | "insert" | "update" | "delete"
>;
const ACTIVE = ["reserved", "pending", "processing", "blocked"] as const;
const EDITABLE = new Set([
  "draft",
  "declaration_pending",
  "stage1_pending",
  "stage1_failed",
  "stage2_pending",
  "stage2_failed",
  "resubmission_required",
]);
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const RESERVATION_MS = 15 * 60_000;
const MAX_ATTEMPTS = 6;

export async function lockStorageQuota(tx: StorageTransaction): Promise<void> {
  const [row] = await tx
    .select()
    .from(storageQuotaLock)
    .where(eq(storageQuotaLock.id, 1))
    .for("update");
  if (!row)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Storage accounting is unavailable.",
    });
}

export async function assertStorageAllowance(
  tx: StorageTransaction,
  userId: number,
  bytes: number
): Promise<void> {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_FILE_BYTES)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid upload size.",
    });
  const [files] = await tx
    .select({
      bytes: sql<number>`COALESCE(SUM(${fileUploads.fileSize}), 0)`,
      count: count(),
    })
    .from(fileUploads)
    .where(eq(fileUploads.userId, userId));
  const [jobs] = await tx
    .select({
      bytes: sql<number>`COALESCE(SUM(${storageDeletionJobs.fileSize}), 0)`,
      count: count(),
    })
    .from(storageDeletionJobs)
    .where(
      and(
        eq(storageDeletionJobs.userId, userId),
        inArray(storageDeletionJobs.status, [...ACTIVE])
      )
    );
  if (
    Number(files.count) + Number(jobs.count) >= 500 ||
    Number(files.bytes) + Number(jobs.bytes) + bytes > 250 * 1024 * 1024
  )
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Upload allowance exceeded.",
    });
  const [totalFiles] = await tx
    .select({
      bytes: sql<number>`COALESCE(SUM(${fileUploads.fileSize}), 0)`,
      unknownSizes: sql<number>`COALESCE(SUM(CASE WHEN ${fileUploads.fileSize} IS NULL OR ${fileUploads.fileSize} < 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(fileUploads);
  if (Number(totalFiles.unknownSizes) > 0)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Storage accounting requires review of legacy file sizes.",
    });
  const [totalJobs] = await tx
    .select({
      bytes: sql<number>`COALESCE(SUM(${storageDeletionJobs.fileSize}), 0)`,
      unknownSizes: sql<number>`COALESCE(SUM(CASE WHEN ${storageDeletionJobs.fileSize} < 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(storageDeletionJobs)
    .where(inArray(storageDeletionJobs.status, [...ACTIVE]));
  if (Number(totalJobs.unknownSizes) > 0)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Storage accounting requires review of pending file sizes.",
    });
  const limit = boundedInt(
    process.env.MAX_TOTAL_UPLOAD_BYTES,
    750 * 1024 * 1024,
    MAX_FILE_BYTES,
    10 * 1024 * 1024 * 1024
  );
  if (Number(totalFiles.bytes) + Number(totalJobs.bytes) + bytes > limit)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Platform storage allowance reached. Please contact support.",
    });
}

/** Persist before I/O, so a crash or ambiguous upload response still has cleanup work. */
export async function reserveStorageUpload(input: {
  userId: number;
  applicationId?: number;
  fileKey: string;
  fileSize: number;
}) {
  const key = normalizeStorageKey(input.fileKey);
  if (
    !key.startsWith(`${input.userId}/`) ||
    !Number.isSafeInteger(input.fileSize) ||
    input.fileSize < 1 ||
    input.fileSize > MAX_FILE_BYTES
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid upload reservation.",
    });
  const binding = getStorageBinding();
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Storage accounting is unavailable.",
    });
  const id = await db.transaction(async tx => {
    await lockStorageQuota(tx);
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update");
    if (!user || user.loginMethod === "deleted")
      throw new TRPCError({ code: "UNAUTHORIZED" });
    if (input.applicationId) {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, input.applicationId))
        .for("update");
      if (
        !app ||
        !EDITABLE.has(app.status) ||
        (app.applicantId !== input.userId && user.role !== "admin")
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Application is no longer accepting uploads.",
        });
    }
    await assertStorageAllowance(tx, input.userId, input.fileSize);
    const [duplicate] = await tx
      .select({ id: fileUploads.id })
      .from(fileUploads)
      .where(eq(fileUploads.fileKey, key))
      .limit(1);
    const [existingJob] = await tx
      .select({ id: storageDeletionJobs.id })
      .from(storageDeletionJobs)
      .where(eq(storageDeletionJobs.fileKey, key))
      .limit(1);
    if (duplicate || existingJob)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Upload key has already been used.",
      });
    const result = await tx
      .insert(storageDeletionJobs)
      .values({
        ...binding,
        userId: input.userId,
        fileKey: key,
        fileSize: input.fileSize,
        reason: "upload_cleanup",
        status: "reserved",
        nextAttemptAt: new Date(Date.now() + RESERVATION_MS),
      });
    return result[0].insertId;
  });
  return { id, binding };
}

export async function commitStorageReservation(
  tx: StorageTransaction,
  id: number,
  file: {
    userId: number;
    fileKey: string;
    fileSize?: number | null;
    storageProvider?: string | null;
    storageOrigin?: string | null;
    storageBucket?: string | null;
  }
) {
  const [job] = await tx
    .select()
    .from(storageDeletionJobs)
    .where(eq(storageDeletionJobs.id, id))
    .for("update");
  if (
    !job ||
    job.status !== "reserved" ||
    job.userId !== file.userId ||
    job.fileKey !== file.fileKey ||
    job.fileSize !== file.fileSize ||
    job.storageProvider !== file.storageProvider ||
    job.storageOrigin !== file.storageOrigin ||
    job.storageBucket !== file.storageBucket
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Upload reservation is no longer valid.",
    });
  await tx
    .update(storageDeletionJobs)
    .set({ status: "cancelled" })
    .where(eq(storageDeletionJobs.id, id));
}

/** Failure to expedite is safe: the original reservation remains durable and due later. */
export async function expediteStorageCleanup(
  id: number,
  confirmedStored = false
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // An aborted/lost provider response is ambiguous: preserve the original
  // 15-minute settling window, well beyond the remote write's 30-second limit.
  await db
    .update(storageDeletionJobs)
    .set({
      status: "pending",
      ...(confirmedStored
        ? { nextAttemptAt: new Date(Date.now() - 1000) }
        : {}),
    })
    .where(
      and(
        eq(storageDeletionJobs.id, id),
        eq(storageDeletionJobs.status, "reserved")
      )
    );
}

function bindingOf(
  file: Pick<FileUpload, "storageProvider" | "storageOrigin" | "storageBucket">
): StorageBinding | null {
  if (
    !["supabase", "s3", "forge", "local"].includes(
      file.storageProvider || ""
    ) ||
    !file.storageOrigin ||
    file.storageBucket == null
  )
    return null;
  return {
    storageProvider: file.storageProvider as StorageBinding["storageProvider"],
    storageOrigin: file.storageOrigin,
    storageBucket: file.storageBucket,
  };
}

/** Caller holds quota/user/application locks and removes these rows in the same transaction. */
export async function queueAccountStorageErasure(
  tx: StorageTransaction,
  userId: number,
  files: FileUpload[]
) {
  const existing = await tx
    .select({ status: storageDeletionJobs.status })
    .from(storageDeletionJobs)
    .where(
      and(
        eq(storageDeletionJobs.userId, userId),
        inArray(storageDeletionJobs.status, [...ACTIVE]),
        inArray(storageDeletionJobs.reason, [
          "upload_cleanup",
          "account_erasure",
        ])
      )
    );
  let queued = existing.filter(job => job.status !== "blocked").length;
  let blocked = existing.length - queued;
  for (const file of files) {
    if (file.userId !== userId)
      throw new Error("Account erasure scope mismatch");
    const binding = bindingOf(file);
    let validScope = false;
    try {
      validScope = normalizeStorageKey(file.fileKey).startsWith(`${userId}/`);
    } catch {
      /* keep exact legacy key for operator review */
    }
    const error = !validScope
      ? "invalid_scope"
      : !binding
        ? "unknown_binding"
        : null;
    await tx
      .insert(storageDeletionJobs)
      .values({
        userId,
        fileKey: file.fileKey,
        fileSize: file.fileSize ?? -1,
        storageProvider: file.storageProvider,
        storageOrigin: file.storageOrigin,
        storageBucket: file.storageBucket,
        reason: "account_erasure",
        status: error ? "blocked" : "pending",
        lastErrorCode: error,
        nextAttemptAt: new Date(Date.now() - 1000),
      });
    if (error) blocked++;
    else queued++;
  }
  // In-flight uploads cannot attach to the erased identity. Their existing
  // reservations remain due after the network deadline, rather than racing I/O.
  return { queuedStorageDeletions: queued, blockedStorageDeletions: blocked };
}

/** Small serial batch with durable leases and bounded retry; no provider calls under DB locks. */
export async function runStorageDeletionBatch(
  batchSize = 2
): Promise<{ completed: number; pending: number; blocked: number }> {
  const db = await getDb();
  if (!db) throw new Error("Storage deletion accounting is unavailable");
  const summary = { completed: 0, pending: 0, blocked: 0 };
  for (
    let index = 0;
    index < Math.max(1, Math.min(5, Math.floor(batchSize)));
    index++
  ) {
    const job = await db.transaction(async tx => {
      await lockStorageQuota(tx);
      const [row] = await tx
        .select()
        .from(storageDeletionJobs)
        .where(
          and(
            inArray(storageDeletionJobs.status, [
              "reserved",
              "pending",
              "processing",
            ]),
            lte(storageDeletionJobs.nextAttemptAt, new Date())
          )
        )
        .orderBy(storageDeletionJobs.nextAttemptAt, storageDeletionJobs.id)
        .limit(1)
        .for("update");
      if (!row) return null;
      const [reference] = await tx
        .select({ id: fileUploads.id })
        .from(fileUploads)
        .where(eq(fileUploads.fileKey, row.fileKey))
        .limit(1);
      if (reference || row.attempts >= MAX_ATTEMPTS) {
        await tx
          .update(storageDeletionJobs)
          .set({
            status: "blocked",
            lastErrorCode: reference ? "object_referenced" : "attempt_limit",
          })
          .where(eq(storageDeletionJobs.id, row.id));
        return { ...row, skipped: true as const };
      }
      const attempts = row.attempts + 1;
      await tx
        .update(storageDeletionJobs)
        .set({
          status: "processing",
          attempts,
          nextAttemptAt: new Date(Date.now() + 120_000),
        })
        .where(eq(storageDeletionJobs.id, row.id));
      return { ...row, attempts, skipped: false as const };
    });
    if (!job) break;
    if (job.skipped) {
      summary.blocked++;
      continue;
    }
    let failure: string | null = null;
    let blocked = false;
    try {
      if (job.reason === "identity_erasure") {
        if (job.storageProvider !== "supabase-auth" || job.storageBucket !== "")
          throw new StorageDeletionBlockedError("invalid_scope");
        await deleteSupabaseIdentity(job.storageOrigin, job.fileKey);
      } else {
        const binding = bindingOf(job);
        if (!binding || !job.fileKey.startsWith(`${job.userId}/`))
          throw new StorageDeletionBlockedError("invalid_scope");
        await storageDeleteBound(binding, job.fileKey);
      }
    } catch (error) {
      blocked =
        error instanceof StorageDeletionBlockedError ||
        job.attempts >= MAX_ATTEMPTS;
      failure =
        error instanceof StorageDeletionBlockedError
          ? error.code
          : job.attempts >= MAX_ATTEMPTS
            ? "attempt_limit"
            : "provider_unavailable";
    }
    const recorded = await db.transaction(async tx => {
      await lockStorageQuota(tx);
      const result = await tx
        .update(storageDeletionJobs)
        .set(
          failure
            ? {
                status: blocked ? "blocked" : "pending",
                lastErrorCode: failure,
                nextAttemptAt: new Date(
                  Date.now() +
                    Math.min(3_600_000, 60_000 * 2 ** (job.attempts - 1))
                ),
              }
            : {
                status: "completed",
                completedAt: new Date(),
                lastErrorCode: null,
              }
        )
        .where(
          and(
            eq(storageDeletionJobs.id, job.id),
            eq(storageDeletionJobs.status, "processing"),
            eq(storageDeletionJobs.attempts, job.attempts)
          )
        );
      return result[0].affectedRows === 1;
    });
    if (!recorded) summary.pending++;
    else if (!failure) summary.completed++;
    else if (blocked) summary.blocked++;
    else summary.pending++;
  }
  return summary;
}

/** Call only after migrations; shutdown waits for the one bounded active batch. */
export function startStorageDeletionWorker(): () => Promise<void> {
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running) return;
    running = runStorageDeletionBatch(2)
      .then(result => {
        if (result.blocked)
          console.warn("[storage-deletion] Jobs require operator review", {
            count: result.blocked,
          });
      })
      .catch(() => {
        console.warn(
          "[storage-deletion] Batch unavailable; durable jobs retained"
        );
      })
      .finally(() => {
        running = null;
      });
  };
  const interval = setInterval(tick, 60_000);
  interval.unref();
  tick();
  return async () => {
    clearInterval(interval);
    await running;
  };
}
