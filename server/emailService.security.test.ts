import { beforeEach, describe, expect, it, vi } from "vitest";
const insert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("./db", () => ({ getDb: vi.fn(async () => ({ insert: () => ({ values: insert }) })) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(false) }));
import * as db from "./db";
import { createNotification, getUnreadCount, notifyAdminApproved, notifyCertificateIssued } from "./emailService";
beforeEach(() => vi.clearAllMocks());
describe("in-app notification evidence", () => {
  it("preserves important events with unknown legacy types instead of dropping them", async () => {
    expect(await createNotification({ userId: 1, type: "admin", title: "x".repeat(400), message: "Text\u0000" })).toBe(true);
    expect(insert.mock.calls[0][0]).toMatchObject({ type: "general", message: "Text" });
    expect(insert.mock.calls[0][0].title).toHaveLength(255);
  });
  it("does not infer generated documents or one-year validity from approval", async () => {
    await notifyAdminApproved(1, 2, "IRB-TEST");
    await notifyCertificateIssued(1, 2, "IRB-TEST");
    const messages = insert.mock.calls.map(call => call[0].message);
    expect(messages[0]).not.toContain("has been generated");
    expect(messages[1]).not.toContain("one year");
    expect(messages[1]).toContain("responsible committee record");
  });
  it("does not report zero unread notifications when storage is unavailable", async () => {
    vi.mocked(db.getDb).mockResolvedValueOnce(null);
    await expect(getUnreadCount(1)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
