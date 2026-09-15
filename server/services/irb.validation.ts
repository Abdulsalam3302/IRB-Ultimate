import { canEditApplication } from "../../shared/applicationWorkflow";
import type { Application } from "../../drizzle/schema";

export { STAGE2_KEYS as STAGE2_FIELDS } from "../../shared/stage2Keys";
import { STAGE2_KEYS as STAGE2_FIELDS } from "../../shared/stage2Keys";

export const STAGE1_FIELDS = [
  "researchType",
  "irbCategory",
  "researchTitle",
  "principalInvestigator",
  "piEmail",
  "piInstitution",
  "piDepartment",
] as const;

export type RequiredFieldIssue = "empty" | "unresolved_placeholder";
/** Content presence is independent of scientific quality; short answers are not empty. */
export function getRequiredFieldIssue(value: unknown): RequiredFieldIssue | null {
  if (typeof value !== "string" || !value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()) return "empty";
  return /\[(?:STILL\s+MISSING|MISSING|NEEDS\s+APPLICANT|ASSUMPTION|TEMPLATE|BLOCKED)\b[^\]]*\]/i.test(value)
    ? "unresolved_placeholder" : null;
}

export function validateStageFieldIssues(data: Record<string, unknown>, fields: readonly string[]) {
  return fields.flatMap(field => {
    const reason = getRequiredFieldIssue(data[field]);
    return reason ? [{ field, reason }] : [];
  });
}

function isBlank(value: string | null | undefined): boolean {
  return getRequiredFieldIssue(value) !== null;
}

export function listMissingRequirements(app: Application): string[] {
  const missing: string[] = [];

  if (!app.declarationHonesty) missing.push("declaration_honesty");
  if (!app.declarationNbceCertification) missing.push("declaration_nbce_certification");
  if (!app.declarationConsentTruth) missing.push("declaration_consent_truth");
  if (!app.declarationAcceptPolicy) missing.push("declaration_accept_policy");
  if (!app.declarationCompletedAt) missing.push("declaration_phase");

  for (const field of STAGE1_FIELDS) {
    const value = app[field];
    if (typeof value === "string" && isBlank(value)) missing.push(field);
    else if (value === null || value === undefined) missing.push(field);
  }

  if (app.researchType === "survey_questionnaire" && isBlank(app.questionnaireFileUrl)) {
    missing.push("questionnaire_file");
  }
  if (app.researchType === "retrospective" && isBlank(app.retrospectiveDataSource)) {
    missing.push("retrospective_data_source");
  }

  for (const field of STAGE2_FIELDS) {
    if (isBlank(app[field])) missing.push(field);
  }

  // Screening findings accompany the application; an outage or advisory score
  // must never prevent a complete protocol from reaching a human committee.

  return missing;
}

export function validateApplicationReadiness(app: Application): {
  readyToSubmit: boolean;
  missing: string[];
  status: Application["status"];
} {
  const missing = listMissingRequirements(app);
  const readyToSubmit =
    canEditApplication(app) &&
    missing.length === 0;
  return { readyToSubmit, missing, status: app.status };
}

export const IRB_REQUIREMENTS = {
  authority: "Platform preparation checklist; the responsible institution determines binding requirements.",
  aiRole: "Advisory screening and preparation only; AI cannot authorize human-subject research.",
  launchStatus: "Institutional authority and qualified human committee activation required before issuing decisions.",
  studyTypes: [
    "clinical_trial",
    "observational",
    "retrospective",
    "survey_questionnaire",
    "case_study",
    "laboratory",
    "educational",
    "social_behavioral",
    "other",
  ] as const,
  irbCategories: ["full_board", "expedited", "exempt"] as const,
  requiredDocuments: [
    "nbce_certificate",
    "questionnaire",
    "protocol",
    "consent_form",
    "cv",
    "supporting_document",
  ],
  submissionSteps: [
    "declaration",
    "stage1_classification",
    "stage1_ai_review",
    "stage2_protocol",
    "stage2_ai_review",
    "final_submit_to_committee",
  ],
};
