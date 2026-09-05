import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  env: {
    supabaseUrl: "https://synthetic-project.supabase.co",
    supabaseSecretKey: "sb_secret_" + "synthetic".repeat(5),
    supabaseStorageBucket: "irb-private",
    storageProvider: "supabase",
    forgeApiUrl: "",
    forgeApiKey: "",
    isProduction: true,
  },
  fetch: vi.fn(),
  egress: vi.fn(),
}));
vi.mock("../_core/env", () => ({ ENV: mocks.env }));
vi.mock("../_core/ssrfGuard", () => ({ assertSafeEgress: mocks.egress }));
vi.mock("../db", () => ({ getDb: vi.fn() }));
import { getStorageBinding, storageDeleteBound } from "../storage";
import { deleteSupabaseIdentity } from "./storageDeletionIdentity";

const origin = "https://synthetic-project.supabase.co";
const subject = "13cce2db-b94c-44ad-9672-f9a7df474684";
const objectKey = "42/synthetic-private.txt";
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const bucket = () => response({ id: "irb-private", public: false });
const missing = () => response({ code: "user_not_found" }, 404);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.env.supabaseUrl = origin;
  mocks.env.supabaseStorageBucket = "irb-private";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bound private object removal", () => {
  it("deletes only the exact captured key and verifies empty provider results", async () => {
    const binding = getStorageBinding();
    mocks.fetch
      .mockResolvedValueOnce(bucket())
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([]));
    await storageDeleteBound(binding, objectKey);
    expect(mocks.fetch.mock.calls[1][0]).toBe(
      `${origin}/storage/v1/object/irb-private`
    );
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
      prefixes: [objectKey],
    });
    expect(JSON.parse(mocks.fetch.mock.calls[2][1].body)).toMatchObject({
      prefix: "42",
      search: "synthetic-private.txt",
      limit: 2,
    });
    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({
      method: "DELETE",
      redirect: "error",
    });
  });
  it.each(["origin", "bucket"])(
    "rejects a changed %s before any network request",
    async change => {
      const binding = getStorageBinding();
      if (change === "origin")
        mocks.env.supabaseUrl = "https://replacement.supabase.co";
      else mocks.env.supabaseStorageBucket = "replacement-private";
      await expect(
        storageDeleteBound(binding, objectKey)
      ).rejects.toMatchObject({ code: "binding_changed" });
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );
  it.each([[{ name: "synthetic-private.txt" }], {}, null])(
    "does not report erasure from an unverified absence response",
    async result => {
      mocks.fetch
        .mockResolvedValueOnce(bucket())
        .mockResolvedValueOnce(response([]))
        .mockResolvedValueOnce(response(result));
      await expect(
        storageDeleteBound(getStorageBinding(), objectKey)
      ).rejects.toThrow("Private storage operation failed");
    }
  );
  it("rejects malformed paths and a public bucket before removal", async () => {
    await expect(
      storageDeleteBound(getStorageBinding(), "42/../other.txt")
    ).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce(
      response({ id: "irb-private", public: true })
    );
    await expect(
      storageDeleteBound(getStorageBinding(), objectKey)
    ).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});

describe("project Auth user removal", () => {
  it("verifies the captured UUID, deletes the project Auth user and confirms absence", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ id: subject }))
      .mockResolvedValueOnce(response({ id: subject }))
      .mockResolvedValueOnce(missing());
    await deleteSupabaseIdentity(origin, subject);
    expect(
      mocks.fetch.mock.calls.map(call => [call[0], call[1].method])
    ).toEqual(
      ["GET", "DELETE", "GET"].map(method => [
        `${origin}/auth/v1/admin/users/${subject}`,
        method,
      ])
    );
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
      should_soft_delete: false,
    });
    expect(
      mocks.fetch.mock.calls.every(call => call[1].redirect === "error")
    ).toBe(true);
  });
  it("treats authenticated typed absence as idempotent completion without another delete", async () => {
    mocks.fetch.mockResolvedValueOnce(missing());
    await deleteSupabaseIdentity(origin, subject);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][1].method).toBe("GET");
  });
  it.each([null, "https://another-project.supabase.co"])(
    "never redirects an unknown or different issuer to current project",
    async issuer => {
      await expect(
        deleteSupabaseIdentity(issuer, subject)
      ).rejects.toHaveProperty("code");
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );
  it.each(["../all-users", "", "dashboard-account", `${subject}?other=1`])(
    "rejects invalid project Auth subject %s",
    async id => {
      await expect(deleteSupabaseIdentity(origin, id)).rejects.toMatchObject({
        code: "invalid_scope",
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );
  it.each([
    response({ code: "not_admin" }, 401),
    response({ error: "unknown endpoint" }, 404),
    response({ id: "another-user" }),
  ])(
    "does not mistake unauthorized, generic404 or another identity for valid scope",
    async reply => {
      mocks.fetch.mockResolvedValueOnce(reply);
      await expect(deleteSupabaseIdentity(origin, subject)).rejects.toThrow(
        "Identity cleanup could not be verified"
      );
      expect(mocks.fetch).toHaveBeenCalledOnce();
    }
  );
  it("does not report completion while the identity remains after deletion", async () => {
    mocks.fetch.mockImplementation(async () => response({ id: subject }));
    await expect(deleteSupabaseIdentity(origin, subject)).rejects.toThrow(
      "Identity cleanup could not be verified"
    );
  });
  it("bounds a stalled egress lookup and prevents a late privileged request", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    mocks.egress.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    const operation = deleteSupabaseIdentity(origin, subject);
    const rejection = expect(operation).rejects.toThrow(
      "Identity cleanup could not be verified"
    );
    await vi.advanceTimersByTimeAsync(30_001);
    await rejection;
    release();
    await Promise.resolve();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
