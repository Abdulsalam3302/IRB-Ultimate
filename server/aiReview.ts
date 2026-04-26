import { invokeLLM, safeJsonParse } from "./_core/llm";
import { searchLiterature, formatLiteratureForPrompt, buildLiteratureQuery } from "./literature";

// Color codes: red = flag/stop, yellow = AI resolved needs review, green = OK, darkGreen = perfect
export type FieldColor = "red" | "yellow" | "green" | "darkGreen";

/**
 * Some providers (MiniMax M2, …) don't strictly enforce response json_schema —
 * they may nest the answer or rename keys. This helper walks the parsed JSON
 * and pulls out the canonical fields the rest of the codebase expects.
 */
function normalizeReviewJson(input: unknown): {
  score: number;
  feedback: string;
  recommendations: string[];
  hasRedFlags: boolean;
  fieldScores: any[];
  fieldSuggestions: Record<string, string>;
} {
  const SCORE_KEYS = [
    "score", "overallScore", "overall_score", "totalScore", "total_score",
    "weightedScore", "weighted_score", "finalScore", "final_score", "compositeScore",
  ];
  const FEEDBACK_KEYS = [
    "feedback", "summary", "executiveSummary", "executive_summary",
    "overallFeedback", "overall_feedback", "reviewerNote", "reviewer_note",
    "reviewerSummary", "reviewer_summary", "assessment", "verdict", "narrative",
    "comments", "remarks", "rationale",
  ];
  const REC_KEYS = [
    "recommendations", "recommendation", "actionItems", "action_items",
    "improvements", "improvementSuggestions", "improvement_suggestions",
    "nextSteps", "next_steps", "todo", "todos",
  ];
  const RED_KEYS = [
    "hasRedFlags", "has_red_flags", "redFlags", "red_flags", "flagged",
    "blocking", "criticalIssues", "critical_issues",
  ];
  const FIELDS_KEYS = [
    "fieldScores", "field_scores", "fields", "fieldEvaluations",
    "field_evaluations", "perField", "per_field", "byField", "by_field",
    "criteria", "checklist",
  ];
  const FIELDSUG_KEYS = [
    "fieldSuggestions", "field_suggestions", "suggestions",
    "improvedFields", "improved_fields", "rewrites",
  ];

  const seen = new WeakSet<object>();
  const candidates: Record<string, any>[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object" || seen.has(node as object)) return;
    seen.add(node as object);
    candidates.push(node as Record<string, any>);
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  }
  walk(input);

  const pick = (keys: string[]): any => {
    for (const c of candidates) {
      for (const k of keys) {
        if (c[k] !== undefined && c[k] !== null) return c[k];
      }
    }
    return undefined;
  };

  const rawScore = pick(SCORE_KEYS);
  const score = typeof rawScore === "number"
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : typeof rawScore === "string" && !Number.isNaN(parseFloat(rawScore))
      ? Math.max(0, Math.min(100, Math.round(parseFloat(rawScore))))
      : 0;

  const rawFeedback = pick(FEEDBACK_KEYS);
  const feedback = typeof rawFeedback === "string" ? rawFeedback : "";

  const rawRecs = pick(REC_KEYS);
  const flattenRec = (r: any): string | null => {
    if (!r) return null;
    if (typeof r === "string") return r;
    if (typeof r === "object") {
      // Common shapes: {description, priority} | {recommendation, …} | {action} | {text}
      const cand =
        r.description ?? r.recommendation ?? r.action ?? r.text ??
        r.message ?? r.note ?? r.suggestion ?? r.detail;
      if (typeof cand === "string") return cand;
      // Last resort — stringify scalars only
      const scalars = Object.values(r).filter(
        v => typeof v === "string" || typeof v === "number"
      );
      if (scalars.length > 0) return scalars.join(" — ");
    }
    return null;
  };
  const recommendations = Array.isArray(rawRecs)
    ? rawRecs.map(flattenRec).filter((s): s is string => Boolean(s))
    : typeof rawRecs === "string"
      ? [rawRecs]
      : [];

  const rawRed = pick(RED_KEYS);
  const hasRedFlags = rawRed === true || rawRed === "true" || rawRed === 1;

  const rawFields = pick(FIELDS_KEYS);
  const fieldScores = Array.isArray(rawFields) ? rawFields : [];

  const rawFieldSug = pick(FIELDSUG_KEYS);
  const fieldSuggestions =
    rawFieldSug && typeof rawFieldSug === "object" && !Array.isArray(rawFieldSug)
      ? (rawFieldSug as Record<string, string>)
      : {};

  // Fallback: when M2 returns no fieldScores but recommendations are
  // formatted as "<fieldName> — <severity> — <text>" (which it does
  // sometimes), synthesise fieldScores so the UI can still show
  // per-field rows. Severity → score: Critical 30, High 50, Medium 65,
  // Low 80, otherwise 70.
  let finalFieldScores = fieldScores;
  if (finalFieldScores.length === 0 && recommendations.length > 0) {
    const synthesized: any[] = [];
    const sevToScore: Record<string, number> = {
      critical: 30, high: 50, medium: 65, moderate: 65, low: 80,
    };
    for (const rec of recommendations) {
      const m = rec.match(/^([a-zA-Z][a-zA-Z0-9_]+)\s*[—\-:]\s*([A-Za-z]+)\s*[—\-:]\s*(.+)$/);
      if (m) {
        const [, field, sev, body] = m;
        synthesized.push({
          field,
          score: sevToScore[sev.toLowerCase()] ?? 70,
          feedback: body.trim(),
          suggestion: "",
        });
      }
    }
    if (synthesized.length > 0) finalFieldScores = synthesized;
  }
  return { score, feedback, recommendations, hasRedFlags, fieldScores: finalFieldScores, fieldSuggestions };
}

export interface FieldScore {
  field: string;
  color: FieldColor;
  score: number;
  feedback: string;
  suggestion: string;
}

export interface AiReviewResult {
  score: number;
  passed: boolean;
  feedback: string;
  recommendations: string[];
  fieldSuggestions?: Record<string, string>;
  fieldScores?: FieldScore[];
  hasRedFlags?: boolean;
}

const PASS_THRESHOLD = 65;

function getColorFromScore(score: number): FieldColor {
  if (score < 50) return "red";
  if (score < 70) return "yellow";
  if (score < 90) return "green";
  return "darkGreen";
}

/**
 * Refusal / safeguards policy injected into every content-generating
 * prompt (auto-complete, resolve-field, fix-all-comments). The reviewing
 * prompts already enforce these via RED-FLAG rules; the writing prompts
 * need an explicit "do not produce" list because their output goes back
 * to the applicant and could otherwise smuggle non-compliant content.
 */
const ETHICS_SAFEGUARDS = `
═══════════════════════════════════════════════════
HARD SAFEGUARDS — REFUSE TO GENERATE
═══════════════════════════════════════════════════
You MUST refuse to generate or enhance content that:
1. FABRICATION: Invents principal investigators, institutional affiliations, NBCE bioethics certifications, prior IRB approvals, trial registration numbers, or funding sources. If a credential is missing, instruct the applicant to provide it — do not invent one.
2. CONSENT BYPASS: Describes any procedure that obtains consent through coercion, deception (beyond approved minimal-deception protocols), withholding of material risks, or skipping the right-to-withdraw clause.
3. VULNERABLE-POPULATION MISUSE: Targets minors, prisoners, pregnant women, mentally incapacitated persons, employees of the PI, students of the PI, or other dependent groups WITHOUT explicit additional safeguards (assent procedures, LAR consent, conflict-of-interest disclosure, justification of why this population is necessary).
4. ILLEGAL OR HIGH-HARM METHODS: Recommends use of unapproved investigational substances outside a Saudi FDA / NBCE-cleared pathway, deliberate harm beyond minimal risk, withholding standard-of-care from a control arm, or any procedure prohibited under Saudi law.
5. DATA PROTECTION VIOLATION: Describes collection of identifiable health data without an explicit secure-storage / de-identification / retention-and-destruction plan; describes secondary use of biospecimens without re-consent or waiver justification.
6. DISCRIMINATION: Excludes participants on protected characteristics (gender, religion, nationality, disability) without scientific justification.
7. CONFLICT OF INTEREST CONCEALMENT: Hides or downplays financial / non-financial conflicts.

When refusing under any of these rules, return the field with a short, clear note that begins with "[BLOCKED — applicant must address]" and then names the safeguard rule in plain language. Do NOT silently rewrite the applicant's intent into something compliant; the applicant is responsible for the underlying study design.

The applicant is responsible for the truthfulness of all content. Your role is to improve quality, structure, and ethical clarity — never to launder unethical methodology into IRB-acceptable language.
`;

// ─── STAGE 1 AI REVIEW — Research Classification & Basic Info ─────────────
export async function runStage1AiReview(data: {
  researchType: string;
  irbCategory: string;
  researchTitle: string;
  principalInvestigator: string;
  piInstitution: string;
  piDepartment: string;
  fundingSource: string;
  estimatedDuration: string;
}): Promise<AiReviewResult> {
  // Lightweight novelty check — title-only, 2 sources, 3 hits each.
  // Picks up obvious duplication of registered trials and recent papers
  // without bloating the gateway prompt. Errors are swallowed so the
  // gateway never depends on an external API to function.
  let noveltyContext = "";
  try {
    if (data.researchTitle && data.researchTitle.trim().length > 8) {
      // Use the smart query builder which strips boilerplate filler
      // ("a study of", "investigation into", trailing date paren) so
      // the upstream search engines weight on real content tokens.
      const q = buildLiteratureQuery(data.researchTitle);
      const bundle = await searchLiterature(q, {
        perSource: 5,           // over-fetch for relevance filter
        perSourceCap: 3,        // final cap per source in the prompt
        minRelevance: 0.1,      // novelty check is stricter than full review
        sources: ["pubmed", "clinicaltrials"],
      });
      const formatted = formatLiteratureForPrompt(bundle);
      if (formatted) noveltyContext = `${formatted}\n\n`;
    }
  } catch (err) {
    console.warn("[AI Review] Stage 1 novelty check failed:", err);
  }

  const prompt = `You are a senior IRB (Institutional Review Board) compliance specialist for the National Bioethics Committee of Saudi Arabia (NBCE), with expertise in NBCE Implementing Regulations, Declaration of Helsinki (2013), ICH-GCP E6(R2), Belmont Report, and CIOMS International Ethical Guidelines.

YOUR ROLE: Evaluate Stage 1 of an IRB application — research classification and basic investigator information. This is the GATEWAY stage. Your assessment determines whether the applicant proceeds to the detailed ethics review (Stage 2).

═══════════════════════════════════════════════════
STANDARDIZED EVALUATION CHECKLIST (Stage 1) — GATEWAY ONLY
═══════════════════════════════════════════════════

This is the GATEWAY stage. The deep methodological/ethics review happens in Stage 2. At Stage 1 you are checking the application is INTERPRETABLE — not perfect. Be GENEROUS. Most applicants should pass this stage. Only block when something is clearly missing, fabricated, or misclassified in a way that would route the proposal to the wrong review pathway.

1. RESEARCH TITLE (Weight: 50% — THE ONLY FIELD THAT GETS SCRUTINY)
   ✓ At least one substantive noun phrase that describes the topic.
   ✓ Implies (or names) a study design — cross-sectional, RCT, cohort, case-series, qualitative, lab-based, etc.
   ✓ Implies (or names) a target population or setting.
   ✓ Spelling and grammar are reasonable (typos are forgivable; suggest the correct form, do not deduct heavily).
   ✗ RED FLAG ONLY IF: the title is a single word, an abbreviation with no expansion, or so vague that the topic is unguessable (e.g. "study", "research project", "test").

2. PRINCIPAL INVESTIGATOR (Weight: 10% — FORMAT CHECK ONLY)
   ✓ A real-looking human name. Credentials (Dr., MD, PhD) are NICE TO HAVE, not required.
   ✓ If the value is a plausible name, give it 90+. Do not deduct for missing credentials.
   ✗ RED FLAG ONLY IF: empty, single character, "test", "n/a", or clearly fabricated.

3. PI EMAIL (Weight: 5% — FORMAT CHECK ONLY)
   ✓ Looks like a valid email address (one @, a domain). 90+ if format is valid.
   ✗ RED FLAG ONLY IF: not an email format at all.

4. RESEARCH TYPE (Weight: 10% — CLASSIFICATION CONSISTENCY ONLY)
   ✓ A value is selected, and it is roughly consistent with what the title suggests.
   ✓ If the title suggests a survey and the type is "survey_questionnaire", give 100.
   ✗ RED FLAG ONLY IF: clearly wrong (title clearly describes a clinical trial but type says "laboratory") in a way that would route the review wrong.

5. IRB CATEGORY (Weight: 5% — CATEGORY CONSISTENCY ONLY)
   ✓ A value is selected. Be very lenient here — applicants frequently default to "full_board" because they're cautious; that's fine.
   ✗ RED FLAG ONLY IF: clearly inappropriate (e.g. minimal-risk survey marked as needing full board for a non-vulnerable population — even then, just suggest, do not block).

6. INSTITUTION (Weight: 8% — FORMAT CHECK ONLY)
   ✓ Any real-looking institutional name (full or abbreviated). Saudi institutions and abbreviations like "KFSH", "KSU", "KAU" are VALID — do not deduct for using the abbreviation.
   ✗ RED FLAG ONLY IF: empty, "test", or clearly nonsense.

7. DEPARTMENT (Weight: 6% — FORMAT CHECK ONLY)
   ✓ Any reasonable department or specialty word. "Neuro", "Cardio", "ER" are FINE — do not deduct for shorthand.
   ✗ RED FLAG ONLY IF: empty, "test", or clearly nonsense.

8. FUNDING SOURCE (Weight: 3% — PRESENCE CHECK ONLY)
   ✓ Any non-empty value. "Self", "Self-funded", "Institutional", "Grant", a sponsor name — all FINE.
   ✗ RED FLAG ONLY IF: empty.

9. ESTIMATED DURATION (Weight: 3% — PRESENCE CHECK ONLY)
   ✓ Any plausible duration string. "3 months", "1 year", "Q1-Q4 2026" are all FINE.
   ✗ RED FLAG ONLY IF: empty, or so unrealistic for the study type that the application can't proceed (e.g. a 30-month RCT marked "1 day").

═══════════════════════════════════════════════════
SCORING RULES — GENEROUS BY DEFAULT
═══════════════════════════════════════════════════
- DEFAULT every field to 95 unless there is a concrete problem.
- Deduct ONLY for the specific reasons in the checklist above. Do NOT add extra criteria.
- For non-title fields, "complete + valid format + understandable" = 95-100. Polishing wording or expanding abbreviations is the applicant's choice, not a penalty.
- The TITLE is the only field where scientific quality matters at this gateway. Even there, score 80+ if the topic is clear and a study design is implied.
- 0-49 → RED: Critical missing or fabricated value. Use sparingly.
- 50-69 → YELLOW: Could be improved.
- 70-89 → GREEN: Acceptable, IRB can review it.
- 90-100 → DARK GREEN: Complete and well-formed.
- Overall score = weighted average of field scores using the weights above (title 50%, others sum to 50%).
- hasRedFlags = true ONLY when a field ACTUALLY meets a "RED FLAG ONLY IF" condition above. Do not flag for "could be more detailed".
- Pass threshold is intentionally low (~65). Applicants whose title clearly describes a real study and whose other fields are filled with sensible values should ALWAYS pass.

═══════════════════════════════════════════════════
CROSS-PHASE ALIGNMENT CHECK
═══════════════════════════════════════════════════
- Verify research type matches what the title implies
- Verify IRB category is appropriate for the risk level
- Flag if the title suggests human subjects but type says lab-based
- Flag if clinical trial is marked as exempt review

═══════════════════════════════════════════════════
NOVELTY / DUPLICATION CHECK
═══════════════════════════════════════════════════
- If the LITERATURE & PRIOR-ART CONTEXT block (below) shows an active or recently completed registered trial with the same intervention and population, NOTE this in feedback as a duplication concern
- Do NOT auto-fail for novelty alone — registries exist precisely so multi-site replication can happen — but DO recommend the applicant cite the precedent and explain how this study adds value
- If no prior-art context is present, treat novelty as neutral (do not deduct)

═══════════════════════════════════════════════════
OUTPUT STYLE — TEACHING REPORT
═══════════════════════════════════════════════════
The applicant is a researcher, not an IRB expert. Your job is to TEACH, not just judge. Every "feedback" string MUST be written so that an applicant who has never seen an IRB form before can fix the field without asking anyone for help.

For EACH field, the "feedback" string follows this exact structure (in plain language, NOT as bullet headings — write it as flowing prose):

  1. Diagnosis (1 short sentence): what is wrong with the current value, in concrete terms (e.g. "the title is two words and contains a spelling error 'abcess'").
  2. Why it matters (1 short clause): which IRB principle it violates (e.g. "vague titles prevent the committee from assessing scope").
  3. ALWAYS — for any field scoring below 80 — append the literal token "EXAMPLE:" on its own line, followed by ONE fully-written, copy-pasteable example tailored to the applicant's apparent topic and Saudi context (use the LITERATURE & PRIOR-ART CONTEXT block when available to ground the example in real precedent). The example must be self-contained — no placeholders.
  4. For fields scoring 80+, omit the EXAMPLE: line.

The "suggestion" field must be a complete drop-in replacement that would score 100/100 — NOT a paraphrase of the diagnosis.

The TOP-LEVEL "feedback" (overall) must end with the literal token "FASTEST FIX:" followed by exactly three numbered bullets ("1. …\n2. …\n3. …") naming the three highest-leverage fixes the applicant can make right now.

The TOP-LEVEL "recommendations" array must be ordered by impact, with the highest-impact fix first.

ILLUSTRATIVE EXAMPLE (for reference only, not your output):
  feedback for researchTitle field: "The title 'brain abcess' is only two words and contains a spelling error ('abcess' should be 'abscess'); it does not state the study design, population, or setting. Vague titles prevent the IRB committee from assessing scope and risk class.
  EXAMPLE: Cross-sectional study of clinical presentation, microbiology, and outcomes of brain abscess in adult patients at King Faisal Specialist Hospital and Research Centre, Riyadh (January 2020 – December 2024)."
  suggestion: "Cross-sectional study of clinical presentation, microbiology, and outcomes of brain abscess in adult patients at King Faisal Specialist Hospital and Research Centre, Riyadh (January 2020 – December 2024)"

═══════════════════════════════════════════════════
HARD OUTPUT REQUIREMENTS — VALIDATION
═══════════════════════════════════════════════════
- The fieldScores array MUST contain ONE entry per Stage 1 field below, in this order: researchTitle, principalInvestigator, researchType, irbCategory, piInstitution, piDepartment, fundingSource, estimatedDuration. Eight entries total. NEVER return an empty fieldScores array.
- Default every non-title field to a score of 95 unless a "RED FLAG ONLY IF" condition above is concretely met. The title is the only field where you should think hard about the score.
- For every fieldScores[i] where score < 80, the feedback string MUST contain the literal token "EXAMPLE:" followed by a copy-pasteable example. (Most non-title fields will score ≥ 80 and therefore have NO EXAMPLE: block.)
- The top-level feedback string MUST end with the literal token "FASTEST FIX:" followed by exactly three numbered bullets like "1. ...\n2. ...\n3. ...". When the application is in good shape, the bullets can be polish suggestions (e.g. "Consider adding the start year to the title" rather than "FIX MAJOR PROBLEM").

${noveltyContext}APPLICATION DATA:
${JSON.stringify(data, null, 2)}

For each field, provide:
- score (0-100) — generous by default per the rules above
- feedback (diagnosis + why it matters + EXAMPLE: block when score < 80)
- suggestion (complete drop-in replacement that would score 100/100, even for fields already scoring 95)

REMEMBER:
- fieldScores MUST have 8 entries.
- Non-title fields default to 95+ unless a concrete RED FLAG condition is met.
- feedback strings for low-score fields MUST contain "EXAMPLE:".
- top-level feedback MUST end with "FASTEST FIX:" + 3 numbered bullets.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a senior NBCE IRB compliance specialist. Evaluate research applications against international bioethics standards. Score based on content quality and ethical alignment, never on text length. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "stage1_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "integer", description: "Weighted overall score 0-100" },
              feedback: { type: "string", description: "Executive summary of the review" },
              recommendations: { type: "array", items: { type: "string" }, description: "Prioritized action items" },
              fieldScores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    score: { type: "integer" },
                    feedback: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["field", "score", "feedback", "suggestion"],
                  additionalProperties: false,
                },
              },
              hasRedFlags: { type: "boolean" },
            },
            required: ["score", "feedback", "recommendations", "fieldScores", "hasRedFlags"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = safeJsonParse(typeof content === "string" ? content : "{}");
    const norm = normalizeReviewJson(parsed);
    const fieldScores: FieldScore[] = (norm.fieldScores || []).map((fs: any) => ({
      ...fs,
      color: getColorFromScore(typeof fs.score === "number" ? fs.score : 0),
    }));

    return {
      score: norm.score,
      passed: norm.score >= PASS_THRESHOLD && !norm.hasRedFlags,
      feedback: norm.feedback || "Review completed.",
      recommendations: norm.recommendations,
      fieldScores,
      hasRedFlags: norm.hasRedFlags,
    };
  } catch (error) {
    console.error("[AI Review] Stage 1 error:", error);
    // Pass-through fallback so the applicant isn't blocked by an AI
    // outage, but FLAG it as service-unavailable so the UI can show a
    // clear "AI temporarily unavailable" banner rather than a silent
    // 75/passed=true that masks a real failure.
    const reason = (error as any)?.message?.includes("timed out")
      ? "AI review timed out. Please try again in a moment."
      : "AI review service is temporarily unavailable. You can save your draft and re-run the review later.";
    return {
      score: 0,
      passed: false,
      feedback: `[AI_UNAVAILABLE] ${reason}`,
      recommendations: ["Try again — if it keeps failing, contact support."],
      fieldScores: [],
      hasRedFlags: false,
    };
  }
}

// ─── STAGE 2 AI REVIEW — Detailed Ethics & Protocol Review ────────────────
export async function runStage2AiReview(data: {
  researchType: string;
  irbCategory: string;
  researchTitle: string;
  researchObjectives: string;
  methodology: string;
  sampleSize: string;
  targetPopulation: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  dataCollectionMethods: string;
  informedConsentProcess: string;
  riskAssessment: string;
  benefitAssessment: string;
  confidentialityMeasures: string;
  conflictOfInterest: string;
}): Promise<AiReviewResult> {
  // Pull related work from PubMed / ClinicalTrials.gov / S2 / OpenAlex
  // in parallel. The whole block is wrapped — any source failure (DNS,
  // rate limit, schema drift) just yields a smaller context, never a
  // failed review.
  let literatureContext = "";
  try {
    // Smart-built query: strip boilerplate filler from title, append
    // first sentence of objectives. Combined with relevance filtering
    // in the aggregator this yields a tighter, more on-topic context
    // block than raw concatenation.
    const literatureQuery =
      buildLiteratureQuery(data.researchTitle, data.researchObjectives) ||
      data.researchType;
    const bundle = await searchLiterature(literatureQuery, {
      perSource: 6,         // over-fetch
      perSourceCap: 4,      // final cap per source after relevance filter
      minRelevance: 0.08,
    });
    const formatted = formatLiteratureForPrompt(bundle);
    if (formatted) literatureContext = `${formatted}\n\n`;
  } catch (err) {
    console.warn("[AI Review] Literature search failed:", err);
  }

  const prompt = `You are a senior IRB ethics reviewer and bioethics expert for the National Bioethics Committee of Saudi Arabia (NBCE). You hold deep expertise in:
- Declaration of Helsinki (2013 revision)
- ICH-GCP E6(R2) Guidelines
- Belmont Report (Respect, Beneficence, Justice)
- CIOMS International Ethical Guidelines (2016)
- NBCE Implementing Regulations for Research Ethics
- Saudi FDA Clinical Trial Regulations (where applicable)

YOUR ROLE: Conduct a comprehensive Stage 2 ethics and protocol review. This is the CRITICAL stage where research methodology, ethical safeguards, and participant protections are evaluated in depth.

═══════════════════════════════════════════════════
STANDARDIZED ETHICS EVALUATION CHECKLIST (Stage 2)
═══════════════════════════════════════════════════

1. RESEARCH OBJECTIVES (Weight: 10%)
   ✓ SMART format (Specific, Measurable, Achievable, Relevant, Time-bound)
   ✓ Primary and secondary objectives clearly distinguished
   ✓ Scientifically justified and novel
   ✗ RED: Vague, unmeasurable, or ethically questionable objectives

2. METHODOLOGY (Weight: 12%)
   ✓ Study design explicitly stated and appropriate for objectives
   ✓ Methods are reproducible and scientifically valid
   ✓ Controls and comparators described (if applicable)
   ✓ Alignment with research type declared in Stage 1
   ✗ RED: Design cannot answer the research question, or uses unethical methods

3. SAMPLE SIZE (Weight: 8%)
   ✓ Statistical justification provided (power analysis, confidence intervals)
   ✓ Appropriate for study design
   ✓ Neither underpowered (wastes participant time) nor overpowered (exposes unnecessary participants)
   ✗ RED: No justification, or clearly inadequate

4. TARGET POPULATION (Weight: 8%)
   ✓ Demographics clearly defined
   ✓ Vulnerable populations identified with extra protections
   ✓ Population appropriate for research question
   ✗ RED: Targets vulnerable groups without justification

5. INCLUSION CRITERIA (Weight: 7%)
   ✓ Specific, operationally defined
   ✓ Non-discriminatory (no unjustified exclusion by gender, race, etc.)
   ✓ Aligned with study objectives
   ✗ RED: Discriminatory or overly restrictive without justification

6. EXCLUSION CRITERIA (Weight: 7%)
   ✓ Protective of participant safety
   ✓ Identifies conditions that increase risk
   ✓ Includes vulnerable population protections
   ✗ RED: Fails to exclude high-risk participants

7. DATA COLLECTION METHODS (Weight: 8%)
   ✓ Methods clearly described and ethical
   ✓ Minimally invasive where possible
   ✓ Validated instruments referenced (if surveys/questionnaires)
   ✓ Data collection timeline specified
   ✗ RED: Invasive methods without justification, or unvalidated tools

8. INFORMED CONSENT PROCESS (Weight: 12%)
   ✓ Voluntary participation explicitly stated
   ✓ Right to withdraw without penalty
   ✓ Comprehensible language (appropriate literacy level)
   ✓ All risks and benefits disclosed
   ✓ Special provisions for minors/incapacitated (if applicable)
   ✓ Consent documentation method described
   ✗ RED: Missing consent, coercive elements, or inadequate disclosure

9. RISK ASSESSMENT (Weight: 10%)
   ✓ All foreseeable risks identified (physical, psychological, social, economic)
   ✓ Risk severity and probability rated
   ✓ Specific mitigation strategies for each risk
   ✓ Emergency protocols described
   ✓ Risk-benefit ratio favorable
   ✗ RED: Unmitigated serious risks, or risks exceed benefits

10. BENEFIT ASSESSMENT (Weight: 6%)
    ✓ Direct and indirect benefits described
    ✓ Benefits to participants, science, and society
    ✓ Realistic and not exaggerated
    ✓ Proportional to identified risks
    ✗ RED: No identifiable benefits, or wildly exaggerated claims

11. CONFIDENTIALITY MEASURES (Weight: 8%)
    ✓ Data anonymization or pseudonymization plan
    ✓ Secure storage methods (encryption, access controls)
    ✓ Data retention and destruction timeline
    ✓ Compliance with data protection regulations
    ✗ RED: No data protection plan, or identifiable data without justification

12. CONFLICT OF INTEREST (Weight: 4%)
    ✓ All financial and non-financial interests disclosed
    ✓ Management plan for identified conflicts
    ✓ Transparent and complete
    ✗ RED: Undisclosed conflicts that could bias results

═══════════════════════════════════════════════════
SCORING RULES
═══════════════════════════════════════════════════
- Score each field 0-100 based on CONTENT QUALITY and ETHICAL COMPLIANCE
- NEVER penalize for text length — a concise but complete answer scores higher than verbose padding
- 0-49 → RED: Critical ethical/methodological issue — BLOCKS the application
- 50-69 → YELLOW: Deficient but fixable — AI can enhance, human must verify
- 70-89 → GREEN: Meets international standards
- 90-100 → DARK GREEN: Exceeds standards, exemplary
- Overall score = weighted average using weights above
- hasRedFlags = true if ANY field scores below 50

═══════════════════════════════════════════════════
CROSS-PHASE ALIGNMENT VALIDATION
═══════════════════════════════════════════════════
- Methodology must match the research type from Stage 1
- Sample size must be appropriate for the declared study design
- If research type is "clinical_trial", informed consent MUST include trial-specific elements
- If research type is "survey", data collection should reference the survey instrument
- If research type is "retrospective", consent may be waived but justification required

═══════════════════════════════════════════════════
PRIOR-ART & LITERATURE CHECK
═══════════════════════════════════════════════════
- Compare the proposal against the LITERATURE & PRIOR-ART CONTEXT block (when present)
- Flag if an active or recently completed registered trial already addresses the same question and population
- Note when the proposed sample size, design, or endpoints are inconsistent with what comparable studies in the literature have used
- If the proposal cites no precedent and the literature shows substantial prior work, drop the methodology score and add a recommendation to engage with that body of evidence

For each field, provide:
- score (0-100 weighted by content quality)
- feedback (specific strengths and weaknesses)
- suggestion (exact replacement text that would achieve 100/100)

Also provide fieldSuggestions: a complete replacement text for EVERY field that would achieve 100/100.

${literatureContext}APPLICATION DATA:
${JSON.stringify(data, null, 2)}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a senior NBCE IRB ethics reviewer with deep expertise in international bioethics frameworks. Evaluate research protocols against Declaration of Helsinki, ICH-GCP, Belmont Report, and CIOMS guidelines. Score based on content quality and ethical compliance, never on text length. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "stage2_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "integer" },
              feedback: { type: "string" },
              recommendations: { type: "array", items: { type: "string" } },
              fieldScores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    score: { type: "integer" },
                    feedback: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["field", "score", "feedback", "suggestion"],
                  additionalProperties: false,
                },
              },
              fieldSuggestions: {
                type: "object",
                properties: {
                  researchObjectives: { type: "string" },
                  methodology: { type: "string" },
                  sampleSize: { type: "string" },
                  targetPopulation: { type: "string" },
                  inclusionCriteria: { type: "string" },
                  exclusionCriteria: { type: "string" },
                  dataCollectionMethods: { type: "string" },
                  informedConsentProcess: { type: "string" },
                  riskAssessment: { type: "string" },
                  benefitAssessment: { type: "string" },
                  confidentialityMeasures: { type: "string" },
                  conflictOfInterest: { type: "string" },
                },
                required: ["researchObjectives", "methodology", "sampleSize", "targetPopulation", "inclusionCriteria", "exclusionCriteria", "dataCollectionMethods", "informedConsentProcess", "riskAssessment", "benefitAssessment", "confidentialityMeasures", "conflictOfInterest"],
                additionalProperties: false,
              },
              hasRedFlags: { type: "boolean" },
            },
            required: ["score", "feedback", "recommendations", "fieldScores", "fieldSuggestions", "hasRedFlags"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = safeJsonParse(typeof content === "string" ? content : "{}");
    const norm = normalizeReviewJson(parsed);
    const fieldScores: FieldScore[] = (norm.fieldScores || []).map((fs: any) => ({
      ...fs,
      color: getColorFromScore(typeof fs.score === "number" ? fs.score : 0),
    }));

    return {
      score: norm.score,
      passed: norm.score >= PASS_THRESHOLD && !norm.hasRedFlags,
      feedback: norm.feedback || "Review completed.",
      recommendations: norm.recommendations,
      fieldSuggestions: norm.fieldSuggestions,
      fieldScores,
      hasRedFlags: norm.hasRedFlags,
    };
  } catch (error) {
    console.error("[AI Review] Stage 2 error:", error);
    const reason = (error as any)?.message?.includes("timed out")
      ? "AI review timed out. Please try again in a moment."
      : "AI review service is temporarily unavailable. You can save your draft and re-run the review later.";
    return {
      score: 0,
      passed: false,
      feedback: `[AI_UNAVAILABLE] ${reason}`,
      recommendations: ["Try again — if it keeps failing, contact support."],
      fieldSuggestions: {},
      fieldScores: [],
      hasRedFlags: false,
    };
  }
}

// ─── AI AUTO-COMPLETE & ENHANCE (aims for 100/100) ───────────────────────
export interface Stage1ContextForAutoComplete {
  principalInvestigator?: string;
  piInstitution?: string;
  piDepartment?: string;
  fundingSource?: string;
  estimatedDuration?: string;
  irbCategory?: string;
  stage1AiScore?: number | null;
  stage1FeedbackSummary?: string;
}

export async function aiAutoCompleteFields(data: {
  researchType: string;
  researchTitle: string;
  existingFields: Record<string, string>;
  stage?: "stage1" | "stage2";
  /** Stage 1 gateway info — used when stage="stage2" so generated
   *  text references the same PI / institution / funding the applicant
   *  declared on Stage 1, instead of generic NBCE boilerplate. */
  stage1Context?: Stage1ContextForAutoComplete;
}): Promise<Record<string, string>> {
  const stage1Fields = {
    researchTitle: "Clear, specific, scientifically meaningful research title including study design and population",
    principalInvestigator: "Full name with academic credentials (e.g., Dr. Ahmed Al-Rashid, MD, PhD)",
    piInstitution: "Full official institution name",
    piDepartment: "Department name relevant to the research",
    fundingSource: "Funding source with grant details if applicable",
    estimatedDuration: "Realistic timeline with start/end dates or duration in months",
  };

  const stage2Fields = {
    researchObjectives: "Primary and secondary objectives in SMART format (Specific, Measurable, Achievable, Relevant, Time-bound)",
    methodology: "Complete research design description: study type, procedures, controls, data analysis plan",
    sampleSize: "Sample size with full statistical justification: power analysis, confidence level, margin of error, expected effect size",
    targetPopulation: "Detailed demographics: age range, gender, location, health status, and any special characteristics",
    inclusionCriteria: "Numbered list of specific, operationally defined, non-discriminatory inclusion criteria",
    exclusionCriteria: "Numbered list of protective exclusion criteria with special attention to vulnerable populations",
    dataCollectionMethods: "Step-by-step data collection process: instruments used, validation status, timeline, and ethical safeguards",
    informedConsentProcess: "Complete consent process: how consent is obtained, language level, right to withdraw, special provisions for vulnerable groups, documentation method",
    riskAssessment: "Comprehensive risk matrix: each risk identified with severity, probability, mitigation strategy, and emergency protocol",
    benefitAssessment: "Direct benefits to participants, indirect benefits to science and society, with realistic expectations",
    confidentialityMeasures: "Data protection plan: anonymization method, encryption, access controls, storage location, retention period, destruction protocol",
    conflictOfInterest: "Complete disclosure of all financial and non-financial interests, with management plan if conflicts exist",
  };

  const fields = data.stage === "stage1" ? stage1Fields : stage2Fields;

  const existingContent = Object.entries(data.existingFields)
    .filter(([_, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  // Stage 1 context block — only meaningful when generating Stage 2.
  let stage1Block = "";
  if (data.stage !== "stage1" && data.stage1Context) {
    const c = data.stage1Context;
    const parts: string[] = [];
    if (c.principalInvestigator) parts.push(`PI: ${c.principalInvestigator}`);
    if (c.piInstitution) parts.push(`Institution: ${c.piInstitution}`);
    if (c.piDepartment) parts.push(`Department: ${c.piDepartment}`);
    if (c.fundingSource) parts.push(`Funding: ${c.fundingSource}`);
    if (c.estimatedDuration) parts.push(`Duration: ${c.estimatedDuration}`);
    if (c.irbCategory) parts.push(`IRB category: ${c.irbCategory}`);
    if (typeof c.stage1AiScore === "number") parts.push(`Stage 1 score: ${c.stage1AiScore}/100`);
    if (parts.length > 0) {
      stage1Block = `\n═══════════════════════════════════════════════════\nSTAGE 1 GATEWAY FACTS (already approved by the applicant — use these in your output)\n═══════════════════════════════════════════════════\n${parts.join("\n")}\n${c.stage1FeedbackSummary ? `\nReviewer notes from Stage 1: ${c.stage1FeedbackSummary.slice(0, 600)}\n` : ""}`;
    }
  }

  // Literature context block — only meaningful when generating Stage 2.
  let literatureBlock = "";
  if (data.stage !== "stage1" && data.researchTitle && data.researchTitle.length > 8) {
    try {
      const litQuery = buildLiteratureQuery(data.researchTitle);
      const bundle = await searchLiterature(litQuery, {
        perSource: 5,
        perSourceCap: 3,
        minRelevance: 0.1,
      });
      const formatted = formatLiteratureForPrompt(bundle);
      if (formatted) literatureBlock = `\n${formatted}\n`;
    } catch (err) {
      console.warn("[aiAutoComplete] literature search failed:", err);
    }
  }

  const prompt = `You are an expert research protocol writer specializing in IRB applications for the National Bioethics Committee of Saudi Arabia (NBCE).

YOUR MISSION: Generate or enhance ALL fields to achieve a PERFECT 100/100 score on IRB review.

═══════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════
Research Type: ${data.researchType}
Research Title: ${data.researchTitle}

Current content provided by the applicant:
${existingContent || "(All fields are empty — generate complete content from scratch based on the research title and type)"}
${stage1Block}${literatureBlock}
═══════════════════════════════════════════════════
FIELDS TO COMPLETE/ENHANCE TO 100/100
═══════════════════════════════════════════════════
${Object.entries(fields).map(([k, desc]) => `• ${k}: ${desc}`).join("\n")}

═══════════════════════════════════════════════════
QUALITY STANDARDS
═══════════════════════════════════════════════════
1. PRESERVE INTENT: If the applicant provided content, enhance it while keeping their original research direction
2. FILL ALL BLANKS: If a field is empty, generate appropriate content that is consistent with the research title and type
3. CROSS-FIELD CONSISTENCY: All fields must be internally consistent (e.g., methodology matches objectives, sample size matches target population), AND consistent with the STAGE 1 GATEWAY FACTS above when present (do not invent a different PI, institution, funding source, or duration)
4. PROFESSIONAL LANGUAGE: Use academic, precise language appropriate for an IRB submission
5. ETHICAL COMPLIANCE: Every field must align with Declaration of Helsinki, ICH-GCP, Belmont Report, and NBCE regulations
6. SPECIFICITY: Avoid generic statements — be specific to THIS research and this Saudi setting
7. COMPLETENESS: Each field should be comprehensive enough to stand alone without additional explanation
8. PRIOR-ART AWARENESS: When the LITERATURE & PRIOR-ART CONTEXT block is provided, mention how this study aligns with or differs from existing work in the methodology field

═══════════════════════════════════════════════════
TEMPLATE FALLBACK RULE — when you cannot honestly fill a field
═══════════════════════════════════════════════════
If you genuinely cannot infer a field from the supplied context (e.g. the title is too vague to determine a sample size, or there is no evidence about the specific population), DO NOT invent values. Instead, return that field in this exact format:

[TEMPLATE — applicant must complete] <one-line pattern with bracketed placeholders>. EXAMPLE: <one concrete example tailored to this research type>. WHY THIS MATTERS: <one short reason>.

This format gives the applicant a fillable scaffold while making the gap explicit. It is far better than a fabricated answer.

IMPORTANT: The applicant is responsible for the truthfulness and accuracy of all content. Your role is to enhance quality, completeness, and ethical compliance.

OUTPUT FORMAT — strict: every field is a PLAIN STRING. Never return nested objects, arrays, markdown headings, or labelled sub-sections. Just clean prose.
${ETHICS_SAFEGUARDS}`;

  try {
    const fieldProperties: Record<string, any> = {};
    for (const key of Object.keys(fields)) {
      fieldProperties[key] = { type: "string" };
    }

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert NBCE research protocol writer. Generate comprehensive, ethically compliant content that scores 100/100 on IRB review. Every field must be specific to the research, internally consistent with Stage 1 gateway facts, and aligned with international bioethics standards. When context is insufficient, emit a [TEMPLATE — applicant must complete] scaffold rather than fabricating. Respond only with valid JSON whose fields are plain strings." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "auto_complete",
          strict: true,
          schema: {
            type: "object",
            properties: fieldProperties,
            required: Object.keys(fields),
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = safeJsonParse(typeof content === "string" ? content : "{}") as Record<string, any>;
    // Coerce: some providers return nested objects per field. Reach
    // into common shapes; final fallback picks the longest string property.
    const coerce = (v: unknown): string => {
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      if (v && typeof v === "object") {
        const o = v as any;
        for (const k of ["value", "text", "content", "enhancedValue", "enhanced", "result", "newValue", "field"]) {
          if (typeof o[k] === "string" && o[k].length > 0) return o[k];
        }
        const stringProps = Object.values(o).filter(x => typeof x === "string" && (x as string).length > 0) as string[];
        if (stringProps.length > 0) return stringProps.sort((a, b) => b.length - a.length)[0];
      }
      return "";
    };
    const flat: Record<string, string> = {};
    for (const k of Object.keys(fields)) {
      const v = coerce(parsed[k]);
      if (v) flat[k] = v;
    }
    return flat;
  } catch (error) {
    console.error("[AI AutoComplete] Error:", error);
    // Sentinel marker the UI uses to render an outage banner instead of
    // an empty diff modal that looks like "no changes suggested".
    const reason = (error as any)?.message?.includes("timed out")
      ? "AI auto-complete timed out. The model is busy — please try again in a moment."
      : "AI auto-complete service is temporarily unavailable.";
    return { __ai_unavailable: reason };
  }
}

// ─── AI ENHANCE STAGE 1 GATEWAY FIELDS ───────────────────────────────────
// Dedicated to "improve what the applicant already wrote" — expand
// abbreviations, fix spelling, complete fragments, add design type to
// titles. NOT for fabricating values from nothing. Distinct from
// aiAutoCompleteFields (which is permitted to draft missing fields and
// uses the strict ETHICS_SAFEGUARDS refusal block).
export async function aiEnhanceStage1Fields(data: {
  researchType: string;
  irbCategory: string;
  current: {
    researchTitle: string;
    principalInvestigator: string;
    piInstitution: string;
    piDepartment: string;
    fundingSource: string;
    estimatedDuration: string;
  };
  stage1FeedbackSummary?: string;
}): Promise<typeof data.current> {
  const prompt = `You are an expert NBCE IRB application editor. Your job is to POLISH and EXPAND each gateway field the applicant has already provided, so it meets IRB standards. You are an EDITOR, not a writer-from-scratch.

CONTEXT
- Research type: ${data.researchType}
- IRB category: ${data.irbCategory}
${data.stage1FeedbackSummary ? `- Latest AI review feedback: ${data.stage1FeedbackSummary.slice(0, 800)}\n` : ""}

FIELDS TO POLISH (current values come from the applicant):
${JSON.stringify(data.current, null, 2)}

EDITING RULES
1. EXPAND abbreviations to their full form ("KFSH" → "King Faisal Specialist Hospital and Research Centre, Riyadh"). Abbreviations of real Saudi institutions are SAFE to expand — these are public facts.
2. FIX spelling and grammar. ("brain abcess" → "brain abscess")
3. COMPLETE fragments where the applicant clearly intended a specific meaning. ("3 months" → "3 months (estimated study period: <start month> to <start month + 3>)").
4. ADD missing structural elements to titles: study design (cross-sectional / RCT / cohort / case series), target population, setting, and timeframe. Use the research type to pick the right design term.
5. PRESERVE the applicant's intent. If they wrote "metformin trial", do not change it to "rosuvastatin trial".
6. DO NOT invent personal credentials. If "principalInvestigator" is just "Dr Sarah", you may add the qualifier "(applicant must confirm full name and credentials)" but do NOT invent a surname or degree. Same for any private/personal data.
7. DO NOT change valid information. If a field is already complete and well-formed, return it UNCHANGED.

OUTPUT — STRICT JSON, plain strings only, no nested objects:
{
  "researchTitle": "<polished title>",
  "principalInvestigator": "<polished PI line>",
  "piInstitution": "<polished institution>",
  "piDepartment": "<polished department>",
  "fundingSource": "<polished funding source>",
  "estimatedDuration": "<polished duration>"
}

Each value MUST be a plain string. NEVER return nested objects, arrays, or markdown — just strings.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an editor. You polish and expand the applicant's existing values. You do not fabricate new data. You return strict JSON with plain string values, never nested objects." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "stage1_enhance",
          strict: true,
          schema: {
            type: "object",
            properties: {
              researchTitle: { type: "string" },
              principalInvestigator: { type: "string" },
              piInstitution: { type: "string" },
              piDepartment: { type: "string" },
              fundingSource: { type: "string" },
              estimatedDuration: { type: "string" },
            },
            required: ["researchTitle", "principalInvestigator", "piInstitution", "piDepartment", "fundingSource", "estimatedDuration"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    const parsed = safeJsonParse(typeof content === "string" ? content : "{}") as Record<string, any>;
    // Coerce defensively in case the model still nested anything.
    const coerce = (v: unknown, fallback: string): string => {
      if (typeof v === "string" && v.length > 0) return v;
      if (typeof v === "object" && v !== null) {
        const o = v as any;
        for (const k of ["value", "text", "content", "enhancedValue", "enhanced", "result", "newValue"]) {
          if (typeof o[k] === "string" && o[k].length > 0) return o[k];
        }
        const longest = Object.values(o).filter(x => typeof x === "string" && (x as string).length > 0) as string[];
        if (longest.length > 0) return longest.sort((a, b) => b.length - a.length)[0];
      }
      return fallback;
    };
    return {
      researchTitle: coerce(parsed.researchTitle, data.current.researchTitle),
      principalInvestigator: coerce(parsed.principalInvestigator, data.current.principalInvestigator),
      piInstitution: coerce(parsed.piInstitution, data.current.piInstitution),
      piDepartment: coerce(parsed.piDepartment, data.current.piDepartment),
      fundingSource: coerce(parsed.fundingSource, data.current.fundingSource),
      estimatedDuration: coerce(parsed.estimatedDuration, data.current.estimatedDuration),
    };
  } catch (err) {
    console.error("[aiEnhanceStage1Fields] failed:", err);
    return data.current;
  }
}

// ─── AI RESOLVE SINGLE FIELD ──────────────────────────────────────────────
export async function aiResolveField(data: {
  fieldName: string;
  currentValue: string;
  feedback: string;
  researchType: string;
  researchTitle: string;
  context: Record<string, string>;
}): Promise<{ enhancedValue: string; explanation: string }> {
  const prompt = `You are a specialized IRB field resolution assistant for the National Bioethics Committee of Saudi Arabia (NBCE).

YOUR MISSION: Fix this specific field to achieve a PERFECT 100/100 score on IRB review.

═══════════════════════════════════════════════════
FIELD DETAILS
═══════════════════════════════════════════════════
Research Title: "${data.researchTitle}"
Research Type: ${data.researchType}
Field Name: ${data.fieldName}
Current Value: "${data.currentValue}"
Review Feedback: "${data.feedback}"

Other application fields for context:
${JSON.stringify(data.context, null, 2)}

═══════════════════════════════════════════════════
RESOLUTION RULES
═══════════════════════════════════════════════════
1. ADDRESS the specific feedback/issue identified in the review
2. PRESERVE the applicant's original intent and research direction
3. ENHANCE quality, completeness, and ethical compliance
4. ENSURE consistency with other fields in the application
5. Use professional academic language appropriate for NBCE submission
6. The enhanced value must score 100/100 on re-review
7. Explain clearly what was changed and why

IMPORTANT: The applicant is responsible for truth and accuracy. Enhance quality without fabricating data.
${ETHICS_SAFEGUARDS}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an NBCE IRB field resolution specialist. Fix the field to achieve a perfect score while preserving the applicant's intent. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "resolve_field",
          strict: true,
          schema: {
            type: "object",
            properties: {
              enhancedValue: { type: "string" },
              explanation: { type: "string" },
            },
            required: ["enhancedValue", "explanation"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    return safeJsonParse(typeof content === "string" ? content : '{"enhancedValue":"","explanation":""}');
  } catch (error) {
    console.error("[AI Resolve] Error:", error);
    return { enhancedValue: data.currentValue, explanation: "AI resolution failed. Please try again." };
  }
}

// ─── AI FIX ALL COMMENTS — Batch resolve all feedback issues ──────────────
export async function aiFixAllComments(data: {
  researchType: string;
  researchTitle: string;
  fields: Record<string, string>;
  fieldScores: FieldScore[];
}): Promise<Record<string, string>> {
  // Only fix fields that scored below 90 (not dark green)
  const fieldsToFix = data.fieldScores.filter(fs => fs.score < 90);
  if (fieldsToFix.length === 0) return data.fields;

  const issuesSummary = fieldsToFix
    .map(fs => `• ${fs.field} (score: ${fs.score}, color: ${fs.color}): ${fs.feedback}`)
    .join("\n");

  const prompt = `You are a senior IRB application enhancement specialist for the National Bioethics Committee of Saudi Arabia (NBCE).

YOUR MISSION: Fix ALL flagged fields in a single pass to achieve 100/100 on every field.

═══════════════════════════════════════════════════
APPLICATION CONTEXT
═══════════════════════════════════════════════════
Research Title: "${data.researchTitle}"
Research Type: ${data.researchType}

═══════════════════════════════════════════════════
CURRENT FIELD VALUES
═══════════════════════════════════════════════════
${Object.entries(data.fields).map(([k, v]) => `${k}: ${v}`).join("\n\n")}

═══════════════════════════════════════════════════
ISSUES TO FIX (from AI Review)
═══════════════════════════════════════════════════
${issuesSummary}

═══════════════════════════════════════════════════
FIX RULES
═══════════════════════════════════════════════════
1. Fix EVERY field listed in the issues above
2. For RED fields: Complete rewrite addressing the critical issue
3. For YELLOW fields: Enhance to meet standards
4. For GREEN fields: Polish to achieve perfect score
5. Maintain CROSS-FIELD CONSISTENCY — all fields must work together
6. Preserve the applicant's original research intent
7. Use professional academic language
8. Ensure ethical compliance with Declaration of Helsinki, ICH-GCP, Belmont Report, NBCE regulations

Return ALL fields (both fixed and unchanged) as a complete set.
${ETHICS_SAFEGUARDS}`;

  try {
    const fieldProperties: Record<string, any> = {};
    for (const key of Object.keys(data.fields)) {
      fieldProperties[key] = { type: "string" };
    }

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a senior NBCE IRB enhancement specialist. Fix all flagged fields to achieve perfect scores while maintaining cross-field consistency. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "fix_all",
          strict: true,
          schema: {
            type: "object",
            properties: fieldProperties,
            required: Object.keys(data.fields),
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    return safeJsonParse(typeof content === "string" ? content : "{}");
  } catch (error) {
    console.error("[AI FixAll] Error:", error);
    return data.fields;
  }
}

// ─── SAMPLE SIZE CALCULATOR ───────────────────────────────────────────────
export async function calculateSampleSize(data: {
  studyType: string;
  confidenceLevel: number;
  marginOfError: number;
  populationSize?: number;
  expectedProportion?: number;
  effectSize?: string;
  power?: number;
}): Promise<{
  recommendedSize: number;
  formula: string;
  explanation: string;
  assumptions: string[];
}> {
  const z = data.confidenceLevel === 99 ? 2.576 : data.confidenceLevel === 95 ? 1.96 : data.confidenceLevel === 90 ? 1.645 : 1.96;
  const p = (data.expectedProportion ?? 50) / 100;
  const e = data.marginOfError / 100;

  let n = Math.ceil((z * z * p * (1 - p)) / (e * e));

  if (data.populationSize && data.populationSize > 0) {
    n = Math.ceil(n / (1 + (n - 1) / data.populationSize));
  }

  const adjusted = Math.ceil(n * 1.1);

  const formula = data.populationSize
    ? `n = [Z²×p×(1-p)/e²] / [1 + (Z²×p×(1-p)/e² - 1)/N]`
    : `n = Z²×p×(1-p)/e²`;

  return {
    recommendedSize: adjusted,
    formula,
    explanation: `Based on a ${data.confidenceLevel}% confidence level with a ${data.marginOfError}% margin of error${data.populationSize ? ` and a population of ${data.populationSize}` : ""}, the minimum sample size is ${n}. With a 10% adjustment for non-response, the recommended sample size is ${adjusted}.`,
    assumptions: [
      `Confidence Level: ${data.confidenceLevel}%`,
      `Margin of Error: ${data.marginOfError}%`,
      `Expected Proportion: ${data.expectedProportion ?? 50}%`,
      data.populationSize ? `Population Size: ${data.populationSize}` : "Infinite population assumed",
      "10% non-response rate adjustment applied",
    ],
  };
}
