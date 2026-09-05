import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../_core/env", () => ({
  ENV: { storageProvider: "local", isProduction: false },
}));

describe("exact local development object cleanup", () => {
  let fixture: string;
  let storage: typeof import("../storage");
  beforeAll(async () => {
    fixture = await mkdtemp(path.join(tmpdir(), "irb-storage-deletion-"));
    vi.stubEnv("UPLOADS_DIR", path.join(fixture, "uploads"));
    storage = await import("../storage");
    await mkdir(path.join(fixture, "uploads", "42"), { recursive: true });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (fixture) await rm(fixture, { recursive: true, force: true });
  });
  it("removes only the exact owned key and handles already-missing objects", async () => {
    await writeFile(
      path.join(fixture, "uploads", "42", "remove.txt"),
      "Synthetic remove"
    );
    await writeFile(
      path.join(fixture, "uploads", "42", "keep.txt"),
      "Synthetic keep"
    );
    await storage.storageDeleteBound(
      storage.getStorageBinding(),
      "42/remove.txt"
    );
    await expect(
      readFile(path.join(fixture, "uploads", "42", "remove.txt"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await readFile(path.join(fixture, "uploads", "42", "keep.txt"), "utf8")
    ).toBe("Synthetic keep");
    await expect(
      storage.storageDeleteBound(storage.getStorageBinding(), "42/remove.txt")
    ).resolves.toBeUndefined();
  });
  it("blocks a symlink parent that escapes the captured upload root", async () => {
    await mkdir(path.join(fixture, "elsewhere"));
    await writeFile(
      path.join(fixture, "elsewhere", "keep.txt"),
      "Synthetic outside"
    );
    await symlink(
      path.join(fixture, "elsewhere"),
      path.join(fixture, "uploads", "escape")
    );
    await expect(
      storage.storageDeleteBound(storage.getStorageBinding(), "escape/keep.txt")
    ).rejects.toMatchObject({ code: "invalid_scope" });
    expect(
      await readFile(path.join(fixture, "elsewhere", "keep.txt"), "utf8")
    ).toBe("Synthetic outside");
  });
  it("refuses a changed upload-root binding before deletion", async () => {
    await expect(
      storage.storageDeleteBound(
        {
          ...storage.getStorageBinding(),
          storageOrigin: path.join(fixture, "elsewhere"),
        },
        "42/keep.txt"
      )
    ).rejects.toMatchObject({ code: "binding_changed" });
    expect(
      await readFile(path.join(fixture, "uploads", "42", "keep.txt"), "utf8")
    ).toBe("Synthetic keep");
  });
  it("does not overwrite an existing local key that may have a cleanup reservation", async () => {
    await storage.storagePut(
      "42/immutable.txt",
      "First synthetic file",
      "text/plain"
    );
    await expect(
      storage.storagePut("42/immutable.txt", "Replacement", "text/plain")
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(
      await readFile(
        path.join(fixture, "uploads", "42", "immutable.txt"),
        "utf8"
      )
    ).toBe("First synthetic file");
  });
});
