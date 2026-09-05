/**
 * Fillable template fields — each field has a label, input guidance,
 * an illustrative example, and blank lines for manual completion.
 */

export type TemplateField = {
  id: string;
  labelEn: string;
  labelAr: string;
  hintEn: string;
  hintAr: string;
  exampleEn: string;
  exampleAr: string;
  blankLines?: number;
};

export type TemplateSection = {
  headingEn: string;
  headingAr: string;
  fields: TemplateField[];
};

export const TEMPLATE_SECTIONS: Record<string, TemplateSection[]> = {
  "irb-application-form": [
    {
      headingEn: "1. Principal Investigator",
      headingAr: "١. الباحث الرئيسي",
      fields: [
        {
          id: "pi_name",
          labelEn: "Full name and academic title",
          labelAr: "الاسم الكامل واللقب الأكاديمي",
          hintEn:
            "Enter your legal name as on institutional records, with title (Dr., Prof.).",
          hintAr:
            "أدخل اسمك القانوني كما في سجلات المؤسسة مع اللقب (د.، أ.د.).",
          exampleEn: "[Investigator name], [verified qualifications]",
          exampleAr: "[اسم الباحث]، [المؤهلات الموثقة]",
          blankLines: 1,
        },
        {
          id: "pi_institution",
          labelEn: "Institution, department, and contact",
          labelAr: "المؤسسة والقسم وجهات الاتصال",
          hintEn:
            "Hospital/university, department, email, phone, ORCID if available.",
          hintAr: "المستشفى/الجامعة، القسم، البريد، الهاتف، ORCID إن وُجد.",
          exampleEn:
            "[Institution], [department] | investigator@example.invalid | [phone] | [verified ORCID, if available]",
          exampleAr:
            "[المؤسسة]، [القسم] | investigator@example.invalid | [الهاتف] | [ORCID موثق إن وُجد]",
          blankLines: 2,
        },
      ],
    },
    {
      headingEn: "2. Research Title and Classification",
      headingAr: "٢. عنوان البحث والتصنيف",
      fields: [
        {
          id: "research_title",
          labelEn: "Research title (English and Arabic)",
          labelAr: "عنوان البحث (بالإنجليزية والعربية)",
          hintEn:
            "Descriptive title: population, exposure/intervention, outcome.",
          hintAr: "عنوان وصفي: المجتمع، التدخل/التعرض، النتيجة.",
          exampleEn:
            "Prevalence of Clinician Burnout in Tertiary Hospitals in Riyadh: A Cross-Sectional Survey (2026)",
          exampleAr:
            "انتشار إرهاق الممارسين في مستشفيات الرعاية الثالثية بالرياض: دراسة مقطعية (2026)",
          blankLines: 2,
        },
        {
          id: "research_type",
          labelEn: "Research type and IRB category",
          labelAr: "نوع البحث وفئة IRB",
          hintEn:
            "Type (clinical trial, survey, etc.) and IRB track (exempt / expedited / full board).",
          hintAr:
            "النوع (تجربة سريرية، استبيان، إلخ) ومسار IRB (معفى / مبسَّط / لجنة كاملة).",
          exampleEn:
            "Type: Survey-questionnaire | IRB: Full board | Duration: 12 months",
          exampleAr: "النوع: استبيان | IRB: لجنة كاملة | المدة: 12 شهراً",
          blankLines: 1,
        },
      ],
    },
    {
      headingEn: "3. Background and Objectives",
      headingAr: "٣. الخلفية والأهداف",
      fields: [
        {
          id: "objectives",
          labelEn: "Background, aims, and hypotheses",
          labelAr: "الخلفية والأهداف والفرضيات",
          hintEn:
            "Background, numbered objectives, testable hypotheses if applicable.",
          hintAr: "خلفية، أهداف مرقمة، فرضيات قابلة للاختبار إن وُجدت.",
          exampleEn:
            "Primary aim: Estimate burnout prevalence. Hypothesis: Night-shift frequency correlates with burnout score.",
          exampleAr:
            "الهدف الأول: تقدير انتشار الإرهاق. الفرضية: تكرار المناوبات الليلية يرتبط بدرجة الإرهاق.",
          blankLines: 4,
        },
      ],
    },
    {
      headingEn: "4. Co-investigators",
      headingAr: "٤. الباحثون المشاركون",
      fields: [
        {
          id: "co_investigators",
          labelEn: "Co-investigator list",
          labelAr: "قائمة الباحثين المشاركين",
          hintEn:
            'Name, role, institution, email for each. If none, write "None — sole investigator."',
          hintAr:
            "الاسم، الدور، المؤسسة، البريد لكل باحث. إن لم يوجد: «لا يوجد — باحث واحد».",
          exampleEn:
            "[Co-investigator name] | [role] | [institution] | collaborator@example.invalid",
          exampleAr:
            "[اسم الباحث المشارك] | [الدور] | [المؤسسة] | collaborator@example.invalid",
          blankLines: 3,
        },
      ],
    },
    {
      headingEn: "5. Ethics Declaration",
      headingAr: "٥. إعلان الأخلاقيات",
      fields: [
        {
          id: "ethics_declaration",
          labelEn: "Signed ethics declaration",
          labelAr: "إعلان الأخلاقيات الموقَّع",
          hintEn: "Declaration text with signature and date lines.",
          hintAr: "نص الإعلان مع خطوط التوقيع والتاريخ.",
          exampleEn:
            "I declare all information is truthful. I will conduct research per NCBE and Helsinki.\nSignature: _________________ Date: __________",
          exampleAr:
            "أُقرّ أن المعلومات صحيحة. سأُجري البحث وفق NCBE وهلسنكي.\nالتوقيع: _________________ التاريخ: __________",
          blankLines: 2,
        },
      ],
    },
  ],

  "informed-consent": [
    {
      headingEn: "Study Identification",
      headingAr: "تعريف الدراسة",
      fields: [
        {
          id: "study_title",
          labelEn: "Study title and PI contact",
          labelAr: "عنوان الدراسة وجهة اتصال الباحث",
          hintEn:
            "Plain-language title and PI email/phone for participant questions.",
          hintAr: "عنوان بلغة بسيطة وبريد/هاتف الباحث الرئيسي.",
          exampleEn:
            "[Study title] | PI: [investigator name] | investigator@example.invalid",
          exampleAr:
            "[عنوان الدراسة] | الباحث: [اسم الباحث] | investigator@example.invalid",
          blankLines: 2,
        },
      ],
    },
    {
      headingEn: "Purpose of the Study",
      headingAr: "الغرض من الدراسة",
      fields: [
        {
          id: "purpose",
          labelEn: "Why this study is being done",
          labelAr: "لماذا تُجرى هذه الدراسة",
          hintEn: "Simple language — what the study hopes to learn.",
          hintAr: "لغة بسيطة — ما الذي تسعى الدراسة لمعرفته.",
          exampleEn:
            "We study how common burnout is among hospital doctors to help design better support programs.",
          exampleAr:
            "ندرس شيوع الإرهاق بين أطباء المستشفيات لمساعدة تصميم برامج دعم أفضل.",
          blankLines: 3,
        },
      ],
    },
    {
      headingEn: "What Participation Involves",
      headingAr: "ما تنطوي عليه المشاركة",
      fields: [
        {
          id: "participation",
          labelEn: "Procedures and time commitment",
          labelAr: "الإجراءات والوقت المطلوب",
          hintEn: "Every step: surveys, visits, samples, duration.",
          hintAr: "كل خطوة: استبيانات، زيارات، عينات، المدة.",
          exampleEn:
            "One online questionnaire (~15 min). No clinic visits. Single session.",
          exampleAr:
            "استبيان إلكتروني واحد (~15 دقيقة). لا زيارات. جلسة واحدة.",
          blankLines: 3,
        },
      ],
    },
    {
      headingEn: "Risks and Benefits",
      headingAr: "المخاطر والفوائد",
      fields: [
        {
          id: "risks",
          labelEn: "Foreseeable risks",
          labelAr: "المخاطر المتوقعة",
          hintEn: "Physical, psychological, social risks — be honest.",
          hintAr: "مخاطر جسدية ونفسية واجتماعية — بصدق.",
          exampleEn:
            "Minimal risk. Mild discomfort from stress-related questions. No physical procedures.",
          exampleAr:
            "مخاطر ضئيلة. انزعاج طفيف من أسئلة التوتر. لا إجراءات جسدية.",
          blankLines: 2,
        },
        {
          id: "benefits",
          labelEn: "Potential benefits",
          labelAr: "الفوائد المحتملة",
          hintEn: "Direct and societal benefits — no overpromising.",
          hintAr: "فوائد مباشرة ومجتمعية — دون مبالغة.",
          exampleEn:
            "No direct benefit. Society may gain from improved clinician support policies.",
          exampleAr: "لا فائدة مباشرة. قد يستفيد المجتمع من سياسات دعم أفضل.",
          blankLines: 2,
        },
      ],
    },
    {
      headingEn: "Confidentiality",
      headingAr: "السرية",
      fields: [
        {
          id: "confidentiality",
          labelEn: "Data protection measures",
          labelAr: "إجراءات حماية البيانات",
          hintEn:
            "Specify storage, access, identifiers and the institution-reviewed retention/transfer plan.",
          hintAr:
            "حدد التخزين والوصول والمعرّفات وخطة الاحتفاظ ونقل البيانات التي راجعتها المؤسسة.",
          exampleEn:
            "[Approved storage and access controls]. Retention: [period and approved basis]. [Deletion or anonymisation plan].",
          exampleAr:
            "[التخزين وضوابط الوصول المعتمدة]. الاحتفاظ: [المدة والأساس المعتمد]. [خطة الحذف أو إخفاء الهوية].",
          blankLines: 3,
        },
      ],
    },
    {
      headingEn: "Questions and Participant Rights",
      headingAr: "الاستفسارات وحقوق المشاركين",
      fields: [
        {
          id: "participant_contacts",
          labelEn: "Study questions, rights and complaints contacts",
          labelAr: "جهات الاتصال للاستفسارات والحقوق والشكاوى",
          hintEn:
            "Provide verified PI and independent committee contacts; add an urgent contact if required by the study.",
          hintAr:
            "أضف جهات اتصال موثقة للباحث وللجنة المستقلة، وجهة اتصال عاجلة إذا تطلبتها الدراسة.",
          exampleEn:
            "Study: [verified contact] | Rights/complaints: [independent committee contact]",
          exampleAr:
            "الدراسة: [جهة اتصال موثقة] | الحقوق والشكاوى: [جهة اتصال اللجنة المستقلة]",
          blankLines: 2,
        },
      ],
    },
    {
      headingEn: "Voluntary Participation & Consent",
      headingAr: "المشاركة الطوعية والموافقة",
      fields: [
        {
          id: "voluntary",
          labelEn: "Right to withdraw",
          labelAr: "حق الانسحاب",
          hintEn: "Voluntary participation, no penalty for withdrawal.",
          hintAr: "مشاركة طوعية، لا عقوبة على الانسحاب.",
          exampleEn:
            "Participation is voluntary. You may stop anytime without affecting employment or care.",
          exampleAr:
            "المشاركة طوعية. يمكنك التوقف في أي وقت دون التأثير على العمل أو الرعاية.",
          blankLines: 2,
        },
        {
          id: "consent_signature",
          labelEn: "Consent signature block",
          labelAr: "قسم توقيع الموافقة",
          hintEn: "Consent statement with signature, name, date lines.",
          hintAr: "بيان موافقة مع خطوط التوقيع والاسم والتاريخ.",
          exampleEn:
            "I voluntarily agree to participate.\nParticipant: _________________ Signature: __________ Date: __________",
          exampleAr:
            "أوافق طوعاً على المشاركة.\nالمشارك: _________________ التوقيع: __________ التاريخ: __________",
          blankLines: 3,
        },
      ],
    },
  ],

  "research-protocol": [
    {
      headingEn: "1. Background and Rationale",
      headingAr: "١. الخلفية والأساس المنطقي",
      fields: [
        {
          id: "background",
          labelEn: "Literature gap and justification",
          labelAr: "الفجوة في الأدبيات والتبرير",
          hintEn: "Prior work, gap, why needed now in KSA.",
          hintAr: "الأعمال السابقة، الفجوة، ولماذا مطلوبة الآن في المملكة.",
          exampleEn:
            "[Cited evidence] identifies [research gap]. This study examines [objective] using [appropriate instrument and version].",
          exampleAr:
            "توضح [الأدلة الموثقة] وجود [فجوة بحثية]. تدرس هذه الدراسة [الهدف] باستخدام [الأداة المناسبة وإصدارها].",
          blankLines: 4,
        },
      ],
    },
    {
      headingEn: "2. Objectives and Hypotheses",
      headingAr: "٢. الأهداف والفرضيات",
      fields: [
        {
          id: "objectives",
          labelEn: "Primary and secondary objectives",
          labelAr: "الأهداف الأساسية والثانوية",
          hintEn: "Numbered SMART objectives.",
          hintAr: "أهداف SMART مرقمة.",
          exampleEn:
            "Primary: Burnout prevalence among physicians (n=400). Secondary: Top predictors via regression.",
          exampleAr:
            "أولي: انتشار الإرهاق بين الأطباء (n=400). ثانوي: أهم العوامل بالانحدار.",
          blankLines: 3,
        },
      ],
    },
    {
      headingEn: "3. Methodology",
      headingAr: "٣. المنهجية",
      fields: [
        {
          id: "methodology",
          labelEn: "Design, population, sample size",
          labelAr: "التصميم والمجتمع وحجم العينة",
          hintEn:
            "Design, inclusion/exclusion, sample size with CI and margin.",
          hintAr: "التصميم، الإدراج/الاستبعاد، حجم العينة مع الثقة والهامش.",
          exampleEn:
            "Cross-sectional, n=400 (95% CI, 5% margin, 10% non-response). Licensed physicians ≥1yr.",
          exampleAr:
            "مقطعية، n=400 (95% CI، هامش 5%، 10% عدم استجابة). أطباء مرخصون ≥1 سنة.",
          blankLines: 5,
        },
      ],
    },
    {
      headingEn: "4. Data Collection and Management",
      headingAr: "٤. جمع البيانات وإدارتها",
      fields: [
        {
          id: "data_collection",
          labelEn: "Instruments and retention",
          labelAr: "الأدوات والاحتفاظ",
          hintEn: "Validated instruments, encryption, retention plan.",
          hintAr: "أدوات معتمدة، تشفير، خطة احتفاظ.",
          exampleEn:
            "[Approved collection system]. [Verified encryption and access controls]. Retention: [approved period and basis]; [disposal plan].",
          exampleAr:
            "[نظام الجمع المعتمد]. [التشفير وضوابط الوصول الموثقة]. الاحتفاظ: [المدة والأساس المعتمد]؛ [خطة الإتلاف].",
          blankLines: 4,
        },
      ],
    },
    {
      headingEn: "5. Statistical Analysis",
      headingAr: "٥. التحليل الإحصائي",
      fields: [
        {
          id: "statistics",
          labelEn: "Planned analyses",
          labelAr: "التحليلات المخططة",
          hintEn: "Primary/secondary methods, missing data, software.",
          hintAr: "طرق أولية/ثانوية، بيانات مفقودة، البرامج.",
          exampleEn: "Prevalence with 95% CI. Logistic regression. R 4.4.",
          exampleAr: "انتشار مع 95% CI. انحدار لوجستي. R 4.4.",
          blankLines: 3,
        },
      ],
    },
    {
      headingEn: "6. Ethical Considerations",
      headingAr: "٦. الاعتبارات الأخلاقية",
      fields: [
        {
          id: "ethics",
          labelEn: "Risk-benefit and consent",
          labelAr: "المخاطر/الفوائد والموافقة",
          hintEn: "Risk-benefit balance, consent process, COI.",
          hintAr: "توازن المخاطر/الفوائد، الموافقة، تضارب المصالح.",
          exampleEn: "Minimal risk. Electronic consent. No financial COI.",
          exampleAr: "مخاطر ضئيلة. موافقة إلكترونية. لا تضارب مالي.",
          blankLines: 4,
        },
      ],
    },
    {
      headingEn: "7. Timeline and Budget",
      headingAr: "٧. الجدول الزمني والميزانية",
      fields: [
        {
          id: "timeline",
          labelEn: "Milestones and funding",
          labelAr: "المعالم والتمويل",
          hintEn: "Month milestones and budget items.",
          hintAr: "معالم شهرية وبنود الميزانية.",
          exampleEn:
            "M1: IRB | M2–4: Recruitment | M5: Analysis | M6: Publication.",
          exampleAr: "ش1: IRB | ش2–4: التجنيد | ش5: التحليل | ش6: النشر.",
          blankLines: 3,
        },
      ],
    },
  ],

  "data-collection-instrument": [
    {
      headingEn: "Section A — Identification",
      headingAr: "القسم أ — التعريف",
      fields: [
        {
          id: "participant_code",
          labelEn: "Participant code (NOT name)",
          labelAr: "رمز المشارك (وليس الاسم)",
          hintEn: "Study code only — never full names.",
          hintAr: "رمز الدراسة فقط — لا أسماء كاملة.",
          exampleEn:
            "Code: [study code] | Site: [site code] | Date: [YYYY-MM-DD]",
          exampleAr:
            "الرمز: [رمز الدراسة] | الموقع: [رمز الموقع] | التاريخ: [السنة-الشهر-اليوم]",
          blankLines: 1,
        },
      ],
    },
    {
      headingEn: "Section B — Demographics",
      headingAr: "القسم ب — البيانات الديموغرافية",
      fields: [
        {
          id: "demographics",
          labelEn: "Age, sex, specialty, experience",
          labelAr: "العمر، الجنس، التخصص، الخبرة",
          hintEn: "Use response options / checkboxes.",
          hintAr: "استخدم خيارات إجابة / مربعات.",
          exampleEn:
            "Age: ☐ 25–34 ☐ 35–44 ☐ 45+ | Sex: ☐ M ☐ F | Years: ☐ <5 ☐ 5–10 ☐ >10",
          exampleAr:
            "العمر: ☐ 25–34 ☐ 35–44 ☐ 45+ | الجنس: ☐ ذكر ☐ أنثى | سنوات: ☐ <5 ☐ 5–10 ☐ >10",
          blankLines: 4,
        },
      ],
    },
    {
      headingEn: "Section C — Study Items",
      headingAr: "القسم ج — بنود الدراسة",
      fields: [
        {
          id: "study_items",
          labelEn: "Validated scales and questions",
          labelAr: "مقاييس معتمدة وأسئلة",
          hintEn: "Instrument name, Likert items, open questions.",
          hintAr: "اسم الأداة، بنود ليكرت، أسئلة مفتوحة.",
          exampleEn:
            "[Instrument and version]: [authorised items and response scale]. Verify licensing and language validation.",
          exampleAr:
            "[الأداة وإصدارها]: [البنود وسلم الإجابة المصرح بهما]. تحقق من الترخيص والتحقق من صلاحية النسخة اللغوية.",
          blankLines: 6,
        },
      ],
    },
    {
      headingEn: "Section D — Reliability",
      headingAr: "القسم د — الموثوقية",
      fields: [
        {
          id: "reliability",
          labelEn: "Pilot and Cronbach's alpha",
          labelAr: "التجريب وألفا كرونباخ",
          hintEn: "Pilot n, reliability coefficient, revisions.",
          hintAr: "حجم التجريب، معامل الموثوقية، التعديلات.",
          exampleEn:
            "Pilot: [planned sample]. Reliability: [appropriate measure and observed result]. Revisions: [documented changes].",
          exampleAr:
            "التجريب: [العينة المخططة]. الموثوقية: [المقياس المناسب والنتيجة الفعلية]. التعديلات: [التغييرات الموثقة].",
          blankLines: 2,
        },
      ],
    },
  ],
};

export const FORMATTABLE_SLUGS = [
  "irb-application-form",
  "informed-consent",
  "research-protocol",
  "data-collection-instrument",
] as const;

export type FormattableSlug = (typeof FORMATTABLE_SLUGS)[number];

export function getTemplateSections(
  slug: string
): TemplateSection[] | undefined {
  return TEMPLATE_SECTIONS[slug];
}

export function isFormattableSlug(slug: string): slug is FormattableSlug {
  return (FORMATTABLE_SLUGS as readonly string[]).includes(slug);
}
