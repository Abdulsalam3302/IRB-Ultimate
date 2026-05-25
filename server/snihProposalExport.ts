/**
 * SNIH-style combined research proposal DOCX (P001–P006 sections).
 * AI-filled from Stage 1 & 2 application data. Requires Stage 2 complete.
 */

import {
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from "docx";
import type { Application } from "../drizzle/schema";
import { invokeLLM, safeJsonParse } from "./_core/llm";
import { AUTHOR, BRAND, PLATFORM } from "@shared/branding";

type ProposalAiContent = {
  abstract: string;
  introduction: string;
  literatureReview: string;
  innovation: string;
  methodology: string;
  references: string[];
  letterOfIntent: {
    projectSummary: string;
    alignment: string;
    methodologyBrief: string;
    timeline: string;
    impact: string;
    infrastructure: string;
  };
  budget: {
    summary: string;
    lineItems: { item: string; category: string; amountSar: string }[];
    justification: string;
  };
  biosketch: {
    education: string;
    statement: string;
    positions: string;
    publications: string;
  };
  projectManagement: {
    milestones: { phase: string; tasks: string; deliverables: string; quarter: string; budget: string }[];
    meetingPlan: string;
  };
};

const STAGE2_REQUIRED: (keyof Application)[] = [
  "researchTitle",
  "principalInvestigator",
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
];

export function isStage2CompleteForProposal(app: Application): boolean {
  return STAGE2_REQUIRED.every(k => {
    const v = app[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function para(text: string, opts?: { bold?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 24,
        font: "Times New Roman",
      }),
    ],
    spacing: { after: 200, line: 360 },
  });
}

function heading(text: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 300, after: 200 },
  });
}

function buildAppContext(app: Application): string {
  return JSON.stringify({
    researchTitle: app.researchTitle,
    researchType: app.researchType,
    irbCategory: app.irbCategory,
    principalInvestigator: app.principalInvestigator,
    piEmail: app.piEmail,
    piInstitution: app.piInstitution,
    piDepartment: app.piDepartment,
    fundingSource: app.fundingSource,
    estimatedDuration: app.estimatedDuration,
    researchObjectives: app.researchObjectives,
    methodology: app.methodology,
    sampleSize: app.sampleSize,
    targetPopulation: app.targetPopulation,
    inclusionCriteria: app.inclusionCriteria,
    exclusionCriteria: app.exclusionCriteria,
    dataCollectionMethods: app.dataCollectionMethods,
    informedConsentProcess: app.informedConsentProcess,
    riskAssessment: app.riskAssessment,
    benefitAssessment: app.benefitAssessment,
    confidentialityMeasures: app.confidentialityMeasures,
    conflictOfInterest: app.conflictOfInterest,
    stage1AiScore: app.stage1AiScore,
    stage2AiScore: app.stage2AiScore,
  }, null, 2);
}

async function generateProposalContent(app: Application): Promise<ProposalAiContent> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert Saudi NIH grant writer. Generate a complete research proposal package as JSON only.
Sections follow SNIH templates P001 (proposal), P002 (letter of intent), P003 (budget), P004 (biosketch), P006 (project management).
Write in professional academic English. Use Vancouver-style references (8–15 entries).
Budget amounts in SAR as realistic estimates based on funding source and duration.
Respond ONLY with valid JSON matching the schema requested.`,
      },
      {
        role: "user",
        content: `Application data:\n${buildAppContext(app)}

Return JSON:
{
  "abstract": "string (~250 words)",
  "introduction": "string (~600 words)",
  "literatureReview": "string (~900 words)",
  "innovation": "string (~350 words)",
  "methodology": "string (~900 words)",
  "references": ["string Vancouver format"],
  "letterOfIntent": {
    "projectSummary": "string",
    "alignment": "string",
    "methodologyBrief": "string",
    "timeline": "string",
    "impact": "string",
    "infrastructure": "string"
  },
  "budget": {
    "summary": "string",
    "lineItems": [{"item":"string","category":"string","amountSar":"string"}],
    "justification": "string"
  },
  "biosketch": {
    "education": "string",
    "statement": "string",
    "positions": "string",
    "publications": "string"
  },
  "projectManagement": {
    "milestones": [{"phase":"string","tasks":"string","deliverables":"string","quarter":"Q1-Q4","budget":"string"}],
    "meetingPlan": "string"
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  const parsed = safeJsonParse(text) as ProposalAiContent | null;
  if (!parsed?.abstract || !parsed.methodology) {
    throw new Error("AI proposal generation returned incomplete content");
  }
  return parsed;
}

function fallbackContent(app: Application): ProposalAiContent {
  return {
    abstract: `${app.researchObjectives}\n\nMethods: ${app.methodology?.slice(0, 500)}`,
    introduction: app.researchObjectives || "",
    literatureReview: "Literature review to be expanded based on peer-reviewed sources relevant to the study topic.",
    innovation: app.benefitAssessment || "",
    methodology: app.methodology || "",
    references: ["[1] Add Vancouver-style references during final review."],
    letterOfIntent: {
      projectSummary: app.researchObjectives || "",
      alignment: app.benefitAssessment || "",
      methodologyBrief: app.methodology?.slice(0, 400) || "",
      timeline: app.estimatedDuration || "12 months",
      impact: app.benefitAssessment || "",
      infrastructure: app.piInstitution || "",
    },
    budget: {
      summary: `Estimated budget for ${app.researchTitle}`,
      lineItems: [
        { item: "Personnel (PI)", category: "Research Team", amountSar: "120,000" },
        { item: "Data collection", category: "Operations", amountSar: "45,000" },
        { item: "Equipment & supplies", category: "Materials", amountSar: "30,000" },
      ],
      justification: `Budget aligned with study scope, sample size (${app.sampleSize}), and duration (${app.estimatedDuration}).`,
    },
    biosketch: {
      education: `${app.principalInvestigator} — ${app.piDepartment}, ${app.piInstitution}`,
      statement: app.researchObjectives || "",
      positions: `${app.principalInvestigator}, ${app.piDepartment}, ${app.piInstitution}`,
      publications: "List publications related to this proposal.",
    },
    projectManagement: {
      milestones: [
        { phase: "Initiation", tasks: "Ethics approval, team setup", deliverables: "Approved protocol", quarter: "Q1", budget: "15%" },
        { phase: "Data collection", tasks: app.dataCollectionMethods?.slice(0, 200) || "Collect data", deliverables: "Dataset", quarter: "Q2-Q3", budget: "50%" },
        { phase: "Analysis & reporting", tasks: "Analysis and manuscript", deliverables: "Final report", quarter: "Q4", budget: "35%" },
      ],
      meetingPlan: "Monthly team meetings; quarterly progress reports to sponsor.",
    },
  };
}

export async function generateSnihProposalDocx(app: Application): Promise<Buffer> {
  if (!isStage2CompleteForProposal(app)) {
    throw new Error("STAGE2_INCOMPLETE");
  }

  let content: ProposalAiContent;
  try {
    content = await generateProposalContent(app);
  } catch (e) {
    console.error("[SNIH proposal] AI generation failed, using fallback:", e);
    content = fallbackContent(app);
  }

  const children: Paragraph[] = [
    heading("SNIH Research Proposal Package", HeadingLevel.HEADING_1),
    para(`Project Title: ${app.researchTitle}`, { bold: true }),
    para(`Principal Investigator: ${app.principalInvestigator} · ${app.piInstitution}`),
    para(`Generated by ${PLATFORM.nameEn} · ${AUTHOR.nameEn}`, { size: 20 }),
    new Paragraph({ children: [new PageBreak()] }),

    heading("Section 1 — Proposal Form (P001)", HeadingLevel.HEADING_1),
    heading("Abstract", HeadingLevel.HEADING_2),
    para(content.abstract),
    heading("Introduction", HeadingLevel.HEADING_2),
    para(content.introduction),
    heading("Literature Review", HeadingLevel.HEADING_2),
    para(content.literatureReview),
    heading("Innovation", HeadingLevel.HEADING_2),
    para(content.innovation),
    heading("Methodology", HeadingLevel.HEADING_2),
    para(content.methodology),
    heading("References", HeadingLevel.HEADING_2),
    ...content.references.map((r, i) => para(`[${i + 1}] ${r}`)),
    new Paragraph({ children: [new PageBreak()] }),

    heading("Section 2 — Letter of Intent (P002)", HeadingLevel.HEADING_1),
    para(`1. Project Summary\n${content.letterOfIntent.projectSummary}`),
    para(`2. Alignment with Opportunity Goals\n${content.letterOfIntent.alignment}`),
    para(`3. Research Methodology (Brief)\n${content.letterOfIntent.methodologyBrief}`),
    para(`4. Duration and Key Milestones\n${content.letterOfIntent.timeline}`),
    para(`5. Research Impact\n${content.letterOfIntent.impact}`),
    para(`6. Available Infrastructure\n${content.letterOfIntent.infrastructure}`),
    new Paragraph({ children: [new PageBreak()] }),

    heading("Section 3 — Budget Plan (P003)", HeadingLevel.HEADING_1),
    para(content.budget.summary),
    ...content.budget.lineItems.map(li =>
      para(`${li.category} · ${li.item}: ${li.amountSar} SAR`),
    ),
    heading("Budget Justification", HeadingLevel.HEADING_2),
    para(content.budget.justification),
    new Paragraph({ children: [new PageBreak()] }),

    heading("Section 4 — Biosketch (P004)", HeadingLevel.HEADING_1),
    para(`PI: ${app.principalInvestigator}`),
    heading("Education & Training", HeadingLevel.HEADING_2),
    para(content.biosketch.education),
    heading("Individual Statement", HeadingLevel.HEADING_2),
    para(content.biosketch.statement),
    heading("Positions and Honors", HeadingLevel.HEADING_2),
    para(content.biosketch.positions),
    heading("Publications", HeadingLevel.HEADING_2),
    para(content.biosketch.publications),
    new Paragraph({ children: [new PageBreak()] }),

    heading("Section 5 — Project Management (P006)", HeadingLevel.HEADING_1),
    ...content.projectManagement.milestones.map(m =>
      para(`${m.phase} (${m.quarter}) — ${m.tasks}\nDeliverables: ${m.deliverables}\nBudget allocation: ${m.budget}`),
    ),
    heading("Meeting & Reporting Plan", HeadingLevel.HEADING_2),
    para(content.projectManagement.meetingPlan),
    new Paragraph({ children: [new PageBreak()] }),

    heading("Section 6 — IRB & Ethics Summary", HeadingLevel.HEADING_1),
    para(`Informed Consent: ${app.informedConsentProcess}`),
    para(`Risk Assessment: ${app.riskAssessment}`),
    para(`Confidentiality: ${app.confidentialityMeasures}`),
    para(`Conflict of Interest: ${app.conflictOfInterest || "None declared."}`),
    para(`This document was auto-generated from ${PLATFORM.nameEn} Stage 1 & 2 data.`),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

export function proposalFilename(app: Application): string {
  const slug = (app.researchTitle || `app-${app.id}`)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 48);
  return `SNIH-Proposal-${slug}.docx`;
}
