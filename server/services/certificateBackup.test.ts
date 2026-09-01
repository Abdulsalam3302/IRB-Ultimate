import { describe, expect, it } from "vitest";
import { expiredBackupDayKeys } from "./certificateBackup";

describe("certificate backup prune", () => {
  it("drops day folders older than 30 days and keeps recent ones", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    const expired = expiredBackupDayKeys(
      ["2026-08-01", "2026-08-02", "2026-08-31", "not-a-day", "2026-09-01"],
      now,
      30,
    );
    expect(expired).toContain("2026-08-01");
    expect(expired).not.toContain("2026-08-02");
    expect(expired).not.toContain("2026-08-31");
    expect(expired).not.toContain("2026-09-01");
    expect(expired).not.toContain("not-a-day");
  });
});
