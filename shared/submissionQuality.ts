/**
 * Deterministic, instant pre-submission quality guidance (no AI call, no cost).
 *
 * These checks look for the elements research ethics committees most often
 * return applications for — under the Saudi Law of Ethics of Research on
 * Living Creatures and its Implementing Regulations (NCBE), the Personal Data
 * Protection Law, and international guidance (Declaration of Helsinki, ICH E6
 * GCP, CIOMS). They are recommendations to help applicants submit above the
 * minimum standard; they never block submission and never replace human review.
 * Keyword matching is bilingual (English/Arabic) and intentionally lenient.
 */
export type QualityStatus = "pass" | "improve" | "attention";
export type QualityItem = {
  id: string;
  status: QualityStatus;
  field: string;
  stage: 1 | 2;
  titleEn: string;
  titleAr: string;
  tipEn: string;
  tipAr: string;
};
export type SubmissionQuality = {
  score: number;
  level: "excellent" | "good" | "needs_work";
  items: QualityItem[];
};

type QualityInput = Partial<Record<
  | "researchType" | "irbCategory" | "researchTitle" | "fundingSource" | "estimatedDuration"
  | "researchObjectives" | "methodology" | "sampleSize" | "targetPopulation" | "inclusionCriteria"
  | "exclusionCriteria" | "dataCollectionMethods" | "informedConsentProcess" | "riskAssessment"
  | "benefitAssessment" | "confidentialityMeasures" | "conflictOfInterest" | "clinicalTrialDetails"
  | "retrospectiveDataSource",
  string | null | undefined
>>;

const text = (value: string | null | undefined) => (typeof value === "string" ? value : "").trim();
const has = (value: string, pattern: RegExp) => pattern.test(value);

const PLACEHOLDER = /\[(?:MISSING|STILL MISSING|NEEDS APPLICANT|ASSUMPTION|BLOCKED)[^\]]*\]|\b(?:TBD|TODO|lorem ipsum|xxx+)\b|\?\?\?|يُحدد لاحقاً|سيتم تحديده لاحقاً/i;
const VULNERABLE = /\b(?:child(?:ren)?|minors?|paediatric|pediatric|adolescen\w*|infants?|neonat\w*|under\s*18|students?|employees?|staff members?|pregnan\w*|prisoners?|detainees?|dementia|cognitive(?:ly)? impair\w*|intellectual disabilit\w*|refugees?)\b|أطفال|الأطفال|طفل|قاصر|القصر|المراهقين|حديثي الولادة|طلاب|الطلاب|طالبات|موظف|الموظفين|حوامل|الحوامل|سجناء|الخرف|ضعف إدراكي|إعاقة ذهنية|لاجئين/i;
const VULNERABLE_SAFEGUARD = /\bassent\b|guardian|parent(?:al)? (?:consent|permission)|legally authori[sz]ed|\bLAR\b|without (?:any )?(?:coercion|pressure)|not (?:be )?coerc|no academic (?:penalty|consequence)|independent (?:person|recruiter)|will not affect (?:their|grades|employment|care)|ولي الأمر|أولياء الأمور|موافقة الطفل|الوصي|الممثل القانوني|دون إكراه|دون ضغط|لن يؤثر/i;

/** Checks whose failure always needs a reviewer's attention after submission. */
export const ATTENTION_CHECKS = {
  vulnerable_safeguards: ["Vulnerable participants without described safeguards", "فئات مستضعفة دون ضمانات موصوفة"],
  no_placeholders: ["Unresolved placeholders in the submitted text", "عناصر ناقصة غير محلولة في النص المقدم"],
  trial_registration: ["Clinical trial without registration or SFDA pathway", "تجربة سريرية دون خطة تسجيل أو مسار الهيئة العامة للغذاء والدواء"],
} as const;
export type AttentionCheck = keyof typeof ATTENTION_CHECKS;
export function isAttentionCheck(value: unknown): value is AttentionCheck {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ATTENTION_CHECKS, value);
}

function item(id: string, ok: boolean, field: string, stage: 1 | 2, titleEn: string, titleAr: string, tipEn: string, tipAr: string, severe = false): QualityItem {
  return { id, status: ok ? "pass" : severe ? "attention" : "improve", field, stage, titleEn, titleAr, tipEn, tipAr };
}

export function assessSubmissionQuality(app: QualityInput): SubmissionQuality {
  const f = {
    type: text(app.researchType),
    objectives: text(app.researchObjectives),
    methodology: text(app.methodology),
    sample: text(app.sampleSize),
    population: `${text(app.targetPopulation)} ${text(app.inclusionCriteria)}`,
    inclusion: text(app.inclusionCriteria),
    consent: text(app.informedConsentProcess),
    risk: text(app.riskAssessment),
    confidentiality: text(app.confidentialityMeasures),
    coi: text(app.conflictOfInterest),
    trial: `${text(app.clinicalTrialDetails)} ${text(app.methodology)} ${text(app.dataCollectionMethods)}`,
  };
  const items: QualityItem[] = [];
  const retrospective = f.type === "retrospective" || /retrospective|chart review|medical records|existing data|بأثر رجعي|السجلات الطبية|بيانات موجودة/i.test(`${f.methodology} ${text(app.retrospectiveDataSource)}`);
  const caseStudy = f.type === "case_study";

  items.push(item("primary_objective", has(f.objectives, /primary|main (?:aim|objective)|aim(?:s)? (?:is|are|to)|specific objectives?|hypothes|الهدف الرئيس|الهدف الأساسي|الهدف العام|الأهداف الخاصة|يهدف|فرضية/i), "researchObjectives", 2,
    "Clear primary objective", "هدف رئيس واضح",
    "State one primary objective and how it will be measured, then list secondary objectives.", "اذكر هدفاً رئيساً واحداً وكيف سيُقاس، ثم الأهداف الثانوية."));

  items.push(item("design_detail", f.methodology.length >= 120 && has(f.methodology, /design|cohort|cross-sectional|randomi[sz]ed|case-control|qualitative|survey|interview|retrospective|prospective|analysis|statistic|تصميم|مقطعية|أترابية|عشوائية|نوعية|استبانة|مقابلات|تحليل|إحصائي/i), "methodology", 2,
    "Study design and analysis plan", "تصميم الدراسة وخطة التحليل",
    "Name the design, setting, procedures, timeline and the analysis plan (statistical or qualitative).", "حدّد التصميم ومكان الدراسة والإجراءات والجدول الزمني وخطة التحليل الإحصائي أو النوعي."));

  if (!caseStudy) items.push(item("sample_justification", has(f.sample, /\d/) && has(f.sample, /power|confidence|margin of error|precision|effect size|formula|calculat|saturation|census|all (?:eligible|available)|feasib|previous stud|pilot|قوة|مستوى الثقة|هامش الخطأ|حجم الأثر|معادلة|حساب|التشبع|حصر|جميع|المتاح|الجدوى|دراسات سابقة/i), "sampleSize", 2,
    "Justified sample size", "حجم عينة مبرر",
    "Give the planned number and how it was derived (power calculation, precision, saturation or a defined census).", "اذكر العدد المخطط وطريقة اشتقاقه (حساب القوة الإحصائية أو الدقة أو التشبع أو الحصر الشامل)."));

  items.push(item("eligibility", f.inclusion.length >= 40 && text(app.exclusionCriteria).length >= 15, "inclusionCriteria", 2,
    "Operational eligibility criteria", "معايير أهلية قابلة للتطبيق",
    "List concrete inclusion and exclusion criteria (age range, diagnosis, setting, time window).", "اذكر معايير إدراج واستبعاد محددة (الفئة العمرية، التشخيص، المكان، الفترة الزمنية)."));

  if (retrospective) {
    const waiver = has(f.consent, /waiv|exempt|not (?:be )?(?:feasible|practicable)|impracticab|إعفاء|تنازل|غير عملي|تعذر/i);
    items.push(item("consent_waiver", waiver && has(f.consent, /minimal risk|de-?identif|anonym|impracticab|not (?:be )?(?:feasible|practicable)|no contact|الحد الأدنى|منزوعة|إخفاء الهوية|غير عملي|تعذر التواصل/i), "informedConsentProcess", 2,
      "Consent waiver rationale", "مبررات الإعفاء من الموافقة",
      "If you request a consent waiver, explain why consent is impracticable, why risk is minimal and how identities are protected. The committee decides.", "إذا طلبت الإعفاء من الموافقة فوضّح سبب تعذرها وأن المخاطر في حدها الأدنى وكيف تُحمى الهويات. القرار للجنة."));
  } else {
    const elements = [/voluntar|طوع|اختيار/i, /withdraw|انسحاب|الانسحاب/i, /risk|discomfort|مخاطر|مخاطرة|إزعاج/i, /confidential|privacy|سرية|خصوصية/i];
    items.push(item("consent_elements", f.consent.length >= 80 && elements.every(pattern => has(f.consent, pattern)), "informedConsentProcess", 2,
      "Complete informed consent", "موافقة مستنيرة مكتملة",
      "Cover voluntary participation, the right to withdraw without penalty, risks, confidentiality, who obtains consent and a contact for questions.", "غطِّ طوعية المشاركة وحق الانسحاب دون عقوبة والمخاطر والسرية ومن يحصل على الموافقة وجهة التواصل للاستفسار."));
  }

  if (has(f.population, VULNERABLE)) {
    items.push(item("vulnerable_safeguards", has(`${f.consent} ${f.risk} ${f.population}`, VULNERABLE_SAFEGUARD), "targetPopulation", 2,
      "Safeguards for vulnerable participants", "ضمانات للمشاركين من الفئات المستضعفة",
      "Your population includes groups needing extra protection. Describe guardian consent and child assent, or how students/employees are protected from pressure.", "تشمل الفئة المستهدفة مجموعات تحتاج حماية إضافية. صف موافقة ولي الأمر وموافقة الطفل، أو كيف يُحمى الطلاب/الموظفون من أي ضغط.", true));
  }

  const dataParts = [/de-?identif|anonymi|pseudonym|coded|coding|code numbers?|إخفاء الهوية|منزوعة الهوية|ترميز|رموز/i, /encrypt|password|access (?:is )?(?:restricted|limited|control)|authori[sz]ed (?:personnel|staff)|secure|تشفير|كلمة مرور|صلاحي|مقصور|آمن/i, /retain|retention|\d+\s*(?:years?|سنوات|سنة)|destroy|destruction|delet|dispos|الاحتفاظ|إتلاف|حذف/i];
  const missingData = dataParts.filter(pattern => !has(f.confidentiality, pattern)).length;
  items.push(item("data_protection", missingData === 0, "confidentialityMeasures", 2,
    "Data protection plan (PDPL)", "خطة حماية البيانات (نظام حماية البيانات الشخصية)",
    "Describe de-identification/coding, who can access data and how it is secured, and the retention period and disposal. Mention any transfer outside Saudi Arabia.", "صف إخفاء الهوية أو الترميز، ومن يصل إلى البيانات وكيف تُؤمَّن، ومدة الاحتفاظ وطريقة الإتلاف، وأي نقل للبيانات خارج المملكة."));

  items.push(item("risk_mitigation", f.risk.length >= 40 && has(f.risk, /mitigat|minimi[sz]|reduc|safeguard|protect|monitor|refer|تقليل|تخفيف|حماية|مراقبة|إحالة|إجراءات/i), "riskAssessment", 2,
    "Risks with mitigation", "المخاطر وإجراءات التخفيف",
    "Name the realistic risks (including privacy and psychological) and the specific step that reduces each one.", "اذكر المخاطر الواقعية (بما فيها الخصوصية والنفسية) والإجراء المحدد الذي يقلل كل منها."));

  items.push(item("conflict_of_interest", f.coi.length >= 4, "conflictOfInterest", 2,
    "Conflict of interest statement", "إفصاح عن تعارض المصالح",
    "State any financial or non-financial interests, or write clearly that there are none.", "اذكر أي مصالح مالية أو غير مالية، أو صرّح بوضوح بعدم وجودها."));

  if (f.type === "clinical_trial") {
    items.push(item("trial_registration", has(f.trial, /SCTR|Saudi Clinical Trials? Registry|clinicaltrials\.gov|NCT\d{8}|registr|SFDA|السجل السعودي للتجارب|تسجيل التجربة|الهيئة العامة للغذاء والدواء/i), "clinicalTrialDetails", 1,
      "Trial registration and SFDA pathway", "تسجيل التجربة ومسار الهيئة العامة للغذاء والدواء",
      "Clinical trials should state registry plans (Saudi Clinical Trials Registry or ClinicalTrials.gov) and any SFDA authorization needed for drugs or devices.", "ينبغي أن توضح التجارب السريرية خطة التسجيل (السجل السعودي للتجارب السريرية أو ClinicalTrials.gov) وأي موافقة مطلوبة من الهيئة العامة للغذاء والدواء للأدوية أو الأجهزة.", true));
  }

  items.push(item("timeline_funding", text(app.estimatedDuration).length > 0 && text(app.fundingSource).length > 0, "estimatedDuration", 1,
    "Timeline and funding", "المدة والتمويل",
    "Add the expected duration and the funding source (or 'self-funded').", "أضف المدة المتوقعة ومصدر التمويل (أو «تمويل ذاتي»)."));

  const applicantText: Array<keyof QualityInput> = ["researchTitle", "fundingSource", "estimatedDuration", "researchObjectives", "methodology", "sampleSize", "targetPopulation", "inclusionCriteria", "exclusionCriteria", "dataCollectionMethods", "informedConsentProcess", "riskAssessment", "benefitAssessment", "confidentialityMeasures", "conflictOfInterest", "clinicalTrialDetails", "retrospectiveDataSource"];
  // Only applicant-authored fields; AI feedback may legitimately quote placeholder markers.
  const unresolved = applicantText.some(key => PLACEHOLDER.test(text(app[key])));
  items.push(item("no_placeholders", !unresolved, "researchObjectives", 2,
    "No unresolved placeholders", "لا توجد عناصر ناقصة معلّمة",
    "Replace every [MISSING…], [ASSUMPTION…], TBD or TODO marker with confirmed facts before submitting.", "استبدل كل علامة [MISSING…] أو [ASSUMPTION…] أو «يُحدد لاحقاً» بمعلومات مؤكدة قبل التقديم.", true));

  const weights: Record<QualityStatus, number> = { pass: 1, improve: 0, attention: 0 };
  const score = items.length ? Math.round((items.reduce((sum, row) => sum + weights[row.status], 0) / items.length) * 100) : 0;
  const attention = items.some(row => row.status === "attention");
  return { score, level: score >= 90 && !attention ? "excellent" : score >= 70 && !attention ? "good" : "needs_work", items };
}
