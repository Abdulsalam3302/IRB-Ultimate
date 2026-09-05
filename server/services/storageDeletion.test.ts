import { randomBytes, randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  applications,
  fileUploads,
  storageDeletionJobs,
  users,
} from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  binding: {
    storageProvider: "supabase" as const,
    storageOrigin: "https://synthetic-storage.supabase.co",
    storageBucket: "irb-private",
  },
}));
vi.mock("../storage", async importOriginal => ({
  ...(await importOriginal<typeof import("../storage")>()),
  getStorageBinding: () => mocks.binding,
  storageDeleteBound: mocks.remove,
}));
import {
  addFileUpload,
  closeDatabase,
  createApplication,
  eraseUserAccount,
  getDb,
  upsertUser,
  updateEditableApplication,
} from "../db";
import { StorageDeletionBlockedError } from "../storage";
import {
  expediteStorageCleanup,
  reserveStorageUpload,
  runStorageDeletionBatch,
} from "./storageDeletion";
import { assertSupabaseIdentityActive } from "./storageDeletionIdentity";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
suite("durable private object lifecycle on isolated database", () => {
  const ids: number[] = [];
  const originalQuota = process.env.MAX_TOTAL_UPLOAD_BYTES;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.remove.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    process.env.MAX_TOTAL_UPLOAD_BYTES = originalQuota || "";
    const db = (await getDb())!;
    if (ids.length) {
      await db.delete(fileUploads).where(inArray(fileUploads.userId, ids));
      await db
        .delete(storageDeletionJobs)
        .where(inArray(storageDeletionJobs.userId, ids));
      await db
        .delete(applications)
        .where(inArray(applications.applicantId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    ids.length = 0;
  });
  afterAll(closeDatabase);
  async function user() {
    const db = (await getDb())!;
    const result = await db
      .insert(users)
      .values({
        openId: `storage-test:${randomBytes(12).toString("hex")}`,
        loginMethod: "email",
        name: "Synthetic storage fixture",
      });
    const id = result[0].insertId;
    ids.push(id);
    return id;
  }
  const key = (id: number) =>
    `${id}/${randomBytes(12).toString("hex")}-synthetic.txt`;
  async function job(id: number) {
    const [row] = await (await getDb())!
      .select()
      .from(storageDeletionJobs)
      .where(eq(storageDeletionJobs.id, id));
    return row;
  }
  async function makeDue(id: number) {
    await (await getDb())!
      .update(storageDeletionJobs)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(storageDeletionJobs.id, id));
  }
  async function stored(
    userId: number,
    applicationId: number | null,
    bound = true
  ) {
    const fileKey = key(userId);
    const id = await addFileUpload({
      userId,
      applicationId,
      fileKey,
      fileName: "synthetic.txt",
      fileUrl: "",
      fileSize: 20,
      ...(bound ? mocks.binding : {}),
    });
    return { id, fileKey };
  }

  it("persists cleanup before storage and atomically replaces it with file metadata", async () => {
    const userId = await user();
    const fileKey = key(userId);
    const reservation = await reserveStorageUpload({
      userId,
      fileKey,
      fileSize: 20,
    });
    expect(await job(reservation.id)).toMatchObject({
      status: "reserved",
      fileKey,
      ...mocks.binding,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    const fileId = await addFileUpload(
      {
        userId,
        fileKey,
        fileName: "synthetic.txt",
        fileUrl: "",
        fileSize: 20,
        ...reservation.binding,
      },
      reservation.id
    );
    expect(await job(reservation.id)).toMatchObject({ status: "cancelled" });
    await makeDue(reservation.id);
    expect(await runStorageDeletionBatch()).toEqual({
      completed: 0,
      pending: 0,
      blocked: 0,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(fileId).toBeGreaterThan(0);
  });

  it("rolls reservation cancellation back when the file transaction fails", async () => {
    const userId = await user();
    const fileKey = key(userId);
    const reservation = await reserveStorageUpload({
      userId,
      fileKey,
      fileSize: 20,
    });
    await expect(
      addFileUpload(
        {
          userId,
          fileKey,
          fileName: "synthetic.txt",
          fileUrl: "",
          fileSize: 20,
          applicationId: 2_000_000_000,
          ...reservation.binding,
        },
        reservation.id
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await job(reservation.id)).toMatchObject({ status: "reserved" });
    await expediteStorageCleanup(reservation.id, true);
    expect(await runStorageDeletionBatch()).toMatchObject({ completed: 1 });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
      mocks.binding,
      fileKey
    );
  });

  it("recovers a crash before metadata persistence after the durable reservation deadline", async () => {
    const userId = await user();
    const fileKey = key(userId);
    const reservation = await reserveStorageUpload({
      userId,
      fileKey,
      fileSize: 20,
    });
    expect(await runStorageDeletionBatch()).toMatchObject({ completed: 0 });
    await makeDue(reservation.id);
    expect(await runStorageDeletionBatch()).toMatchObject({ completed: 1 });
    expect(await job(reservation.id)).toMatchObject({
      status: "completed",
      attempts: 1,
    });
    await expect(
      addFileUpload(
        {
          userId,
          fileKey,
          fileName: "synthetic.txt",
          fileUrl: "",
          fileSize: 20,
          ...reservation.binding,
        },
        reservation.id
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("accounts for files and reservations under one global lock across concurrent users", async () => {
    const db = (await getDb())!;
    const [f] = await db
      .select({ bytes: sql<number>`COALESCE(SUM(${fileUploads.fileSize}),0)` })
      .from(fileUploads);
    const [j] = await db
      .select({
        bytes: sql<number>`COALESCE(SUM(${storageDeletionJobs.fileSize}),0)`,
      })
      .from(storageDeletionJobs)
      .where(
        inArray(storageDeletionJobs.status, [
          "reserved",
          "pending",
          "processing",
          "blocked",
        ])
      );
    process.env.MAX_TOTAL_UPLOAD_BYTES = String(
      Number(f.bytes) + Number(j.bytes) + 15 * 1024 * 1024
    );
    const members = await Promise.all([user(), user(), user()]);
    const result = await Promise.allSettled(
      members.map(userId =>
        reserveStorageUpload({
          userId,
          fileKey: key(userId),
          fileSize: 9 * 1024 * 1024,
        })
      )
    );
    expect(result.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(result.filter(item => item.status === "rejected")).toHaveLength(2);
    for (const item of result)
      if (item.status === "rejected")
        expect(item.reason).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("counts pending deletion bytes until verified removal, then admits new work", async () => {
    const userId = await user();
    const first = await reserveStorageUpload({
      userId,
      fileKey: key(userId),
      fileSize: 15 * 1024 * 1024,
    });
    const db = (await getDb())!;
    const [f] = await db
      .select({ bytes: sql<number>`COALESCE(SUM(${fileUploads.fileSize}),0)` })
      .from(fileUploads);
    const [j] = await db
      .select({
        bytes: sql<number>`COALESCE(SUM(${storageDeletionJobs.fileSize}),0)`,
      })
      .from(storageDeletionJobs)
      .where(
        inArray(storageDeletionJobs.status, [
          "reserved",
          "pending",
          "processing",
          "blocked",
        ])
      );
    process.env.MAX_TOTAL_UPLOAD_BYTES = String(
      Number(f.bytes) + Number(j.bytes)
    );
    await expediteStorageCleanup(first.id, true);
    await expect(
      reserveStorageUpload({ userId, fileKey: key(userId), fileSize: 1 })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await runStorageDeletionBatch();
    await expect(
      reserveStorageUpload({ userId, fileKey: key(userId), fileSize: 1 })
    ).resolves.toHaveProperty("id");
  });

  it("preserves per-user bytes and file-count limits when other users have room", async () => {
    const userId = await user();
    const db = (await getDb())!;
    await db
      .insert(fileUploads)
      .values({
        userId,
        fileKey: key(userId),
        fileName: "synthetic-size-fixture.txt",
        fileUrl: "",
        fileSize: 250 * 1024 * 1024,
      });
    await expect(
      reserveStorageUpload({ userId, fileKey: key(userId), fileSize: 1 })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await db.delete(fileUploads).where(eq(fileUploads.userId, userId));
    await db
      .insert(fileUploads)
      .values(
        Array.from({ length: 500 }, () => ({
          userId,
          fileKey: key(userId),
          fileName: "synthetic-count-fixture.txt",
          fileUrl: "",
          fileSize: 1,
        }))
      );
    await expect(
      reserveStorageUpload({ userId, fileKey: key(userId), fileSize: 1 })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("does not count unknown legacy file sizes as zero, including after metadata erasure", async () => {
    const userId = await user();
    const otherId = await user();
    const db = (await getDb())!;
    await db
      .insert(fileUploads)
      .values({
        userId,
        fileKey: key(userId),
        fileName: "legacy-unknown.txt",
        fileUrl: "",
        fileSize: null,
      });
    await expect(
      reserveStorageUpload({
        userId: otherId,
        fileKey: key(otherId),
        fileSize: 1,
      })
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await eraseUserAccount(userId);
    await expect(
      reserveStorageUpload({
        userId: otherId,
        fileKey: key(otherId),
        fileSize: 1,
      })
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const [unknown] = await db
      .select()
      .from(storageDeletionJobs)
      .where(eq(storageDeletionJobs.userId, userId));
    expect(unknown).toMatchObject({ fileSize: -1, status: "blocked" });
  });

  it("erases only own draft/unassigned files, retains regulatory and other-owner files, and blocks unknown locations", async () => {
    const userId = await user();
    const otherId = await user();
    const db = (await getDb())!;
    const draft = (
      await db.insert(applications).values({ applicantId: userId })
    )[0].insertId;
    const regulatory = (
      await db
        .insert(applications)
        .values({
          applicantId: userId,
          status: "submitted",
          submittedAt: new Date(),
        })
    )[0].insertId;
    const draftFile = await stored(userId, draft);
    const unattached = await stored(userId, null);
    const legacy = await stored(userId, null, false);
    const otherFile = await stored(otherId, null);
    await db
      .update(fileUploads)
      .set({ applicationId: draft })
      .where(eq(fileUploads.id, otherFile.id));
    const retainedFile = await stored(userId, null);
    await db
      .update(fileUploads)
      .set({ applicationId: regulatory })
      .where(eq(fileUploads.id, retainedFile.id));
    const result = await eraseUserAccount(userId);
    expect(result).toEqual({
      deletedDraftApplications: 1,
      retainedRegulatoryApplications: 1,
      queuedStorageDeletions: 2,
      blockedStorageDeletions: 1,
      storageDeletionStatus: "pending",
      queuedIdentityDeletions: 0,
      blockedIdentityDeletions: 0,
      identityDeletionStatus: "not_required",
    });
    const retained = await db
      .select()
      .from(fileUploads)
      .where(
        inArray(fileUploads.id, [
          draftFile.id,
          unattached.id,
          legacy.id,
          otherFile.id,
          retainedFile.id,
        ])
      );
    expect(retained.map(file => file.id).sort()).toEqual(
      [otherFile.id, retainedFile.id].sort()
    );
    expect(
      retained.find(file => file.id === otherFile.id)?.applicationId
    ).toBeNull();
    const jobs = await db
      .select()
      .from(storageDeletionJobs)
      .where(eq(storageDeletionJobs.userId, userId));
    expect(jobs.find(job => job.fileKey === legacy.fileKey)).toMatchObject({
      status: "blocked",
      lastErrorCode: "unknown_binding",
      storageProvider: null,
    });
    expect(await runStorageDeletionBatch(5)).toMatchObject({ completed: 2 });
    expect(mocks.remove.mock.calls.map(call => call[1]).sort()).toEqual(
      [draftFile.fileKey, unattached.fileKey].sort()
    );
  });

  it("returns pending cleanup for in-flight uploads and rejects late metadata after account erasure", async () => {
    const userId = await user();
    const fileKey = key(userId);
    const reservation = await reserveStorageUpload({
      userId,
      fileKey,
      fileSize: 20,
    });
    expect(await eraseUserAccount(userId)).toMatchObject({
      queuedStorageDeletions: 1,
      storageDeletionStatus: "pending",
    });
    await expect(
      addFileUpload(
        {
          userId,
          fileKey,
          fileName: "synthetic.txt",
          fileUrl: "",
          fileSize: 20,
          ...reservation.binding,
        },
        reservation.id
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      reserveStorageUpload({ userId, fileKey: key(userId), fileSize: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      createApplication({ applicantId: userId })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await job(reservation.id)).toMatchObject({ status: "reserved" });
  });

  it("allows committee-requested revisions while preserving their regulatory files during erasure", async () => {
    const userId = await user();
    const db = (await getDb())!;
    const applicationId = (
      await db
        .insert(applications)
        .values({
          applicantId: userId,
          status: "resubmission_required",
          submittedAt: new Date(),
        })
    )[0].insertId;
    const fileKey = key(userId);
    const reservation = await reserveStorageUpload({
      userId,
      applicationId,
      fileKey,
      fileSize: 20,
    });
    const fileId = await addFileUpload(
      {
        userId,
        applicationId,
        fileKey,
        fileName: "synthetic.txt",
        fileUrl: "",
        fileSize: 20,
        ...reservation.binding,
      },
      reservation.id
    );
    expect(await eraseUserAccount(userId)).toMatchObject({
      deletedDraftApplications: 0,
      retainedRegulatoryApplications: 1,
      queuedStorageDeletions: 0,
    });
    expect(
      await db.select().from(fileUploads).where(eq(fileUploads.id, fileId))
    ).toHaveLength(1);
  });

  it("rejects a late AI field update to a retained revision after account closure", async () => {
    const userId = await user();
    const db = (await getDb())!;
    const applicationId = (await db.insert(applications).values({ applicantId: userId, status: "resubmission_required", submittedAt: new Date(), methodology: "Retained original methodology" }))[0].insertId;
    const [before] = await db.select().from(applications).where(eq(applications.id, applicationId));
    await eraseUserAccount(userId);
    await expect(updateEditableApplication(applicationId, userId, { methodology: "Late synthetic AI update" }, before)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const [after] = await db.select().from(applications).where(eq(applications.id, applicationId));
    expect(after).toEqual(before);
  });

  it("preserves the settling window after an ambiguous provider failure", async () => {
    const userId = await user();
    const reservation = await reserveStorageUpload({
      userId,
      fileKey: key(userId),
      fileSize: 20,
    });
    const original = await job(reservation.id);
    await expediteStorageCleanup(reservation.id);
    expect(await job(reservation.id)).toMatchObject({
      status: "pending",
      nextAttemptAt: original.nextAttemptAt,
    });
    expect(await runStorageDeletionBatch()).toMatchObject({ completed: 0 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps a completed identity tombstone and atomically denies old-subject recreation", async () => {
    const db = (await getDb())!;
    const openId = `sb:${randomUUID()}`;
    const identityIssuer = "https://synthetic-storage.supabase.co/auth/v1";
    await upsertUser({
      openId,
      identityIssuer,
      loginMethod: "supabase",
      name: "Synthetic identity",
    });
    const [account] = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId));
    ids.push(account.id);
    expect(await eraseUserAccount(account.id)).toMatchObject({
      queuedIdentityDeletions: 1,
      blockedIdentityDeletions: 0,
      identityDeletionStatus: "pending",
    });
    await expect(
      assertSupabaseIdentityActive(openId, identityIssuer)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await db
      .update(storageDeletionJobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(
        and(
          eq(storageDeletionJobs.userId, account.id),
          eq(storageDeletionJobs.reason, "identity_erasure")
        )
      );
    await expect(
      upsertUser({ openId, identityIssuer, loginMethod: "supabase" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      await db.select().from(users).where(eq(users.openId, openId))
    ).toHaveLength(0);
  });

  it("blocks external identity cleanup for unknown historical issuers without permitting replay", async () => {
    const db = (await getDb())!;
    const openId = `sb:${randomUUID()}`;
    const userId = (
      await db.insert(users).values({ openId, loginMethod: "supabase" })
    )[0].insertId;
    ids.push(userId);
    expect(await eraseUserAccount(userId)).toMatchObject({
      queuedIdentityDeletions: 0,
      blockedIdentityDeletions: 1,
      identityDeletionStatus: "pending",
    });
    const [job] = await db
      .select()
      .from(storageDeletionJobs)
      .where(
        and(
          eq(storageDeletionJobs.userId, userId),
          eq(storageDeletionJobs.reason, "identity_erasure")
        )
      );
    expect(job).toMatchObject({
      status: "blocked",
      storageOrigin: null,
      lastErrorCode: "unknown_identity_issuer",
    });
    await expect(
      assertSupabaseIdentityActive(
        openId,
        "https://replacement.supabase.co/auth/v1"
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("serializes concurrent Supabase upsert and account closure without leaving a recreated identity", async () => {
    const db = (await getDb())!;
    const openId = `sb:${randomUUID()}`;
    const identityIssuer = "https://synthetic-storage.supabase.co/auth/v1";
    await upsertUser({ openId, identityIssuer, loginMethod: "supabase" });
    const [account] = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId));
    ids.push(account.id);
    const results = await Promise.allSettled([
      eraseUserAccount(account.id),
      upsertUser({ openId, identityIssuer, loginMethod: "supabase" }),
    ]);
    expect(results[0].status).toBe("fulfilled");
    const recreated = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId));
    ids.push(...recreated.map(row => row.id));
    expect(recreated).toHaveLength(0);
    await expect(
      assertSupabaseIdentityActive(openId, identityIssuer)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not invent object erasure work when there were no owned files", async () => {
    const userId = await user();
    expect(await eraseUserAccount(userId)).toMatchObject({
      queuedStorageDeletions: 0,
      blockedStorageDeletions: 0,
      storageDeletionStatus: "not_required",
    });
  });

  it("uses durable leases so two worker batches cannot claim the same job", async () => {
    const userId = await user();
    const reservation = await reserveStorageUpload({
      userId,
      fileKey: key(userId),
      fileSize: 20,
    });
    await expediteStorageCleanup(reservation.id, true);
    const results = await Promise.all([
      runStorageDeletionBatch(1),
      runStorageDeletionBatch(1),
    ]);
    expect(results.reduce((sum, result) => sum + result.completed, 0)).toBe(1);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("bounds retries, preserves safe error codes and leaves exhausted work blocked", async () => {
    const userId = await user();
    const reservation = await reserveStorageUpload({
      userId,
      fileKey: key(userId),
      fileSize: 20,
    });
    mocks.remove.mockRejectedValue(
      new Error("SECRET_DO_NOT_STORE/provider-object")
    );
    for (let attempt = 1; attempt <= 6; attempt++) {
      await makeDue(reservation.id);
      await runStorageDeletionBatch(1);
      expect(await job(reservation.id)).toMatchObject({
        attempts: attempt,
        status: attempt === 6 ? "blocked" : "pending",
        lastErrorCode: attempt === 6 ? "attempt_limit" : "provider_unavailable",
      });
      expect(JSON.stringify(await job(reservation.id))).not.toContain(
        "SECRET_DO_NOT_STORE"
      );
    }
    await makeDue(reservation.id);
    await runStorageDeletionBatch();
    expect(mocks.remove).toHaveBeenCalledTimes(6);
  });

  it("blocks provider changes and refuses cleanup for an object still referenced by a record", async () => {
    const userId = await user();
    const fileKey = key(userId);
    const reservation = await reserveStorageUpload({
      userId,
      fileKey,
      fileSize: 20,
    });
    mocks.remove.mockRejectedValue(
      new StorageDeletionBlockedError("binding_changed")
    );
    await expediteStorageCleanup(reservation.id, true);
    await runStorageDeletionBatch();
    expect(await job(reservation.id)).toMatchObject({
      status: "blocked",
      lastErrorCode: "binding_changed",
    });
    const nextKey = key(userId);
    const next = await reserveStorageUpload({
      userId,
      fileKey: nextKey,
      fileSize: 20,
    });
    await (await getDb())!
      .insert(fileUploads)
      .values({
        userId,
        fileKey: nextKey,
        fileName: "synthetic.txt",
        fileUrl: "",
        fileSize: 20,
        ...mocks.binding,
      });
    await expediteStorageCleanup(next.id, true);
    await runStorageDeletionBatch();
    expect(await job(next.id)).toMatchObject({
      status: "blocked",
      lastErrorCode: "object_referenced",
    });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
});
