import { describe, expect, it } from "vitest";
import type { Application } from "../../drizzle/schema";
import { listMissingRequirements } from "./irb.validation";

function blankApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 1,
    applicantId: 1,
    status: "draft",
    declarationHonesty: false,
    declarationNbceCertification: false,
    declarationConsentTruth: false,
    declarationAcceptPolicy: false,
    declarationCompletedAt: null,
    researchTitle: null,
    researchType: null,
    irbCategory: null,
    principalInvestigator: null,
    piEmail: null,
    piInstitution: null,
    piDepartment: null,
    researchObjectives: null,
    methodology: null,
    sampleSize: null,
    targetPopulation: null,
    inclusionCriteria: null,
    exclusionCriteria: null,
    dataCollectionMethods: null,
    informedConsentProcess: null,
    riskAssessment: null,
    benefitAssessment: null,
    confidentialityMeasures: null,
    conflictOfInterest: null,
    stage1Passed: null,
    stage2Passed: null,
    questionnaireFileUrl: null,
    retrospectiveDataSource: null,
    ...overrides,
  } as Application;
}

describe("irb.validation", () => {
  it("lists missing fields on empty draft", () => {
    const missing = listMissingRequirements(blankApp());
    expect(missing.length).toBeGreaterThan(5);
    expect(missing).toContain("researchTitle");
  });

  it("exports official requirement catalog", async () => {
    const { IRB_REQUIREMENTS } = await import("./irb.validation");
    expect(IRB_REQUIREMENTS.studyTypes).toContain("clinical_trial");
    expect(IRB_REQUIREMENTS.irbCategories).toEqual(["full_board", "expedited", "exempt"]);
  });
});
