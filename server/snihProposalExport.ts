/**
 * IRB Saudi Arabia — research-proposal DOCX package.
 *
 * Generates a unique, professionally branded research proposal suitable for
 * submission to any grant or ethics body worldwide. The document is driven by
 * the applicant's own Stage 1 & 2 data and enriched by an LLM that produces a
 * rigorous, ethics-aligned narrative. A deterministic fallback guarantees the
 * export never throws for a Stage-2-complete application.
 *
 * Export symbols are kept stable for server/_core/exportRoutes.ts:
 *   - isStage2CompleteForProposal(app)
 *   - generateSnihProposalDocx(app)   (name retained; branding is IRB Saudi Arabia)
 *   - proposalFilename(app)
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageNumber,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Application } from "../drizzle/schema";
import { invokeLLM, safeJsonParse } from "./_core/llm";
import { AUTHOR, BRAND, PLATFORM } from "@shared/branding";

// ---------------------------------------------------------------------------
// AI content shape
// ---------------------------------------------------------------------------

type TeamMember = {
  role: string;
  name: string;
  responsibility: string;
  commitment: string;
};

type TimetablePhase = {
  phase: string;
  activities: string;
  deliverable: string;
  timeline: string;
};

type BudgetLineItem = {
  category: string;
  item: string;
  justification: string;
  costSar: string;
};

type ProposalAiContent = {
  abstract: string;
  introduction: string;
  literatureReview: string;
  problemStatement: string;
  objectives: string;
  methodology: string;
  ethics: string;
  expectedResults: string;
  conclusion: string;
  team: TeamMember[];
  timetable: TimetablePhase[];
  budget: {
    lineItems: BudgetLineItem[];
    justification: string;
    total: string;
    selfFunded: boolean;
  };
  reporting: string;
  letterOfIntent: string;
  references: string[];
};

// ---------------------------------------------------------------------------
// Stage-2 completeness gate (unchanged contract)
// ---------------------------------------------------------------------------

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
  return STAGE2_REQUIRED.every((k) => {
    const v = app[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

// ---------------------------------------------------------------------------
// Constants & small helpers
// ---------------------------------------------------------------------------

const FONT = "Times New Roman";
const BODY_SIZE = 24; // 12pt (half-points)
const LINE_SPACING = 360; // 1.5 line spacing
const HEX = (c: string) => c.replace(/^#/, "");

const FOREST = HEX(BRAND.forest);
const JADE = HEX(BRAND.jade);
const JADE_DARK = HEX(BRAND.jadeDark);
const WHITE = "FFFFFF";
const GREY = "555555";

const nz = (v: unknown, fallback = ""): string => {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
};

const currentYear = new Date().getFullYear();

/** Justified body paragraph (Times New Roman 12pt, 1.5 spacing). */
function body(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 200, line: LINE_SPACING },
    children: [new TextRun({ text, font: FONT, size: BODY_SIZE })],
  });
}

/** Split a multi-paragraph string into separate justified paragraphs. */
function bodyBlock(text: string): Paragraph[] {
  const clean = nz(text);
  if (!clean) return [body("Not provided — to be completed during final review.")];
  return clean
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => body(p));
}

/** Labelled line: bold label, regular value. */
function labelLine(label: string, value: string, size = BODY_SIZE): Paragraph {
  return new Paragraph({
    spacing: { after: 100, line: LINE_SPACING },
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: FONT, size }),
      new TextRun({ text: value, font: FONT, size }),
    ],
  });
}

/** Brand-coloured HEADING_1 with a numbered section label. */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    border: {
      bottom: { color: JADE, space: 4, style: BorderStyle.SINGLE, size: 8 },
    },
    children: [
      new TextRun({ text, bold: true, font: FONT, size: 30, color: FOREST }),
    ],
  });
}

/** Brand-coloured HEADING_2 sub-heading. */
function subHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({ text, bold: true, font: FONT, size: 26, color: JADE_DARK }),
    ],
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// ---------------------------------------------------------------------------
// Table builders
// ---------------------------------------------------------------------------

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
};

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, color: "auto", fill: FOREST },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        spacing: { after: 0, line: LINE_SPACING },
        children: [
          new TextRun({ text, bold: true, font: FONT, size: 22, color: WHITE }),
        ],
      }),
    ],
  });
}

function dataCell(text: string, opts?: { bold?: boolean; fill?: string }): TableCell {
  return new TableCell({
    shading: opts?.fill
      ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill }
      : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        spacing: { after: 0, line: LINE_SPACING },
        children: [
          new TextRun({ text, bold: opts?.bold, font: FONT, size: 22 }),
        ],
      }),
    ],
  });
}

function buildTable(headers: string[], rows: string[][], widths?: number[]): Table {
  const colCount = headers.length;
  const colWidths =
    widths && widths.length === colCount
      ? widths
      : new Array(colCount).fill(Math.floor(100 / colCount));

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => headerCell(h)),
  });

  const dataRows = rows.map(
    (cells) =>
      new TableRow({
        children: cells.map((c) => dataCell(c)),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBorder,
    columnWidths: colWidths.map((w) => Math.round((w / 100) * 9000)),
    rows: [headerRow, ...dataRows],
  });
}

/** Budget table with a shaded TOTAL row. */
function buildBudgetTable(items: BudgetLineItem[], total: string): Table {
  const headers = ["Category", "Item", "Justification", "Estimated cost (SAR)"];
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => headerCell(h)),
  });

  const dataRows = items.map(
    (li) =>
      new TableRow({
        children: [
          dataCell(li.category),
          dataCell(li.item),
          dataCell(li.justification),
          dataCell(li.costSar),
        ],
      }),
  );

  const totalRow = new TableRow({
    children: [
      dataCell("TOTAL", { bold: true, fill: "E8F5EF" }),
      dataCell("", { fill: "E8F5EF" }),
      dataCell("", { fill: "E8F5EF" }),
      dataCell(total, { bold: true, fill: "E8F5EF" }),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBorder,
    columnWidths: [1800, 2200, 3600, 1400],
    rows: [headerRow, ...dataRows, totalRow],
  });
}

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

function buildAppContext(app: Application): string {
  return JSON.stringify(
    {
      researchTitle: app.researchTitle,
      researchType: app.researchType,
      irbCategory: app.irbCategory,
      principalInvestigator: app.principalInvestigator,
      // PII minimization (SA-16): the PI email is rendered into the DOCX
      // directly from the DB — the LLM never needs it, so it is not sent
      // to the third-party provider.
      piInstitution: app.piInstitution,
      piDepartment: app.piDepartment,
      fundingSource: app.fundingSource,
      estimatedDuration: app.estimatedDuration,
      irbNumber: app.irbNumber,
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
    },
    null,
    2,
  );
}

const SCHEMA_HINT = `{
  "abstract": "string — ~200 words, structured: background, objective, methods, expected impact",
  "introduction": "string — ~160 words, Introduction & Background, with in-text Vancouver citations [1],[2]",
  "literatureReview": "string — ~220 words, evidence-based synthesis with Vancouver citations mapping to references[]",
  "problemStatement": "string — ~120 words, Problem Statement & Rationale",
  "objectives": "string — concise; 'Primary objective:' then numbered secondary objectives/hypotheses",
  "methodology": "string — ~260 words: design, setting, population, sampling & sample-size justification, data collection, variables, analysis plan",
  "ethics": "string — ~180 words: informed consent, risk/benefit, confidentiality/PDPL, vulnerable groups, conflict of interest; cite Declaration of Helsinki (2024 revision), Belmont Report, CIOMS, ICH-GCP, Saudi NCBE",
  "expectedResults": "string — ~150 words, Expected Results & Discussion",
  "conclusion": "string — ~90 words, Conclusion",
  "team": [{"role":"e.g. Principal Investigator","name":"name or institution","responsibility":"short","commitment":"e.g. 30% FTE"}],
  "timetable": [{"phase":"string","activities":"string","deliverable":"string","timeline":"e.g. Months 1-3"}],
  "budget": {
    "lineItems": [{"category":"string","item":"string","justification":"string","costSar":"e.g. 45,000"}],
    "justification": "string — short budget justification paragraph",
    "total": "string — e.g. 250,000",
    "selfFunded": false
  },
  "reporting": "string — progress reports, data monitoring, adverse-event reporting timelines, final report",
  "letterOfIntent": "string — a concise one-page formal letter from the PI to the funding/ethics body",
  "references": ["string — Vancouver style, 8-14 entries matching the in-text citation numbers"]
}`;

async function generateProposalContent(app: Application): Promise<ProposalAiContent> {
  const response = await invokeLLM({
    profile: "deep",
    thinking: "adaptive",
    messages: [
      {
        role: "system",
        content: `You are a senior research-methodology and grant-writing expert. Produce a rigorous, ETHICS-ALIGNED, evidence-based research proposal that would pass a strict institutional review board on the first submission. Align explicitly with the Declaration of Helsinki (2024), the Belmont Report, CIOMS, ICH-GCP, and Saudi NCBE/PDPL requirements. Favour QUALITY and PRECISION over length — every sentence must add value; no padding, no boilerplate. Use the applicant's actual inputs; where the applicant left gaps, fill them with best-practice defaults and briefly mark such assumptions. There is no structured team or budget field in the source data: synthesise a realistic research team and a realistic budget consistent with the study type, funding source, and duration. In-text citations must use Vancouver numbering [1],[2]… that map exactly to the references array. Respond ONLY with a single valid JSON object — no prose, no markdown fences.`,
      },
      {
        role: "user",
        content: `Applicant data (IRB Saudi Arabia application):\n${buildAppContext(app)}\n\nReturn a JSON object with EXACTLY these keys and types:\n${SCHEMA_HINT}`,
      },
    ],
    response_format: { type: "json_object" },
    // Extra headroom: a reasoning model spends a large hidden budget before
    // emitting this many sections; the env default can truncate mid-<think>.
    maxTokens: 40000,
  });

  const raw = response.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  const parsed = safeJsonParse(text) as Partial<ProposalAiContent> | null;

  // Salvage partial AI output: if the model produced at least the abstract OR
  // the methodology, keep everything it returned and let normalizeContent fill
  // any gaps from the applicant's own data — far better than discarding a
  // mostly-complete proposal because the JSON tail was truncated. Only fall
  // back entirely when nothing usable parsed.
  if (!parsed || (!parsed.abstract && !parsed.methodology)) {
    throw new Error("AI proposal generation returned incomplete content");
  }
  return normalizeContent(parsed, app);
}

/** Coerce a possibly-partial AI payload into a complete, render-safe shape. */
function normalizeContent(
  p: Partial<ProposalAiContent>,
  app: Application,
): ProposalAiContent {
  const fb = fallbackContent(app);
  return {
    abstract: nz(p.abstract) || fb.abstract,
    introduction: nz(p.introduction) || fb.introduction,
    literatureReview: nz(p.literatureReview) || fb.literatureReview,
    problemStatement: nz(p.problemStatement) || fb.problemStatement,
    objectives: nz(p.objectives) || fb.objectives,
    methodology: nz(p.methodology) || fb.methodology,
    ethics: nz(p.ethics) || fb.ethics,
    expectedResults: nz(p.expectedResults) || fb.expectedResults,
    conclusion: nz(p.conclusion) || fb.conclusion,
    team: Array.isArray(p.team) && p.team.length ? p.team.map(normTeam) : fb.team,
    timetable:
      Array.isArray(p.timetable) && p.timetable.length
        ? p.timetable.map(normPhase)
        : fb.timetable,
    budget: {
      lineItems:
        Array.isArray(p.budget?.lineItems) && p.budget!.lineItems.length
          ? p.budget!.lineItems.map(normBudget)
          : fb.budget.lineItems,
      justification: nz(p.budget?.justification) || fb.budget.justification,
      total: nz(p.budget?.total) || fb.budget.total,
      selfFunded:
        typeof p.budget?.selfFunded === "boolean"
          ? p.budget.selfFunded
          : fb.budget.selfFunded,
    },
    reporting: nz(p.reporting) || fb.reporting,
    letterOfIntent: nz(p.letterOfIntent) || fb.letterOfIntent,
    references:
      Array.isArray(p.references) && p.references.length
        ? p.references.map((r) => nz(r)).filter(Boolean)
        : fb.references,
  };
}

function normTeam(t: Partial<TeamMember>): TeamMember {
  return {
    role: nz(t.role, "Team member"),
    name: nz(t.name, "To be appointed"),
    responsibility: nz(t.responsibility, "—"),
    commitment: nz(t.commitment, "—"),
  };
}

function normPhase(t: Partial<TimetablePhase>): TimetablePhase {
  return {
    phase: nz(t.phase, "Phase"),
    activities: nz(t.activities, "—"),
    deliverable: nz(t.deliverable, "—"),
    timeline: nz(t.timeline, "—"),
  };
}

function normBudget(t: Partial<BudgetLineItem>): BudgetLineItem {
  return {
    category: nz(t.category, "General"),
    item: nz(t.item, "—"),
    justification: nz(t.justification, "—"),
    costSar: nz(t.costSar, "—"),
  };
}

// ---------------------------------------------------------------------------
// Deterministic fallback (never throws for a Stage-2-complete app)
// ---------------------------------------------------------------------------

function isSelfFunded(app: Application): boolean {
  const f = nz(app.fundingSource).toLowerCase();
  return (
    !f ||
    /\b(none|self|self-funded|self funded|n\/?a|not applicable|unfunded|own)\b/.test(
      f,
    )
  );
}

function durationMonths(app: Application): number {
  const d = nz(app.estimatedDuration).toLowerCase();
  const m = d.match(/(\d+)\s*(month|mo|week|year|yr)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (/year|yr/.test(m[2])) return n * 12;
    if (/week/.test(m[2])) return Math.max(1, Math.round(n / 4));
    return n;
  }
  const bare = d.match(/(\d+)/);
  return bare ? parseInt(bare[1], 10) : 12;
}

function fallbackContent(app: Application): ProposalAiContent {
  const title = nz(app.researchTitle, "the proposed study");
  const pop = nz(app.targetPopulation, "the target population");
  const selfFunded = isSelfFunded(app);
  const months = Math.max(3, durationMonths(app));

  // Spread milestones across the actual duration.
  const q = (frac: number) => Math.max(1, Math.round(months * frac));
  const m1 = q(0.2);
  const m2 = q(0.65);

  const timetable: TimetablePhase[] = [
    {
      phase: "Phase 1 — Initiation & Approvals",
      activities:
        "Finalise protocol, secure IRB/ethics approval, assemble and train the study team, prepare data-collection instruments.",
      deliverable: "Approved protocol and operational study toolkit.",
      timeline: `Months 1–${m1}`,
    },
    {
      phase: "Phase 2 — Recruitment & Data Collection",
      activities: nz(
        app.dataCollectionMethods,
        "Enrol participants per inclusion/exclusion criteria and collect study data.",
      ),
      deliverable: "Quality-controlled, locked study dataset.",
      timeline: `Months ${m1 + 1}–${m2}`,
    },
    {
      phase: "Phase 3 — Analysis & Dissemination",
      activities:
        "Conduct the planned statistical analysis, interpret findings, draft the manuscript, and report to the ethics body.",
      deliverable: "Final report and manuscript submitted for publication.",
      timeline: `Months ${m2 + 1}–${months}`,
    },
  ];

  const lineItems: BudgetLineItem[] = selfFunded
    ? [
        {
          category: "Personnel",
          item: "Investigator time (in-kind)",
          justification: "Time contributed by the PI and collaborators at no direct cost.",
          costSar: "0",
        },
        {
          category: "Materials & Operations",
          item: "Consumables, printing, participant communications",
          justification: "Minimal direct costs for instruments and participant contact.",
          costSar: "8,000",
        },
        {
          category: "Dissemination",
          item: "Open-access / publication fees",
          justification: "Article processing and presentation of results.",
          costSar: "7,000",
        },
      ]
    : [
        {
          category: "Personnel",
          item: "Research coordinator and data manager",
          justification: "Coordination, recruitment, data entry and quality control over the study period.",
          costSar: "140,000",
        },
        {
          category: "Biostatistics",
          item: "Statistical design and analysis",
          justification: "Sample-size justification, analysis plan, and reporting.",
          costSar: "35,000",
        },
        {
          category: "Materials & Operations",
          item: "Consumables, software licences, participant reimbursement",
          justification: "Direct operational costs scaled to sample size and duration.",
          costSar: "55,000",
        },
        {
          category: "Dissemination",
          item: "Open-access publication and conference dissemination",
          justification: "Knowledge translation and reporting of findings.",
          costSar: "20,000",
        },
      ];

  const total = selfFunded ? "15,000" : "250,000";

  return {
    abstract: `Background: ${nz(
      app.researchObjectives,
      "This study addresses an important gap in the field",
    )}. Objective: To investigate ${title} in ${pop}. Methods: ${nz(
      app.methodology,
      "A structured study design with predefined inclusion and exclusion criteria",
    )} (sample size: ${nz(app.sampleSize, "to be determined")}). Expected impact: The findings are expected to inform clinical and policy decision-making and to advance evidence in the field. [Assumption: abstract synthesised from applicant inputs pending final author review.]`,
    introduction: `This proposal concerns ${title}. ${nz(
      app.researchObjectives,
      "The study is motivated by a recognised need for stronger evidence in this area.",
    )} The work is positioned within current literature and best-practice guidance and aligns with national research priorities [1].`,
    literatureReview:
      "A focused review of peer-reviewed evidence will situate this study within the current state of knowledge, identify methodological gaps, and justify the chosen design [1][2]. The literature review will be finalised with current primary sources during author review.",
    problemStatement: `The central problem this study addresses is the limited high-quality evidence regarding ${title} in ${pop}. Resolving this gap is necessary to support sound clinical and policy decisions.`,
    objectives: nz(
      app.researchObjectives,
      "Primary objective: to be confirmed by the applicant. Secondary objectives and hypotheses will be specified during final review.",
    ),
    methodology: nz(app.methodology, "Methodology to be completed by the applicant."),
    ethics: `Informed consent: ${nz(
      app.informedConsentProcess,
      "Written informed consent will be obtained from all participants.",
    )} Risk/benefit: ${nz(
      app.riskAssessment,
      "Risks are minimal and are outweighed by anticipated benefits.",
    )} Benefits: ${nz(app.benefitAssessment, "Benefits to participants and society are anticipated.")} Confidentiality (PDPL): ${nz(
      app.confidentialityMeasures,
      "Data will be de-identified and stored securely in compliance with the Saudi Personal Data Protection Law (PDPL).",
    )} Conflict of interest: ${nz(
      app.conflictOfInterest,
      "None declared.",
    )} This study is conducted in accordance with the Declaration of Helsinki (2024 revision), the Belmont Report, CIOMS, ICH-GCP, and the regulations of the Saudi National Committee of Bioethics (NCBE).`,
    expectedResults: `The study is expected to generate robust evidence on ${title}. Findings will be interpreted in light of existing literature, with attention to clinical and policy implications and to the study's limitations.`,
    conclusion: `In conclusion, ${title} is a methodologically sound, ethically aligned investigation with the potential to advance knowledge and inform practice in ${pop}.`,
    team: [
      {
        role: "Principal Investigator",
        name: `${nz(app.principalInvestigator, "Principal Investigator")}${
          nz(app.piInstitution) ? ` — ${nz(app.piInstitution)}` : ""
        }`,
        responsibility:
          "Overall scientific leadership, protocol integrity, ethics compliance, and reporting.",
        commitment: "30% FTE",
      },
      {
        role: "Co-Investigator",
        name: "To be appointed",
        responsibility: "Domain expertise, protocol contribution, and oversight of clinical/field operations.",
        commitment: "15% FTE",
      },
      {
        role: "Research Coordinator",
        name: "To be appointed",
        responsibility: "Recruitment, consent administration, scheduling, and day-to-day study conduct.",
        commitment: "50% FTE",
      },
      {
        role: "Biostatistician",
        name: "To be appointed",
        responsibility: "Sample-size justification, analysis plan, and statistical reporting.",
        commitment: "10% FTE",
      },
      {
        role: "Data Manager",
        name: "To be appointed",
        responsibility: "Data capture system, quality control, and PDPL-compliant data security.",
        commitment: "20% FTE",
      },
    ],
    timetable,
    budget: {
      lineItems,
      justification: selfFunded
        ? `This study is self-funded. Costs are kept modest and limited to essential consumables and dissemination; investigator time is contributed in-kind. Estimates are aligned with the study scope, sample size (${nz(
            app.sampleSize,
            "as specified",
          )}), and duration (${nz(app.estimatedDuration, `${months} months`)}).`
        : `The budget is scaled to the study type, sample size (${nz(
            app.sampleSize,
            "as specified",
          )}), and duration (${nz(
            app.estimatedDuration,
            `${months} months`,
          )}). Personnel represents the largest line, reflecting the coordination and data-management effort required to deliver high-quality, ethically compliant data.`,
      total,
      selfFunded,
    },
    reporting: `Progress will be reported to the ethics body at least every six months, with an interim report at the study midpoint and a final report within 90 days of study completion. Data integrity will be monitored through routine source-data verification and periodic data-quality checks. Serious adverse events will be reported to the IRB within 24–72 hours per ICH-GCP and NCBE requirements, and an annual continuing-review report will be submitted. The final report will summarise outcomes, deviations, and dissemination.`,
    letterOfIntent: `To the Funding and Ethics Review Body,\n\nI write to submit, with respect, a proposal entitled "${title}" for your consideration. This study${
      nz(app.piInstitution) ? `, based at ${nz(app.piInstitution)},` : ""
    } addresses an important and well-defined gap concerning ${pop}. ${nz(
      app.researchObjectives,
      "Its objectives are clearly specified and methodologically tractable.",
    )}\n\nThe proposed work is rigorous in design and fully aligned with the Declaration of Helsinki (2024), the Belmont Report, CIOMS, ICH-GCP, and Saudi NCBE/PDPL requirements. We respectfully request your review and support to enable its conduct over an estimated ${nz(
      app.estimatedDuration,
      `${months}-month`,
    )} period.\n\nI would be glad to provide any additional information the committee may require.\n\nRespectfully,\n${nz(
      app.principalInvestigator,
      "Principal Investigator",
    )}${nz(app.piInstitution) ? `\n${nz(app.piInstitution)}` : ""}${
      nz(app.piEmail) ? `\n${nz(app.piEmail)}` : ""
    }`,
    references: [
      "World Medical Association. WMA Declaration of Helsinki — Ethical Principles for Medical Research Involving Human Participants. 2024 revision. Ferney-Voltaire: WMA; 2024.",
      "National Commission for the Protection of Human Subjects of Biomedical and Behavioral Research. The Belmont Report. Washington, DC: US Government Printing Office; 1979.",
      "Council for International Organizations of Medical Sciences (CIOMS). International Ethical Guidelines for Health-related Research Involving Humans. 4th ed. Geneva: CIOMS; 2016.",
      "International Council for Harmonisation. ICH Harmonised Guideline: Good Clinical Practice E6(R2). Geneva: ICH; 2016.",
      "Saudi National Committee of Bioethics (NCBE), KACST. Implementing Regulations of the Law of Ethics of Research on Living Creatures. Riyadh: KACST; 2016.",
      "Kingdom of Saudi Arabia. Personal Data Protection Law (PDPL). Riyadh: SDAIA; 2023.",
      "Schulz KF, Altman DG, Moher D; CONSORT Group. CONSORT 2010 Statement: updated guidelines for reporting parallel group randomised trials. BMJ. 2010;340:c332.",
      "von Elm E, Altman DG, Egger M, et al. The Strengthening the Reporting of Observational Studies in Epidemiology (STROBE) statement. Lancet. 2007;370(9596):1453-7.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

function coverPage(app: Application): Paragraph[] {
  const title = nz(app.researchTitle, "Research Proposal");
  const pi = nz(app.principalInvestigator, "Principal Investigator");
  const inst = nz(app.piInstitution);
  const dept = nz(app.piDepartment);
  const irb = nz(app.irbNumber);

  const blanks = (n: number) =>
    Array.from({ length: n }, () => new Paragraph({ children: [] }));

  return [
    ...blanks(2),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: PLATFORM.nameEn.toUpperCase(),
          bold: true,
          font: FONT,
          size: 44,
          color: FOREST,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      border: {
        bottom: { color: JADE, space: 8, style: BorderStyle.SINGLE, size: 12 },
      },
      children: [
        new TextRun({
          text: "Research Proposal & Ethics Submission Dossier",
          italics: true,
          font: FONT,
          size: 26,
          color: JADE_DARK,
        }),
      ],
    }),
    ...blanks(1),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 320 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          font: FONT,
          size: 36,
          color: FOREST,
        }),
      ],
    }),
    ...blanks(2),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Principal Investigator", font: FONT, size: 20, color: GREY }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: pi, bold: true, font: FONT, size: 28 })],
    }),
    ...(inst || dept
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: [dept, inst].filter(Boolean).join(" · "),
                font: FONT,
                size: 24,
              }),
            ],
          }),
        ]
      : []),
    ...(irb
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({ text: `IRB Reference: ${irb}`, font: FONT, size: 22, color: JADE_DARK }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
      children: [
        new TextRun({ text: "Date: ____________________", font: FONT, size: 22 }),
      ],
    }),
    ...blanks(3),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 40 },
      border: {
        top: { color: JADE, space: 8, style: BorderStyle.SINGLE, size: 8 },
      },
      children: [
        new TextRun({
          text: "Prepared with IRB Saudi Arabia — independent AI-assisted ethical research workflows (AHSS)",
          italics: true,
          font: FONT,
          size: 20,
          color: GREY,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${AUTHOR.orgEn} · ${AUTHOR.nameEn}`,
          font: FONT,
          size: 18,
          color: GREY,
        }),
      ],
    }),
    pageBreak(),
  ];
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

export async function generateSnihProposalDocx(app: Application): Promise<Buffer> {
  if (!isStage2CompleteForProposal(app)) {
    throw new Error("STAGE2_INCOMPLETE");
  }

  let content: ProposalAiContent;
  try {
    content = await generateProposalContent(app);
  } catch (e) {
    console.error("[IRB Saudi Arabia proposal] AI generation failed, using fallback:", e);
    content = fallbackContent(app);
  }

  const refs = content.references.length
    ? content.references
    : fallbackContent(app).references;

  const children: (Paragraph | Table)[] = [
    // 1. Cover page
    ...coverPage(app),

    // 2. Abstract
    sectionHeading("1. Abstract"),
    ...bodyBlock(content.abstract),

    // 3. Introduction & Background
    sectionHeading("2. Introduction & Background"),
    ...bodyBlock(content.introduction),

    // 4. Literature Review
    sectionHeading("3. Literature Review"),
    ...bodyBlock(content.literatureReview),

    // 5. Problem Statement & Rationale
    sectionHeading("4. Problem Statement & Rationale"),
    ...bodyBlock(content.problemStatement),

    // 6. Research Objectives & Questions/Hypotheses
    sectionHeading("5. Research Objectives & Questions / Hypotheses"),
    ...bodyBlock(content.objectives),

    // 7. Methodology
    sectionHeading("6. Methodology"),
    ...bodyBlock(content.methodology),

    // 8. Ethical Considerations & Approval
    sectionHeading("7. Ethical Considerations & Approval"),
    ...bodyBlock(content.ethics),

    // 9. Expected Results & Discussion
    sectionHeading("8. Expected Results & Discussion"),
    ...bodyBlock(content.expectedResults),

    // 10. Conclusion
    sectionHeading("9. Conclusion"),
    ...bodyBlock(content.conclusion),

    // 11. Research Team & Roles (table)
    sectionHeading("10. Research Team & Roles"),
    buildTable(
      ["Role", "Name / Responsibility", "Time commitment"],
      content.team.map((t) => [
        t.role,
        `${t.name}\n${t.responsibility}`,
        t.commitment,
      ]),
      [24, 56, 20],
    ),

    // 12. Timetable / Milestones (table)
    sectionHeading("11. Timetable & Milestones"),
    buildTable(
      ["Phase", "Activities", "Deliverable", "Timeline"],
      content.timetable.map((t) => [t.phase, t.activities, t.deliverable, t.timeline]),
      [22, 38, 24, 16],
    ),

    // 13. Budget (table + justification)
    sectionHeading("12. Budget"),
    new Paragraph({
      spacing: { after: 120, line: LINE_SPACING },
      children: [
        new TextRun({
          text: content.budget.selfFunded
            ? "Funding status: Self-funded. Amounts reflect modest direct costs only."
            : `Funding status: Externally funded${
                nz(app.fundingSource) ? ` (${nz(app.fundingSource)})` : ""
              }.`,
          bold: true,
          font: FONT,
          size: BODY_SIZE,
          color: JADE_DARK,
        }),
      ],
    }),
    buildBudgetTable(content.budget.lineItems, content.budget.total),
    subHeading("Budget Justification"),
    ...bodyBlock(content.budget.justification),

    // 14. Reporting & Monitoring Plan
    sectionHeading("13. Reporting & Monitoring Plan"),
    ...bodyBlock(content.reporting),

    // 15. Letter of Intent
    pageBreak(),
    sectionHeading("14. Letter of Intent"),
    ...bodyBlock(content.letterOfIntent),

    // 16. References (Vancouver)
    sectionHeading("15. References"),
    ...refs.map(
      (r, i) =>
        new Paragraph({
          spacing: { after: 120, line: LINE_SPACING },
          children: [
            new TextRun({ text: `[${i + 1}] `, bold: true, font: FONT, size: BODY_SIZE }),
            new TextRun({ text: r, font: FONT, size: BODY_SIZE }),
          ],
        }),
    ),
  ];

  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: {
          bottom: { color: JADE, space: 4, style: BorderStyle.SINGLE, size: 4 },
        },
        children: [
          new TextRun({
            text: PLATFORM.nameEn,
            font: FONT,
            size: 18,
            color: FOREST,
            bold: true,
          }),
        ],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: { color: JADE, space: 4, style: BorderStyle.SINGLE, size: 4 },
        },
        children: [
          new TextRun({
            text: `IRB Saudi Arabia · Independent AHSS platform — generated ${currentYear}    |    Page `,
            font: FONT,
            size: 16,
            color: GREY,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT,
            size: 16,
            color: GREY,
          }),
          new TextRun({ text: " of ", font: FONT, size: 16, color: GREY }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: FONT,
            size: 16,
            color: GREY,
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: PLATFORM.nameEn,
    title: nz(app.researchTitle, "Research Proposal"),
    description: `Research proposal generated by ${PLATFORM.nameEn} (AHSS).`,
    numbering: {
      config: [
        {
          reference: "proposal-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Filename (no "SNIH")
// ---------------------------------------------------------------------------

export function proposalFilename(app: Application): string {
  const slug =
    (nz(app.researchTitle) || `app-${app.id}`)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `app-${app.id}`;
  return `IRB-Saudi-Arabia-Proposal-${slug}.docx`;
}
