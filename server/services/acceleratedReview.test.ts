import { describe, expect, it } from "vitest";
import type { Application } from "../../drizzle/schema";
import { BOT_REVIEWERS, decideAcceleratedOutcome, runBotPanelReview, runSwarmReview } from "./acceleratedReview.service";

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: 1,
    applicantId: 1,
    irbNumber: null,
    status: "under_review",
    submissionCount: 1,
    declarationHonesty: true,
    declarationNbceCertification: true,
    declarationConsentTruth: true,
    declarationAcceptPolicy: true,
    nbceCertificateUrl: null,
    declarationCompletedAt: new Date(),
    researchType: "observational",
    irbCategory: "expedited",
    researchTitle: "Vitamin D Levels and Clinical Outcomes in Saudi MS Patients",
    principalInvestigator: "Jafar Ali Alkathem",
    piEmail: "pi@example.com",
    piInstitution: "King Faisal University",
    piDepartment: "Neurology",
    fundingSource: "None",
    estimatedDuration: "12 months",
    stage1AiScore: 90,
    stage1AiFeedback: null,
    stage1Passed: true,
    questionnaireFileUrl: null,
    retrospectiveDataSource: null,
    researchObjectives:
      "To evaluate the association between vitamin D levels and clinical outcomes among Saudi patients with multiple sclerosis using a cross-sectional protocol with predefined endpoints.",
    methodology:
      "Cross-sectional observational study with consecutive sampling, standardized laboratory assays, and statistical analysis using multivariable regression controlling for age, sex, and disease duration.",
    sampleSize: "250 participants",
    targetPopulation: "Adult Saudi patients with confirmed multiple sclerosis attending specialty clinics",
    inclusionCriteria: "Adults 18+ with confirmed MS diagnosis and consent",
    exclusionCriteria: "Pregnancy, inability to consent, acute infection",
    dataCollectionMethods: "Chart review and laboratory assays",
    informedConsentProcess:
      "Written informed consent in Arabic and English prior to any data collection, with the right to withdraw at any time.",
    riskAssessment:
      "Minimal risk observational study. Venipuncture is the only invasive procedure. Privacy risks are mitigated by coded datasets.",
    benefitAssessment: "Improved understanding of vitamin D in MS care in KSA",
    confidentialityMeasures:
      "Coded identifiers, encrypted storage, access limited to the PI team, and no public sharing of identifiable data.",
    conflictOfInterest: "None declared",
    stage2AiScore: 88,
    stage2AiFeedback: null,
    stage2Passed: true,
    adminNotes: null,
    rejectionReason: null,
    retractionReason: null,
    certificateUrl: null,
    retractionCertificateUrl: null,
    approvedAt: null,
    retractedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedAt: new Date(),
    ...overrides,
  } as Application;
}

describe("accelerated review swarm + bots", () => {
  it("passes a complete protocol on swarm and unanimous bots", () => {
    const swarm = runSwarmReview(app());
    const bots = runBotPanelReview(app());
    expect(swarm.panels).toHaveLength(6);
    expect(bots.reviewers).toHaveLength(BOT_REVIEWERS.length);
    expect(swarm.passed).toBe(true);
    expect(bots.passed).toBe(true);
    expect(swarm.passed || bots.passed).toBe(true);
  });

  it("fails incomplete protocols and requires owner attention", () => {
    const incomplete = app({
      methodology: "",
      informedConsentProcess: "",
      confidentialityMeasures: "",
      riskAssessment: "",
      stage1Passed: false,
      stage2Passed: false,
      researchObjectives: "",
    });
    const swarm = runSwarmReview(incomplete);
    const bots = runBotPanelReview(incomplete);
    expect(swarm.passed).toBe(false);
    expect(bots.passed).toBe(false);
  });
});

describe("accelerated pipeline decision order", () => {
  it("auto-approves on swarm pass without requiring bots", () => {
    expect(decideAcceleratedOutcome(true, null)).toBe("auto_approve");
  });

  it("runs bots only after swarm issues", () => {
    expect(decideAcceleratedOutcome(false, null)).toBe("run_bots");
  });

  it("auto-approves on unanimous bots after swarm fail", () => {
    const bots = runBotPanelReview(app());
    expect(decideAcceleratedOutcome(false, bots)).toBe("auto_approve");
  });

  it("alerts the owner when swarm and bots both fail", () => {
    const incomplete = app({
      methodology: "",
      informedConsentProcess: "",
      confidentialityMeasures: "",
      riskAssessment: "",
      stage1Passed: false,
      stage2Passed: false,
      researchObjectives: "",
    });
    const bots = runBotPanelReview(incomplete);
    expect(decideAcceleratedOutcome(false, bots)).toBe("owner_alert");
  });
});
