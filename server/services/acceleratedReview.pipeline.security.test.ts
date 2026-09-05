import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ addAuditLog: vi.fn(), getUserByEmail: vi.fn().mockResolvedValue(null), updateApplication: vi.fn(), generateIrbNumber: vi.fn() }));
vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("../emailService", () => ({ createNotification: vi.fn() }));
import * as db from "../db";
import { applyOfficialDigitalApproval } from "./acceleratedReview.pipeline";
describe("automated decision authority boundary", () => {
  it("blocks approval despite all affirmative model and heuristic outputs", async () => {
    const result = await applyOfficialDigitalApproval({ applicationId: 1, actorUserId: 7, via: "all bots approved", swarm: { passed: true, overallScore: 100, panels: [], summary: "perfect" }, bots: { passed: true, unanimous: true, approvals: 4, reviewers: [] } });
    expect(result.action).toBe("owner_alert");
    expect(db.updateApplication).not.toHaveBeenCalled();
    expect(db.generateIrbNumber).not.toHaveBeenCalled();
    expect(db.addAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "automated_approval_blocked" }));
  });
});
