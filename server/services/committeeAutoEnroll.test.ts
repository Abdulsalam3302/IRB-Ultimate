import { describe, expect, it } from "vitest";
import { BOT_REVIEWERS } from "./acceleratedReview.service";
import { plannedCommitteeSeats } from "./committeeAutoEnroll";

describe("committee auto-enroll", () => {
  it("includes the four designated digital reviewers at irbtest.sa", () => {
    expect(BOT_REVIEWERS).toHaveLength(4);
    const emails = BOT_REVIEWERS.map(r => r.email).sort();
    expect(emails).toEqual([
      "hanan.aldosari.ethics@irbtest.sa",
      "majed.alotaibi.methods@irbtest.sa",
      "reem.alshammari.clinical@irbtest.sa",
      "yazeed.alghamdi.privacy@irbtest.sa",
    ]);
    expect(BOT_REVIEWERS.map(r => r.name)).toEqual([
      "Dr. Hanan Al-Dosari",
      "Dr. Majed Al-Otaibi",
      "Dr. Reem Al-Shammari",
      "Dr. Yazeed Al-Ghamdi",
    ]);
  });

  it("auto-enrolls every admin plus the four bots", () => {
    const seats = plannedCommitteeSeats([
      { id: 1, email: "kubee3302@gmail.com", name: "Dr. Abdulsalam Aleid", role: "admin" },
      { id: 2, email: "pi@university.edu.sa", name: "Researcher", role: "user" },
      { id: 3, email: "second.admin@irbtest.sa", name: "Deputy", role: "admin" },
    ]);
    const bots = seats.filter(s => s.kind === "bot");
    const admins = seats.filter(s => s.kind === "admin");
    expect(bots).toHaveLength(4);
    expect(admins).toHaveLength(2);
    expect(admins.map(a => a.userId).sort()).toEqual([1, 3]);
    expect(seats.some(s => s.email === "pi@university.edu.sa")).toBe(false);
  });
});
