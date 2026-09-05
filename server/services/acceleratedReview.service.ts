import type { Application } from "../../drizzle/schema";
import { listMissingRequirements } from "./irb.validation";

/** Six-panel digital swarm — uses completed MiniMax stage scores + protocol completeness. */
export const SWARM_PANELS = [
  "methodology",
  "ethics",
  "regulatory",
  "patient_advocacy",
  "privacy",
  "scientific_merit",
] as const;

export type SwarmPanelId = (typeof SWARM_PANELS)[number];

export type PanelReviewResult = {
  panel: SwarmPanelId;
  passed: boolean;
  score: number;
  findings: string[];
};

export type SwarmReviewResult = {
  passed: boolean;
  overallScore: number;
  panels: PanelReviewResult[];
  summary: string;
};

export const BOT_REVIEWERS = [
  {
    email: "ethics-checklist@automation.invalid",
    name: "Automated ethics checklist",
    specialty: "ethics",
  },
  {
    email: "methodology-checklist@automation.invalid",
    name: "Automated methodology checklist",
    specialty: "methodology",
  },
  {
    email: "clinical-checklist@automation.invalid",
    name: "Automated clinical checklist",
    specialty: "clinical",
  },
  {
    email: "privacy-checklist@automation.invalid",
    name: "Automated privacy checklist",
    specialty: "privacy",
  },
] as const;

export type BotReviewResult = {
  reviewer: (typeof BOT_REVIEWERS)[number];
  passed: boolean;
  score: number;
  comments: string;
};

export type BotPanelResult = {
  passed: boolean;
  unanimous: boolean;
  approvals: number;
  reviewers: BotReviewResult[];
};

/** Presence check only. Text length cannot establish scientific or ethical quality. */
function scoreField(value: string | null | undefined, _legacyMinLen: number): number {
  if (!value?.trim() || /\[(?:MISSING|STILL MISSING|NEEDS APPLICANT|ASSUMPTION|TEMPLATE|BLOCKED)\b/i.test(value)) return 0;
  return 100;
}

function reviewPanel(app: Application, panel: SwarmPanelId): PanelReviewResult {
  const findings: string[] = [];
  let score = 100;
  const missing = listMissingRequirements(app);
  if (missing.length > 0) {
    findings.push(`Missing requirements: ${missing.slice(0, 8).join(", ")}`);
    score -= Math.min(40, missing.length * 4);
  }

  switch (panel) {
    case "methodology":
      score = Math.min(score, scoreField(app.methodology, 80));
      score = Math.min(score, scoreField(app.sampleSize, 5));
      if (!app.dataCollectionMethods) findings.push("Data collection methods not documented");
      break;
    case "ethics":
      score = Math.min(score, scoreField(app.riskAssessment, 50));
      score = Math.min(score, scoreField(app.informedConsentProcess, 50));
      if (!app.benefitAssessment) findings.push("Benefit assessment incomplete");
      break;
    case "regulatory":
      if (!app.declarationCompletedAt) findings.push("Declaration phase incomplete");
      if (!app.stage1Passed) findings.push("Stage 1 AI review not passed");
      if (!app.stage2Passed) findings.push("Stage 2 AI review not passed");
      score = Math.min(score, app.stage1Passed && app.stage2Passed ? 100 : 55);
      if (typeof app.stage1AiScore === "number") score = Math.min(score, app.stage1AiScore);
      if (typeof app.stage2AiScore === "number") score = Math.min(score, app.stage2AiScore);
      break;
    case "patient_advocacy":
      score = Math.min(score, scoreField(app.targetPopulation, 40));
      score = Math.min(score, scoreField(app.inclusionCriteria, 30));
      break;
    case "privacy":
      score = Math.min(score, scoreField(app.confidentialityMeasures, 40));
      if (!app.conflictOfInterest) findings.push("Conflict of interest statement missing");
      break;
    case "scientific_merit":
      score = Math.min(score, scoreField(app.researchObjectives, 60));
      score = Math.min(score, scoreField(app.researchTitle, 20));
      break;
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 75 && findings.length === 0;
  return { panel, passed, score, findings };
}

export function runSwarmReview(app: Application): SwarmReviewResult {
  const panels = SWARM_PANELS.map(p => reviewPanel(app, p));
  const overallScore = Math.round(
    panels.reduce((sum, p) => sum + p.score, 0) / panels.length,
  );
  const passed = listMissingRequirements(app).length === 0 && panels.every(p => p.passed);
  return {
    passed,
    overallScore,
    panels,
    summary: passed
      ? "Automated completeness checks passed — qualified human committee review required; no ethics decision issued"
      : "Automated completeness checks require attention — advisory only",
  };
}

function reviewAsBot(
  app: Application,
  reviewer: (typeof BOT_REVIEWERS)[number],
): BotReviewResult {
  const missing = listMissingRequirements(app);
  let score = 100;
  const comments: string[] = [];
  if (missing.length > 0) {
    score -= missing.length * 5;
    comments.push(`Outstanding items: ${missing.slice(0, 5).join(", ")}`);
  }
  if (reviewer.specialty === "ethics") score = Math.min(score, scoreField(app.riskAssessment, 50));
  if (reviewer.specialty === "methodology") score = Math.min(score, scoreField(app.methodology, 80));
  if (reviewer.specialty === "clinical") score = Math.min(score, scoreField(app.targetPopulation, 40));
  if (reviewer.specialty === "privacy") score = Math.min(score, scoreField(app.confidentialityMeasures, 40));
  score = Math.max(0, Math.min(100, score));
  const passed = score >= 70 && Boolean(app.stage1Passed) && Boolean(app.stage2Passed);
  return {
    reviewer,
    passed,
    score,
    comments:
      comments.join("; ") ||
      (passed ? "Protocol meets specialty checklist." : "Revision recommended."),
  };
}

export function runBotPanelReview(app: Application): BotPanelResult {
  const reviewers = BOT_REVIEWERS.map(r => reviewAsBot(app, r));
  const approvals = reviewers.filter(r => r.passed).length;
  return {
    passed: approvals === BOT_REVIEWERS.length,
    unanimous: approvals === BOT_REVIEWERS.length,
    approvals,
    reviewers,
  };
}

export type AcceleratedDecision = "human_review" | "run_bots" | "owner_alert";

/** Heuristics can route a case to a human committee, never authorize research. */
export function decideAcceleratedOutcome(swarmPassed: boolean, bots: BotPanelResult | null): AcceleratedDecision {
  if (swarmPassed) return "human_review";
  if (!bots) return "run_bots";
  if (bots.passed) return "human_review";
  return "owner_alert";
}
