import type { Application } from "../../drizzle/schema";
import { STAGE2_FIELDS as FIELD_LABELS } from "../../shared/stage2Fields";
import {
  listMissingRequirements,
  STAGE2_FIELDS,
  validateApplicationReadiness,
} from "./irb.validation";

const LABELS: Record<string, [string, string]> = {
  researchType: ["Study type", "نوع الدراسة"],
  irbCategory: ["Requested review category", "فئة المراجعة المطلوبة"],
  researchTitle: ["Research title", "عنوان البحث"],
  principalInvestigator: ["Principal investigator", "الباحث الرئيس"],
  piEmail: ["Investigator email", "البريد الإلكتروني للباحث"],
  piInstitution: ["Institution", "المؤسسة"],
  piDepartment: ["Department", "القسم"],
  questionnaire_file: ["Questionnaire attachment", "مرفق الاستبيان"],
  retrospective_data_source: ["Data source", "مصدر البيانات"],
  declaration_honesty: ["Accuracy declaration", "إقرار صحة المعلومات"],
  declaration_nbce_certification: [
    "Bioethics training declaration",
    "إقرار التدريب على أخلاقيات البحث",
  ],
  declaration_consent_truth: ["Consent declaration", "إقرار الموافقة"],
  declaration_accept_policy: ["Policy acceptance", "قبول السياسة"],
  declaration_phase: ["Complete declarations", "استكمال الإقرارات"],
};
function reviewState(
  value: string | null,
  score: number | null
): "not_reviewed" | "completed" | "unavailable" {
  if (value?.includes("[AI_UNAVAILABLE]")) return "unavailable";
  try {
    if (value && JSON.parse(value).status === "unavailable")
      return "unavailable";
  } catch {
    /* Legacy prose. */
  }
  return score == null ? "not_reviewed" : "completed";
}
export function getSubmissionReadiness(app: Application) {
  const alreadySubmitted = Boolean(
    app.submittedAt &&
    [
      "submitted",
      "under_review",
      "pending_admin",
      "approved",
      "rejected",
      "permanently_rejected",
      "retracted",
      "hidden",
    ].includes(app.status)
  );
  const missingFields = listMissingRequirements(app).map(field => {
    const protocolField = FIELD_LABELS.find(item => item.key === field);
    const labels = protocolField
      ? [protocolField.en, protocolField.ar]
      : LABELS[field] || [field, field];
    return {
      field,
      stage: (STAGE2_FIELDS.includes(field as (typeof STAGE2_FIELDS)[number])
        ? 2
        : 1) as 1 | 2,
      labelEn: labels[0],
      labelAr: labels[1],
    };
  });
  return {
    canSubmit:
      !alreadySubmitted && validateApplicationReadiness(app).readyToSubmit,
    missingFields,
    blockers: alreadySubmitted
      ? [
          {
            code: "ALREADY_SUBMITTED",
            messageEn: "This application has already been submitted.",
            messageAr: "تم تقديم هذا الطلب بالفعل.",
          },
        ]
      : [],
    ai: {
      stage1: reviewState(app.stage1AiFeedback, app.stage1AiScore),
      stage2: reviewState(app.stage2AiFeedback, app.stage2AiScore),
    },
    alreadySubmitted,
  };
}
