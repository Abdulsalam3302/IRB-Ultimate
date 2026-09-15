/** Lightweight wire-field contract; public tool registration must not load form copy. */
export const STAGE2_KEYS = [
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
export type Stage2Field = (typeof STAGE2_KEYS)[number];
export type Stage2Values = Record<Stage2Field, string>;
