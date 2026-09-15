import { labelStage2Text } from "@shared/stage2Fields";
export type ReviewIssue = {
  field: string;
  reason: "empty" | "unresolved_placeholder";
};
export type ReviewView = {
  status: "completed" | "needs_information" | "unavailable";
  score: number | null;
  passed: boolean;
  feedback: string;
  recommendations: string[];
  fieldScores: { field: string; score: number; feedback: string }[];
  fieldSuggestions: Record<string, string>;
  issues: ReviewIssue[];
  cached: boolean;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function reviewView(value: unknown): ReviewView {
  const raw = object(value);
  const feedback = typeof raw.feedback === "string" ? raw.feedback : "";
  const unavailable =
    raw.status === "unavailable" || /^\s*\[AI_UNAVAILABLE\]/i.test(feedback);
  const score =
    typeof raw.score === "number" &&
    Number.isFinite(raw.score) &&
    raw.score >= 0 &&
    raw.score <= 100
      ? raw.score
      : null;
  const status = unavailable
    ? "unavailable"
    : raw.status === "needs_information"
      ? "needs_information"
      : score !== null
        ? "completed"
        : "unavailable";
  const complete = status === "completed";
  return {
    status,
    score: complete ? score : null,
    passed: complete && raw.passed === true,
    feedback: complete ? feedback : "",
    recommendations:
      complete && Array.isArray(raw.recommendations)
        ? raw.recommendations
            .filter((text): text is string => typeof text === "string")
            .slice(0, 30)
        : [],
    fieldScores:
      complete && Array.isArray(raw.fieldScores)
        ? raw.fieldScores.flatMap(item => {
            const row = object(item);
            return typeof row.field === "string" &&
              typeof row.score === "number" &&
              Number.isFinite(row.score) &&
              row.score >= 0 &&
              row.score <= 100
              ? [
                  {
                    field: row.field,
                    score: row.score,
                    feedback:
                      typeof row.feedback === "string" ? row.feedback : "",
                  },
                ]
              : [];
          })
        : [],
    fieldSuggestions: complete
      ? {
          ...Object.fromEntries(
            (Array.isArray(raw.fieldScores) ? raw.fieldScores : []).flatMap(
              value => {
                const row = object(value);
                return typeof row.field === "string" &&
                  typeof row.suggestion === "string"
                  ? [[row.field, row.suggestion]]
                  : [];
              }
            )
          ),
          ...Object.fromEntries(
            Object.entries(object(raw.fieldSuggestions)).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          ),
        }
      : {},
    issues:
      status === "needs_information" && Array.isArray(raw.issues)
        ? raw.issues.flatMap(item => {
            const row = object(item);
            return typeof row.field === "string" &&
              (row.reason === "empty" ||
                row.reason === "unresolved_placeholder")
              ? [{ field: row.field, reason: row.reason } as ReviewIssue]
              : [];
          })
        : [],
    cached: raw.cached === true,
  };
}
export function storedReview(
  feedback: string | null | undefined,
  score: number | null | undefined,
  passed: boolean | null | undefined
): ReviewView | null {
  if (!feedback) return null;
  try {
    return reviewView({
      ...object(JSON.parse(feedback)),
      score: score ?? null,
      passed: passed === true,
    });
  } catch {
    return /^\s*\[AI_UNAVAILABLE\]/.test(feedback)
      ? reviewView({ feedback })
      : null;
  }
}
export const reviewText = labelStage2Text;
