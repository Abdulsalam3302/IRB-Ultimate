import express from "express";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(), file: vi.fn(), application: vi.fn(), committee: vi.fn(), reviews: vi.fn(), storageGet: vi.fn(),
}));
vi.mock("./_core/env", async importOriginal => {
  const original = await importOriginal<typeof import("./_core/env")>();
  return { ...original, ENV: { ...original.ENV, isProduction: true } };
});
vi.mock("./_core/context", () => ({ createContext: mocks.createContext }));
vi.mock("./storage", () => ({ storageGet: mocks.storageGet, storagePut: vi.fn() }));
vi.mock("./db", () => ({
  getFileUploadById: mocks.file, getApplicationById: mocks.application,
  getCommitteeMemberByUserId: mocks.committee, getReviewsByApplication: mocks.reviews,
  getUserById: vi.fn(async () => ({ name: "Synthetic researcher" })), getAuthorsByApplication: vi.fn(async () => []),
  getDb: vi.fn(async () => null),
}));
// Keep the real appRouter and application viewer authorization in this test.
import { registerIrbAgentRoutes } from "./agent/irbApiRoutes";

let server: Server, base: string;
function login(id: number, role = "user", authLevel = "aal1") {
  mocks.createContext.mockImplementation(async ({ req, res }) => ({ req, res, user: { id, role, authLevel, openId: `synthetic:${id}` } }));
}
async function download() { return fetch(`${base}/api/irb/files/123`, { redirect: "manual" }); }
beforeAll(async () => {
  const app = express(); registerIrbAgentRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STAFF_MFA_REQUIRED", "true");
  login(7);
  mocks.file.mockResolvedValue({ id: 123, userId: 8, applicationId: 42, fileKey: "8/synthetic-staff-document.pdf" });
  mocks.application.mockResolvedValue({ id: 42, applicantId: 7 });
  mocks.committee.mockResolvedValue(null); mocks.reviews.mockResolvedValue([]);
  mocks.storageGet.mockResolvedValue({ key: "8/synthetic-staff-document.pdf", url: "https://storage.example.invalid/synthetic-signed-download" });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

describe("private downloads follow application ownership and staff authority", () => {
  it("allows the aal1 applicant to download a staff-uploaded document on their own application", async () => {
    const response = await download();
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.storageGet).toHaveBeenCalledWith("8/synthetic-staff-document.pdf", 300);
    expect(mocks.committee).not.toHaveBeenCalled();
  });
  it("allows an uploader to retrieve their own unattached document", async () => {
    mocks.file.mockResolvedValue({ userId: 7, applicationId: null, fileKey: "7/synthetic.pdf" });
    expect((await download()).status).toBe(302);
    expect(mocks.application).not.toHaveBeenCalled();
  });
  it.each(["aal1", "aal2"])("requires MFA for an administrator reading another applicant's document (%s)", async aal => {
    login(9, "admin", aal);
    expect((await download()).status).toBe(aal === "aal2" ? 302 : 403);
    expect(mocks.storageGet).toHaveBeenCalledTimes(aal === "aal2" ? 1 : 0);
  });
  it.each(["aal1", "aal2"])("requires MFA as well as current assignment for a reviewer (%s)", async aal => {
    login(10, "reviewer", aal);
    mocks.committee.mockResolvedValue({ id: 50, isActive: true, appointedAt: new Date(), qualificationReference: "Synthetic appointment evidence" });
    mocks.reviews.mockResolvedValue([{ committeeMemberId: 50, status: "pending", expiresAt: new Date(Date.now() + 60_000) }]);
    expect((await download()).status).toBe(aal === "aal2" ? 302 : 403);
    expect(mocks.storageGet).toHaveBeenCalledTimes(aal === "aal2" ? 1 : 0);
  });
  it.each(["unassigned", "expired"])("denies an aal2 reviewer with %s authority", async condition => {
    login(10, "reviewer", "aal2");
    mocks.committee.mockResolvedValue({ id: 50, isActive: true, appointedAt: new Date(), qualificationReference: "Synthetic appointment evidence" });
    mocks.reviews.mockResolvedValue(condition === "unassigned" ? [] : [{ committeeMemberId: 50, status: "expired", expiresAt: new Date(Date.now() - 60_000) }]);
    expect((await download()).status).toBe(403);
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });
  it("denies an unassigned third party even with aal2", async () => {
    login(11, "user", "aal2");
    expect((await download()).status).toBe(403);
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });
  it.each(["aal1", "aal2"])("requires administrator MFA for somebody else's unattached upload (%s)", async aal => {
    login(9, "admin", aal);
    mocks.file.mockResolvedValue({ userId: 8, applicationId: null, fileKey: "8/synthetic.pdf" });
    expect((await download()).status).toBe(aal === "aal2" ? 302 : 403);
    expect(mocks.storageGet).toHaveBeenCalledTimes(aal === "aal2" ? 1 : 0);
  });
  it("denies anonymous downloads before looking up storage metadata", async () => {
    mocks.createContext.mockResolvedValue({ user: null });
    expect((await download()).status).toBe(401);
    expect(mocks.file).not.toHaveBeenCalled();
    expect(mocks.storageGet).not.toHaveBeenCalled();
  });
});
