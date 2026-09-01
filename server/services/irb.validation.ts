import type { Application } from "../../drizzle/schema";

const STAGE2_FIELDS = [
  "researchObjectives",
  "methodology",
  "sampleSize",
  "targetPopulation",
  "inclusionCriteria",
  "exclusionCriteria",
  "dataCollectionMethods",
  "informedConsentProcess",
  "riskAssessment",
  "benefitAssessment",
  "confidentialityMeasures",
  "conflictOfInterest",
] as const;

const STAGE1_FIELDS = [
  "researchType",
  "irbCategory",
  "researchTitle",
  "principalInvestigator",
  "piEmail",
  "piInstitution",
  "piDepartment",
] as const;

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function listMissingRequirements(app: Application): string[] {
  const missing: string[] = [];

  if (!app.declarationCompletedAt) {
    if (!app.declarationHonesty) missing.push("declaration_honesty");
    if (!app.declarationNbceCertification) missing.push("declaration_nbce_certification");
    if (!app.declarationConsentTruth) missing.push("declaration_consent_truth");
    if (!app.declarationAcceptPolicy) missing.push("declaration_accept_policy");
    if (missing.length === 0) missing.push("declaration_phase");
  }

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

  if (!app.stage1Passed) missing.push("stage1_ai_review_pass");
  if (!app.stage2Passed) missing.push("stage2_ai_review_pass");

  return missing;
}

export function validateApplicationReadiness(app: Application): {
  readyToSubmit: boolean;
  missing: string[];
  status: Application["status"];
} {
  const missing = listMissingRequirements(app);
  const readyToSubmit =
    app.status === "submitted" &&
    missing.length === 0 &&
    Boolean(app.stage1Passed) &&
    Boolean(app.stage2Passed);
  return { readyToSubmit, missing, status: app.status };
}

export const IRB_REQUIREMENTS = {
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
  ],
  irbCategories: ["full_board", "expedited", "exempt"],
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
