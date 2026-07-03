/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

export type ResearchType =
  | "clinical_trial"
  | "observational"
  | "retrospective"
  | "survey_questionnaire"
  | "case_study"
  | "laboratory"
  | "educational"
  | "social_behavioral"
  | "other";

// Mirrors drizzle/schema.ts → applications.irbCategory enum. The UI
// currently defaults everything to full_board, but the DB (and older
// records) legitimately carry expedited/exempt — labels must resolve.
export type IrbCategory = "full_board" | "expedited" | "exempt";

export type ApplicationStatus =
  | "draft"
  | "declaration_pending"
  | "stage1_pending"
  | "stage1_failed"
  | "stage2_pending"
  | "stage2_failed"
  | "submitted"
  | "under_review"
  | "pending_admin"
  | "approved"
  | "rejected"
  | "resubmission_required"
  | "permanently_rejected"
  | "retracted"
  | "hidden";

export type ReviewStatus = "pending" | "approved" | "rejected" | "expired";

export const RESEARCH_TYPE_LABELS: Record<ResearchType, string> = {
  clinical_trial: "Clinical Trial",
  observational: "Observational Study",
  retrospective: "Retrospective Study",
  survey_questionnaire: "Survey / Questionnaire",
  case_study: "Case Study / Case Report",
  laboratory: "Laboratory Research",
  educational: "Educational Research",
  social_behavioral: "Social & Behavioral Research",
  other: "Other",
};

export const IRB_CATEGORY_LABELS: Record<IrbCategory, string> = {
  full_board: "Full Board Review",
  expedited: "Expedited Review",
  exempt: "Exempt Review",
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  declaration_pending: "Declaration - Phase 0",
  stage1_pending: "Stage 1 - AI Review",
  stage1_failed: "Stage 1 - Needs Revision",
  stage2_pending: "Stage 2 - AI Review",
  stage2_failed: "Stage 2 - Needs Revision",
  submitted: "Submitted",
  under_review: "Under Committee Review",
  pending_admin: "Pending Admin Approval",
  approved: "Approved",
  rejected: "Rejected - Resubmission Required",
  resubmission_required: "Resubmission Required",
  permanently_rejected: "Permanently Rejected",
  retracted: "Retracted",
  hidden: "Hidden",
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  declaration_pending: "bg-amber-100 text-amber-700",
  stage1_pending: "bg-blue-100 text-blue-700",
  stage1_failed: "bg-orange-100 text-orange-700",
  stage2_pending: "bg-blue-100 text-blue-700",
  stage2_failed: "bg-orange-100 text-orange-700",
  submitted: "bg-indigo-100 text-indigo-700",
  under_review: "bg-purple-100 text-purple-700",
  pending_admin: "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  resubmission_required: "bg-orange-100 text-orange-700",
  permanently_rejected: "bg-red-200 text-red-800",
  retracted: "bg-red-300 text-red-900",
  hidden: "bg-gray-300 text-gray-800",
};

export const AI_PASS_THRESHOLD = 70;

export interface AuthorInfo {
  name: string;
  email: string;
  phone?: string;
  institution?: string;
  department?: string;
  country?: string;
}

// Research-type-specific mandatory/optional fields
export const RESEARCH_TYPE_REQUIREMENTS: Record<ResearchType, {
  mandatory: string[];
  optional: string[];
  description: string;
}> = {
  survey_questionnaire: {
    mandatory: ["questionnaireFile"],
    optional: [],
    description: "The questionnaire/survey instrument file must be uploaded for review.",
  },
  retrospective: {
    mandatory: ["retrospectiveDataSource"],
    optional: [],
    description: "You must specify the data source(s) from which information will be obtained.",
  },
  clinical_trial: {
    mandatory: [],
    optional: ["clinicalTrialDetails", "supplementaryFiles"],
    description: "Optionally provide clinical trial details and supplementary documents.",
  },
  laboratory: {
    mandatory: [],
    optional: ["labHeadApproval", "labHeadName", "labHeadEmail", "labHeadPhone"],
    description: "Optionally provide lab head approval information.",
  },
  observational: { mandatory: [], optional: [], description: "" },
  case_study: { mandatory: [], optional: [], description: "" },
  educational: { mandatory: [], optional: [], description: "" },
  social_behavioral: { mandatory: [], optional: [], description: "" },
  other: { mandatory: [], optional: [], description: "" },
};
