import { describe, expect, it } from "vitest";
import { reviewView, storedReview, reviewText } from "./aiReviewPresentation";
describe("unscored review presentation", () => {
  it.each([
    {
      score: 0,
      passed: false,
      feedback: "[AI_UNAVAILABLE] Provider failed",
      recommendations: ["Missing methodology"],
      fieldScores: [{ field: "methodology", score: 0, feedback: "Missing" }],
    },
    {
      status: "unavailable",
      score: 0,
      passed: false,
      recommendations: ["Fake missing"],
    },
  ])(
    "does not label provider failure as a research score or missing research",
    result => {
      expect(reviewView(result)).toMatchObject({
        status: "unavailable",
        score: null,
        passed: false,
        feedback: "",
        recommendations: [],
        fieldScores: [],
        issues: [],
      });
    }
  );
  it("preserves valid completed zero assessments instead of treating every zero as outage", () =>
    expect(
      reviewView({
        status: "completed",
        score: 0,
        passed: false,
        feedback: "Assessment completed",
      })
    ).toMatchObject({
      status: "completed",
      score: 0,
      feedback: "Assessment completed",
    }));
  it("shows exact structural issues with no numerical assessment", () =>
    expect(
      reviewView({
        status: "needs_information",
        score: null,
        issues: [{ field: "methodology", reason: "unresolved_placeholder" }],
      })
    ).toMatchObject({
      status: "needs_information",
      score: null,
      issues: [{ field: "methodology", reason: "unresolved_placeholder" }],
    }));
  it("handles legacy saved outage feedback without reviving its stored zero", () =>
    expect(
      storedReview(
        JSON.stringify({ feedback: "[AI_UNAVAILABLE] outage" }),
        0,
        false
      )?.score
    ).toBeNull());
  it("replaces canonical field names in bilingual recommendation prose", () => {
    expect(
      reviewText("Complete researchObjectives and conflictOfInterest.")
    ).toBe(
      "Complete Research objectives and Conflict of interest declaration."
    );
    expect(reviewText("methodology", true)).toBe("المنهجية");
  });
  it("retains completed per-field suggestions without promising a score", () =>
    expect(
      reviewView({
        status: "completed",
        score: 60,
        fieldScores: [
          {
            field: "researchTitle",
            score: 50,
            suggestion: "Proposed title based on existing study",
          },
        ],
      }).fieldSuggestions
    ).toEqual({ researchTitle: "Proposed title based on existing study" }));
  it.each([null, {}, { score: NaN }, { score: 101 }, { score: -1 }])(
    "does not coerce an invalid or absent assessment to zero",
    value =>
      expect(reviewView(value)).toMatchObject({
        status: "unavailable",
        score: null,
      })
  );
});
