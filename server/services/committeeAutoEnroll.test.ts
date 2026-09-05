import { describe, expect, it } from "vitest";
import { ensureDefaultCommittee, plannedCommitteeSeats } from "./committeeAutoEnroll";

describe("committee appointment authority", () => {
  it("does not appoint administrators or simulated reviewers automatically", () => {
    expect(plannedCommitteeSeats([
      { id: 1, email: "owner@example.test", name: "Owner", role: "admin" },
      { id: 2, email: "researcher@example.test", name: "Researcher", role: "user" },
    ])).toEqual([]);
  });

  it("cannot reactivate a deliberately removed committee member", async () => {
    await expect(ensureDefaultCommittee()).resolves.toEqual({ seats: 0, created: 0, reactivated: 0 });
  });
});
