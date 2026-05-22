/**
 * Maps application database fields → template field IDs for the Format export.
 */

import type { FormattableSlug } from "./templateFields";

export type PrefillAuthor = {
  name: string;
  email?: string | null;
  institution?: string | null;
  department?: string | null;
  country?: string | null;
};

export type PrefillApplication = {
  researchTitle?: string | null;
  researchType?: string | null;
  irbCategory?: string | null;
  principalInvestigator?: string | null;
  piEmail?: string | null;
  piInstitution?: string | null;
  piDepartment?: string | null;
  fundingSource?: string | null;
  estimatedDuration?: string | null;
  researchObjectives?: string | null;
  methodology?: string | null;
  sampleSize?: string | null;
  targetPopulation?: string | null;
  inclusionCriteria?: string | null;
  exclusionCriteria?: string | null;
  dataCollectionMethods?: string | null;
  informedConsentProcess?: string | null;
  riskAssessment?: string | null;
  benefitAssessment?: string | null;
  confidentialityMeasures?: string | null;
  conflictOfInterest?: string | null;
  declarationHonesty?: boolean | null;
  declarationNbceCertification?: boolean | null;
  declarationConsentTruth?: boolean | null;
  declarationAcceptPolicy?: boolean | null;
};

function fmtAuthors(authors: PrefillAuthor[]): string {
  if (!authors.length) return "";
  return authors
    .map((a, i) => {
      const parts = [a.name];
      if (a.institution) parts.push(a.institution);
      if (a.email) parts.push(a.email);
      return `${i + 1}) ${parts.join(" — ")}`;
    })
    .join("\n");
}

function fmtPi(app: PrefillApplication): string {
  const parts = [
    app.principalInvestigator,
    [app.piInstitution, app.piDepartment].filter(Boolean).join(", "),
    app.piEmail,
  ].filter(Boolean);
  return parts.join(" — ");
}

function fmtType(app: PrefillApplication): string {
  return [
    app.researchType ? `Type: ${app.researchType}` : "",
    app.irbCategory ? `IRB: ${app.irbCategory}` : "",
    app.estimatedDuration ? `Duration: ${app.estimatedDuration}` : "",
    app.fundingSource ? `Funding: ${app.fundingSource}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function fmtMethodology(app: PrefillApplication): string {
  return [
    app.methodology,
    app.sampleSize ? `Sample size: ${app.sampleSize}` : "",
    app.targetPopulation ? `Population: ${app.targetPopulation}` : "",
    app.inclusionCriteria ? `Inclusion: ${app.inclusionCriteria}` : "",
    app.exclusionCriteria ? `Exclusion: ${app.exclusionCriteria}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fmtEthicsDeclaration(app: PrefillApplication): string {
  const checks = [
    app.declarationHonesty ? "✓ Honesty declaration accepted" : "",
    app.declarationNbceCertification ? "✓ NBCE certification declared" : "",
    app.declarationConsentTruth ? "✓ Consent truth declared" : "",
    app.declarationAcceptPolicy ? "✓ Platform policy accepted" : "",
  ].filter(Boolean);
  return checks.length
    ? checks.join("\n")
    : "I declare that all information submitted is truthful and complete.";
}

export function buildPrefillMap(
  slug: FormattableSlug,
  app: PrefillApplication,
  authors: PrefillAuthor[] = [],
): Record<string, string> {
  const coAuthors = fmtAuthors(authors);

  const maps: Record<FormattableSlug, Record<string, string>> = {
    "irb-application-form": {
      pi_name: app.principalInvestigator ?? "",
      pi_institution: fmtPi(app),
      research_title: app.researchTitle ?? "",
      research_type: fmtType(app),
      objectives: app.researchObjectives ?? "",
      co_investigators: coAuthors,
      ethics_declaration: fmtEthicsDeclaration(app),
    },
    "informed-consent": {
      study_title: [app.researchTitle, app.principalInvestigator, app.piEmail]
        .filter(Boolean)
        .join(" | "),
      purpose: app.researchObjectives ?? "",
      participation: app.informedConsentProcess ?? app.dataCollectionMethods ?? "",
      risks: app.riskAssessment ?? "",
      benefits: app.benefitAssessment ?? "",
      confidentiality: app.confidentialityMeasures ?? "",
      voluntary:
        "Participation is voluntary. You may withdraw at any time without penalty.",
      consent_signature: app.informedConsentProcess ?? "",
    },
    "research-protocol": {
      background: app.researchObjectives ?? "",
      objectives: app.researchObjectives ?? "",
      methodology: fmtMethodology(app),
      data_collection: app.dataCollectionMethods ?? "",
      statistics: app.sampleSize ? `Sample size: ${app.sampleSize}` : "",
      ethics: [
        app.riskAssessment ? `Risks: ${app.riskAssessment}` : "",
        app.benefitAssessment ? `Benefits: ${app.benefitAssessment}` : "",
        app.confidentialityMeasures ? `Confidentiality: ${app.confidentialityMeasures}` : "",
        app.conflictOfInterest ? `COI: ${app.conflictOfInterest}` : "",
        app.informedConsentProcess ? `Consent: ${app.informedConsentProcess}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      timeline: [app.estimatedDuration, app.fundingSource].filter(Boolean).join(" | "),
    },
    "data-collection-instrument": {
      participant_code: "",
      demographics: app.targetPopulation ?? "",
      study_items: app.dataCollectionMethods ?? "",
      reliability: "",
    },
  };

  return maps[slug] ?? {};
}
