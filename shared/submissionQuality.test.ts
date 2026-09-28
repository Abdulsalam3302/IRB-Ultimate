import { describe, expect, it } from "vitest";
import { assessSubmissionQuality } from "./submissionQuality";

const strong = {
  researchType: "observational", fundingSource: "Self-funded", estimatedDuration: "12 months",
  researchObjectives: "Primary objective: estimate the prevalence of vitamin D deficiency. Secondary objectives: associations with age and sex.",
  methodology: "Cross-sectional design in two primary care centres in Riyadh. Participants complete a structured questionnaire and a routine blood test. Analysis uses descriptive statistics and logistic regression in R.",
  sampleSize: "384 participants, calculated with 95% confidence, 5% margin of error and an expected prevalence of 50%.",
  targetPopulation: "Adults aged 18–65 attending primary care.",
  inclusionCriteria: "Adults aged 18–65 years; attending the participating centres; able to consent.",
  exclusionCriteria: "Pregnancy; chronic kidney disease.",
  informedConsentProcess: "Written consent obtained by a trained research assistant. Participation is voluntary and participants may withdraw at any time without affecting their care. Risks, confidentiality and a study contact are explained.",
  riskAssessment: "Minimal risk: brief discomfort from venipuncture and a privacy risk, mitigated by trained phlebotomists and coded data.",
  confidentialityMeasures: "Data are de-identified with code numbers, stored on an encrypted institutional drive with access restricted to the study team, retained for 5 years and then destroyed. No transfer outside Saudi Arabia.",
  conflictOfInterest: "None declared.",
};

describe("pre-submission quality guidance", () => {
  it("recognises a well-prepared application", () => {
    const result = assessSubmissionQuality(strong);
    expect(result.items.filter(item => item.status !== "pass").map(item => item.id)).toEqual([]);
    expect(result.level).toBe("excellent");
    expect(result.score).toBe(100);
  });

  it("gives specific tips for thin sections and flags placeholders for attention", () => {
    const result = assessSubmissionQuality({ ...strong, sampleSize: "100", confidentialityMeasures: "Data will be kept confidential.", methodology: "[MISSING — please provide: design]" });
    const byId = Object.fromEntries(result.items.map(item => [item.id, item.status]));
    expect(byId.sample_justification).toBe("improve");
    expect(byId.data_protection).toBe("improve");
    expect(byId.no_placeholders).toBe("attention");
    expect(result.level).toBe("needs_work");
  });

  it("asks for extra safeguards with vulnerable groups, in Arabic too", () => {
    const flagged = assessSubmissionQuality({ ...strong, targetPopulation: "طلاب المرحلة الجامعية في الرياض" });
    expect(flagged.items.find(item => item.id === "vulnerable_safeguards")?.status).toBe("attention");
    const safe = assessSubmissionQuality({ ...strong, targetPopulation: "University students", informedConsentProcess: `${strong.informedConsentProcess} Recruitment is by an independent person and participation will not affect grades.` });
    expect(safe.items.find(item => item.id === "vulnerable_safeguards")?.status).toBe("pass");
  });

  it("expects a waiver rationale instead of consent elements for retrospective studies", () => {
    const result = assessSubmissionQuality({ ...strong, researchType: "retrospective", informedConsentProcess: "We request a waiver of consent because contacting patients is impracticable, the study is minimal risk and data are de-identified." });
    expect(result.items.find(item => item.id === "consent_waiver")?.status).toBe("pass");
    expect(result.items.some(item => item.id === "consent_elements")).toBe(false);
  });

  it("asks clinical trials for registration and SFDA pathway", () => {
    const result = assessSubmissionQuality({ ...strong, researchType: "clinical_trial" });
    expect(result.items.find(item => item.id === "trial_registration")?.status).toBe("attention");
    expect(assessSubmissionQuality({ ...strong, researchType: "clinical_trial", clinicalTrialDetails: "Will be registered in the Saudi Clinical Trials Registry before enrolment." }).items.find(item => item.id === "trial_registration")?.status).toBe("pass");
  });

  it("ignores placeholder markers quoted in AI feedback fields", () => {
    const result = assessSubmissionQuality({ ...strong, ...{ stage2AiFeedback: "[MISSING — example]" } } as never);
    expect(result.items.find(item => item.id === "no_placeholders")?.status).toBe("pass");
  });
});
