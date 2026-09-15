import { STAGE2_KEYS, type Stage2Field, type Stage2Values } from "./stage2Keys";
export { STAGE2_KEYS, type Stage2Field, type Stage2Values } from "./stage2Keys";
/** Canonical Stage 2 form names and bilingual labels; scientific requirements stay server-authoritative. */
export const STAGE2_FIELDS = [
  {
    key: "researchObjectives",
    group: "design",
    en: "Research objectives",
    ar: "أهداف البحث",
    helpEn:
      "State the question, primary objective, and any secondary objectives.",
    helpAr: "اذكر سؤال البحث والهدف الأساسي وأي أهداف ثانوية.",
  },
  {
    key: "methodology",
    group: "design",
    en: "Methodology",
    ar: "المنهجية",
    helpEn:
      "Describe the study design, setting, procedures, and analysis plan.",
    helpAr: "صف تصميم الدراسة ومكانها وإجراءاتها وخطة التحليل.",
  },
  {
    key: "sampleSize",
    group: "design",
    en: "Sample size",
    ar: "حجم العينة",
    helpEn:
      "Give the planned number and its justification. Explain if a fixed sample size does not apply.",
    helpAr: "اذكر العدد المخطط ومبرراته، أو وضّح سبب عدم انطباق حجم عينة ثابت.",
  },
  {
    key: "targetPopulation",
    group: "participants",
    en: "Target population",
    ar: "الفئة المستهدفة",
    helpEn:
      "Describe the participants, records, or other sources included in the study.",
    helpAr: "صف المشاركين أو السجلات أو المصادر الأخرى التي تشملها الدراسة.",
  },
  {
    key: "inclusionCriteria",
    group: "participants",
    en: "Inclusion criteria",
    ar: "معايير الإدراج",
    helpEn: "State who or what is eligible for inclusion.",
    helpAr: "حدد شروط إدراج المشاركين أو السجلات في الدراسة.",
  },
  {
    key: "exclusionCriteria",
    group: "participants",
    en: "Exclusion criteria",
    ar: "معايير الاستبعاد",
    helpEn: "List exclusions, or explain why no additional exclusions apply.",
    helpAr: "اذكر معايير الاستبعاد، أو اشرح سبب عدم وجود معايير إضافية.",
  },
  {
    key: "dataCollectionMethods",
    group: "data",
    en: "Data collection methods",
    ar: "طرق جمع البيانات",
    helpEn:
      "Describe the sources, instruments, collection process, and data access.",
    helpAr: "صف المصادر والأدوات وآلية جمع البيانات وصلاحيات الوصول إليها.",
  },
  {
    key: "informedConsentProcess",
    group: "data",
    en: "Informed consent process",
    ar: "إجراءات الموافقة المستنيرة",
    helpEn:
      "Explain consent, or justify a requested waiver for the committee to assess.",
    helpAr: "اشرح إجراءات الموافقة، أو برّر طلب الإعفاء لتقيّمه اللجنة.",
  },
  {
    key: "riskAssessment",
    group: "ethics",
    en: "Risk assessment",
    ar: "تقييم المخاطر",
    helpEn:
      "Identify foreseeable risks and how they will be reduced or managed.",
    helpAr: "حدد المخاطر المتوقعة وكيف ستُخفّض أو تُدار.",
  },
  {
    key: "benefitAssessment",
    group: "ethics",
    en: "Benefit assessment",
    ar: "تقييم الفوائد",
    helpEn:
      "Describe expected benefits, including when participants receive no direct benefit.",
    helpAr: "صف الفوائد المتوقعة، ووضّح إن لم تكن هناك فائدة مباشرة للمشاركين.",
  },
  {
    key: "confidentialityMeasures",
    group: "ethics",
    en: "Confidentiality measures",
    ar: "إجراءات حماية السرية",
    helpEn:
      "Describe identifiers, access controls, storage, retention, and sharing arrangements.",
    helpAr:
      "صف التعامل مع المعرّفات وصلاحيات الوصول والتخزين والاحتفاظ والمشاركة.",
  },
  {
    key: "conflictOfInterest",
    group: "ethics",
    en: "Conflict of interest declaration",
    ar: "إقرار تضارب المصالح",
    helpEn:
      "Disclose relevant conflicts and funding, or explicitly state that none exist.",
    helpAr: "أفصح عن تضارب المصالح والتمويل ذي الصلة، أو صرّح بعدم وجودها.",
  },
] as const;
export const STAGE2_GROUPS = [
  { key: "design", en: "Research design", ar: "تصميم البحث" },
  {
    key: "participants",
    en: "Participants and eligibility",
    ar: "المشاركون ومعايير الاختيار",
  },
  { key: "data", en: "Data and consent", ar: "البيانات والموافقة" },
  {
    key: "ethics",
    en: "Ethics and safeguards",
    ar: "الأخلاقيات وإجراءات الحماية",
  },
] as const;
export function stage2Values(
  source: Partial<Record<Stage2Field, unknown>> = {}
): Stage2Values {
  return Object.fromEntries(
    STAGE2_KEYS.map(key => [
      key,
      typeof source[key] === "string" ? source[key] : "",
    ])
  ) as Stage2Values;
}
export function stage2FieldLabel(key: string, isAr = false): string {
  const field = STAGE2_FIELDS.find(field => field.key === key);
  return field
    ? isAr
      ? field.ar
      : field.en
    : key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
}
/** Replace canonical model keys in prose without inventing or changing recommendations. */
export function labelStage2Text(text: string, isAr = false): string {
  return STAGE2_FIELDS.reduce(
    (value, field) =>
      value.replace(
        new RegExp(`\\b${field.key}\\b`, "g"),
        isAr ? field.ar : field.en
      ),
    text
  );
}
