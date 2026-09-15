import { describe, expect, it } from "vitest";
import { canEditApplication } from "./applicationWorkflow";

describe("shared application edit authority", () => {
  it("permits a legacy passed draft only before its real submission timestamp", () => {
    expect(canEditApplication({ status: "submitted", submittedAt: null })).toBe(true);
    expect(canEditApplication({ status: "submitted" })).toBe(true);
    for (const submittedAt of [new Date(), "2026-09-15T00:00:00Z", "invalid", ""]) {
      expect(canEditApplication({ status: "submitted", submittedAt })).toBe(false);
    }
  });
  it.each(["draft", "declaration_pending", "stage1_pending", "stage1_failed", "stage2_pending", "stage2_failed", "resubmission_required"])("keeps explicit preparation/revision state %s editable even with a previous submission timestamp", status => {
    expect(canEditApplication({ status, submittedAt: new Date() })).toBe(true);
  });
  it.each(["under_review", "pending_admin", "approved", "rejected", "permanently_rejected", "retracted", "hidden", "unknown"])("never allows terminal or committee state %s to be edited", status => {
    expect(canEditApplication({ status, submittedAt: null })).toBe(false);
    expect(canEditApplication({ status, submittedAt: new Date() })).toBe(false);
  });
});
