/**
 * Canonical structured content for the public Resources page. Shared by
 * the SPA renderer and the server-side DOCX / PDF exporters so the
 * downloads always match what the user sees in-browser.
 *
 * Keep this list curated — items here become downloadable in two formats
 * via /api/export/resource/<slug>.<pdf|docx>. New entries need a unique
 * `slug`, EN + AR titles & descriptions, and at least one section.
 */

export type ResourceSection = {
  headingEn: string;
  headingAr: string;
  bodyEn: string;
  bodyAr: string;
};

export type ResourceItem = {
  slug: string;
  category: "template" | "guideline";
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  sections: ResourceSection[];
};

export const RESOURCES: ResourceItem[] = [
  {
    slug: "irb-application-form",
    category: "template",
    titleEn: "IRB Application Form Template",
    titleAr: "نموذج طلب IRB",
    descEn:
      "Draft application worksheet covering investigator information, research classification and ethics declarations. Confirm institution-specific submission requirements.",
    descAr:
      "ورقة عمل لإعداد الطلب تشمل بيانات الباحث وتصنيف البحث وإقرار الأخلاقيات. تحقق من متطلبات التقديم الخاصة بالمؤسسة.",
    sections: [
      {
        headingEn: "1. Principal Investigator",
        headingAr: "١. الباحث الرئيسي",
        bodyEn:
          "Full name, academic title, institution, department, ORCID (if available), email, and phone. Co-investigators listed in section 4.",
        bodyAr:
          "الاسم الكامل، اللقب الأكاديمي، المؤسسة، القسم، ORCID (إن وُجد)، البريد الإلكتروني، رقم الهاتف. الباحثون المشاركون في القسم ٤.",
      },
      {
        headingEn: "2. Research Title and Type",
        headingAr: "٢. عنوان البحث ونوعه",
        bodyEn:
          "Research title (English and Arabic). Type: clinical trial / observational / retrospective / survey-questionnaire / case study / educational / quality-improvement / systematic-review. IRB category: exempt / expedited / full-board.",
        bodyAr:
          "عنوان البحث (بالعربية والإنجليزية). النوع: تجربة سريرية / رصدية / بأثر رجعي / استبيان / حالة دراسية / تعليمي / تحسين الجودة / مراجعة منهجية. فئة IRB: معفى / مبسَّط / لجنة كاملة.",
      },
      {
        headingEn: "3. Study Background and Objectives",
        headingAr: "٣. خلفية الدراسة وأهدافها",
        bodyEn:
          "Brief background. Specific aims. Primary and secondary objectives. Hypotheses (if applicable).",
        bodyAr:
          "خلفية موجزة. الأهداف المحددة. الأهداف الأولية والثانوية. الفرضيات (إن وُجدت).",
      },
      {
        headingEn: "4. Co-investigators and Collaborators",
        headingAr: "٤. الباحثون المشاركون والمتعاونون",
        bodyEn:
          "Name, role, institution, ORCID, contact email for each co-investigator. List any external collaborators and their data-access scope.",
        bodyAr:
          "الاسم، الدور، المؤسسة، ORCID، البريد الإلكتروني لكل باحث مشارك. اذكر أي متعاونين خارجيين ونطاق وصولهم إلى البيانات.",
      },
      {
        headingEn: "5. Ethics Declaration",
        headingAr: "٥. إعلان الأخلاقيات",
        bodyEn:
          "I declare that the information submitted is truthful and complete to the best of my knowledge, and that I will conduct the research in accordance with NCBE guidelines, the Declaration of Helsinki, and applicable Saudi laws.",
        bodyAr:
          "أُقرّ أن المعلومات المقدمة صحيحة وكاملة على حد علمي، وأن البحث سيُجرى وفقًا لإرشادات NCBE وإعلان هلسنكي والأنظمة السعودية المعمول بها.",
      },
    ],
  },
  {
    slug: "informed-consent",
    category: "template",
    titleEn: "Informed Consent Form Template",
    titleAr: "نموذج الموافقة المستنيرة",
    descEn:
      "Draft template for preparing participant informed consent materials for review by the responsible committee.",
    descAr:
      "مسودة لإعداد مواد الموافقة المستنيرة للمشاركين لمراجعتها من اللجنة المختصة.",
    sections: [
      {
        headingEn: "Purpose of the Study",
        headingAr: "الغرض من الدراسة",
        bodyEn:
          "Plain-language explanation of why the study is being conducted and what question it is trying to answer.",
        bodyAr:
          "شرح بلغة بسيطة لسبب إجراء الدراسة والسؤال الذي تحاول الإجابة عنه.",
      },
      {
        headingEn: "What Participation Involves",
        headingAr: "ما تنطوي عليه المشاركة",
        bodyEn:
          "Visits, interventions, questionnaires, samples collected, expected time commitment, and duration of the study.",
        bodyAr:
          "الزيارات، التدخلات، الاستبيانات، العينات المُجمَّعة، الوقت المتوقع، ومدة الدراسة.",
      },
      {
        headingEn: "Risks and Benefits",
        headingAr: "المخاطر والفوائد",
        bodyEn:
          "All foreseeable risks (physical, psychological, social, economic) and a realistic statement of personal and societal benefits — no overstatement.",
        bodyAr:
          "جميع المخاطر المتوقعة (الجسدية، النفسية، الاجتماعية، الاقتصادية) وبيان واقعي للفوائد الشخصية والمجتمعية دون مبالغة.",
      },
      {
        headingEn: "Confidentiality",
        headingAr: "السرية",
        bodyEn:
          "How data and samples will be stored, who can access them, retention period, and whether identifiers will be removed.",
        bodyAr:
          "كيف ستُخزَّن البيانات والعينات، من يستطيع الوصول إليها، فترة الاحتفاظ، وهل ستُزال المعرّفات.",
      },
      {
        headingEn: "Voluntary Participation",
        headingAr: "المشاركة الطوعية",
        bodyEn:
          "Participation is voluntary. Refusal or withdrawal at any time will not affect care, employment, or other entitlements.",
        bodyAr:
          "المشاركة طوعية. الرفض أو الانسحاب في أي وقت لن يؤثر على الرعاية أو العمل أو أي حقوق أخرى.",
      },
      {
        headingEn: "Contacts",
        headingAr: "جهات الاتصال",
        bodyEn:
          "PI contact for study questions; IRB chair contact for rights / complaints; 24-hour line for adverse events when applicable.",
        bodyAr:
          "جهة اتصال الباحث الرئيسي لأسئلة الدراسة؛ جهة اتصال رئيس IRB للحقوق/الشكاوى؛ خط على مدار ٢٤ ساعة للأحداث الضارة عند الحاجة.",
      },
      {
        headingEn: "Consent Statement",
        headingAr: "بيان الموافقة",
        bodyEn:
          "I have read and understood this form. I have had the opportunity to ask questions. I voluntarily agree to participate.\n\nParticipant name: ____________________ Signature: __________ Date: __________",
        bodyAr:
          "لقد قرأت هذا النموذج وفهمته. أُتيحت لي الفرصة لطرح الأسئلة. أوافق طوعًا على المشاركة.\n\nاسم المشارك: ____________________ التوقيع: __________ التاريخ: __________",
      },
    ],
  },
  {
    slug: "research-protocol",
    category: "template",
    titleEn: "Research Protocol Template",
    titleAr: "نموذج بروتوكول البحث",
    descEn:
      "Structured template for writing your research protocol, covering objectives, methodology, ethics, and data management.",
    descAr:
      "نموذج منظم لكتابة بروتوكول البحث الخاص بك، يغطي الأهداف والمنهجية والأخلاقيات وإدارة البيانات.",
    sections: [
      {
        headingEn: "1. Background and Rationale",
        headingAr: "١. الخلفية والأساس المنطقي",
        bodyEn: "Literature review, gap, and justification for the study.",
        bodyAr: "مراجعة الأدبيات، الفجوة البحثية، وتبرير الدراسة.",
      },
      {
        headingEn: "2. Objectives and Hypotheses",
        headingAr: "٢. الأهداف والفرضيات",
        bodyEn:
          "Primary and secondary objectives. State each hypothesis in measurable terms.",
        bodyAr: "الأهداف الأولية والثانوية. اذكر كل فرضية بشكل قابل للقياس.",
      },
      {
        headingEn: "3. Methodology",
        headingAr: "٣. المنهجية",
        bodyEn:
          "Study design. Setting. Population. Inclusion / exclusion. Sampling plan and sample size justification (with confidence level + margin of error). Interventions. Outcomes and measurements.",
        bodyAr:
          "تصميم الدراسة. الإطار. المجتمع. معايير الإدراج/الاستبعاد. خطة العينة وتبرير الحجم (بمستوى الثقة وهامش الخطأ). التدخلات. النتائج والقياسات.",
      },
      {
        headingEn: "4. Data Collection and Management",
        headingAr: "٤. جمع البيانات وإدارتها",
        bodyEn:
          "Sources, instruments, data flow, storage location, encryption, retention, and erasure plan.",
        bodyAr:
          "المصادر، الأدوات، تدفق البيانات، موقع التخزين، التشفير، فترة الاحتفاظ، وخطة الحذف.",
      },
      {
        headingEn: "5. Statistical Analysis",
        headingAr: "٥. التحليل الإحصائي",
        bodyEn:
          "Planned analyses for each objective, software, and how missing / outlier data will be handled.",
        bodyAr:
          "التحليلات المخطط لها لكل هدف، البرامج، وكيفية التعامل مع البيانات المفقودة/الشاذة.",
      },
      {
        headingEn: "6. Ethical Considerations",
        headingAr: "٦. الاعتبارات الأخلاقية",
        bodyEn:
          "Risk-benefit balance, consent process, confidentiality safeguards, data-protection, conflict-of-interest declaration, and dissemination of results to participants where applicable.",
        bodyAr:
          "ميزان المخاطر/الفوائد، عملية الموافقة، إجراءات السرية، حماية البيانات، إعلان تضارب المصالح، ونشر النتائج للمشاركين عند الاقتضاء.",
      },
      {
        headingEn: "7. Timeline and Budget",
        headingAr: "٧. الجدول الزمني والميزانية",
        bodyEn:
          "Milestones from kick-off to publication. Funding source and budget itemisation.",
        bodyAr: "المعالم من البداية حتى النشر. مصدر التمويل وبنود الميزانية.",
      },
    ],
  },
  {
    slug: "nbce-ethics-summary",
    category: "guideline",
    titleEn: "NCBE Ethics Guidelines Summary",
    titleAr: "ملخص إرشادات NCBE الأخلاقية",
    descEn:
      "Educational overview of research ethics topics for Saudi Arabia. Check current official requirements and the responsible committee policies.",
    descAr:
      "نظرة تعليمية على موضوعات أخلاقيات البحث في السعودية. تحقق من المتطلبات الرسمية الحالية وسياسات اللجنة المختصة.",
    sections: [
      {
        headingEn: "Core Principles",
        headingAr: "المبادئ الأساسية",
        bodyEn:
          "Respect for persons, beneficence, non-maleficence, justice and integrity. Obtain the responsible committee determination and any required authorization before starting research or recruitment.",
        bodyAr:
          "احترام الأشخاص وتحقيق المنفعة وعدم الإضرار والعدالة والنزاهة. احصل على قرار اللجنة المختصة والتصاريح اللازمة قبل بدء البحث أو تجنيد المشاركين.",
      },
      {
        headingEn: "Informed Consent",
        headingAr: "الموافقة المستنيرة",
        bodyEn:
          "Use a committee-reviewed consent process in language participants understand, without coercion, explaining relevant risks, benefits and withdrawal. Any waiver or alteration needs the applicable documented determination; this overview does not grant one.",
        bodyAr:
          "استخدم عملية موافقة راجعتها اللجنة بلغة يفهمها المشاركون، دون إكراه، مع توضيح المخاطر والفوائد والانسحاب. يتطلب أي إعفاء أو تعديل القرار الموثق اللازم؛ لا تمنح هذه النظرة التعليمية إعفاءً.",
      },
      {
        headingEn: "Privacy and Data Protection",
        headingAr: "الخصوصية وحماية البيانات",
        bodyEn:
          "Document the data collected, lawful processing basis, storage and transfer locations, access, retention and deletion. Have the institutional privacy lead review applicable PDPL and other requirements; this overview does not determine compliance or a universal retention period.",
        bodyAr:
          "وثق البيانات المجمعة وأساس معالجتها ومواقع تخزينها ونقلها والوصول إليها والاحتفاظ بها وحذفها. اطلب مراجعة مسؤول الخصوصية بالمؤسسة لمتطلبات PDPL وغيرها من المتطلبات المنطبقة؛ لا تحدد هذه النظرة التعليمية الامتثال أو مدة احتفاظ موحدة.",
      },
      {
        headingEn: "Adverse Events and Amendments",
        headingAr: "الأحداث الضارة والتعديلات",
        bodyEn:
          "Record the applicable committee, sponsor and regulatory reporting routes and deadlines before the study begins. Submit protocol changes for the required review; follow the approved policy for urgent participant-protection measures.",
        bodyAr:
          "حدد مسارات الإبلاغ ومواعيده المنطبقة لدى اللجنة والراعي والجهة التنظيمية قبل بدء الدراسة. قدم تعديلات البروتوكول للمراجعة اللازمة، واتبع السياسة المعتمدة للتدابير العاجلة لحماية المشاركين.",
      },
      {
        headingEn: "Vulnerable Populations",
        headingAr: "الفئات الهشة",
        bodyEn:
          "Additional safeguards apply to minors, pregnant women, prisoners, employees, and patients in critical care. Justify why inclusion is necessary and what extra protections are in place.",
        bodyAr:
          "تطبَّق ضمانات إضافية على القاصرين والحوامل والسجناء والموظفين والمرضى في الرعاية الحرجة. برِّر سبب الإدراج والحماية الإضافية.",
      },
    ],
  },
  {
    slug: "data-collection-instrument",
    category: "template",
    titleEn: "Data Collection Instrument Template",
    titleAr: "نموذج أداة جمع البيانات",
    descEn:
      "Template for designing questionnaires, surveys, and data collection tools with best practices and example formats.",
    descAr:
      "نموذج لتصميم الاستبيانات والمسوحات وأدوات جمع البيانات مع أفضل الممارسات وأمثلة التنسيقات.",
    sections: [
      {
        headingEn: "Identification (de-identifiable)",
        headingAr: "تعريف الحالة (قابل لإزالة المعرّفات)",
        bodyEn:
          "Participant code (NOT name). Date of data collection. Site / center code.",
        bodyAr: "رمز المشارك (وليس الاسم). تاريخ الجمع. رمز الموقع / المركز.",
      },
      {
        headingEn: "Demographics",
        headingAr: "البيانات الديموغرافية",
        bodyEn:
          "Age range. Sex. Nationality. Education level. Occupation category.",
        bodyAr: "الفئة العمرية. الجنس. الجنسية. المستوى التعليمي. فئة الوظيفة.",
      },
      {
        headingEn: "Clinical / Study-Specific Items",
        headingAr: "بنود سريرية / خاصة بالدراسة",
        bodyEn:
          "Use validated instruments where available (PHQ-9, EQ-5D, etc.). Mix item types — multiple-choice, Likert, free-text — to balance precision and depth.",
        bodyAr:
          "استخدم الأدوات المُعتمَدة عند توفُّرها (PHQ-9, EQ-5D…). تنوَّع بين أنواع الأسئلة — اختيار من متعدد، ليكرت، مفتوحة — للموازنة بين الدقة والعمق.",
      },
      {
        headingEn: "Reliability Notes",
        headingAr: "ملاحظات الموثوقية",
        bodyEn:
          "Plan a justified pilot appropriate to the instrument and population. Document the observed results and an appropriate reliability assessment; do not copy example statistics into a study record.",
        bodyAr:
          "خطط لتجريب مبرر يناسب الأداة والمجتمع. وثق النتائج الفعلية وتقييم الموثوقية المناسب؛ لا تنسخ إحصاءات الأمثلة إلى سجل الدراسة.",
      },
    ],
  },
];

export function getResourceBySlug(slug: string): ResourceItem | undefined {
  return RESOURCES.find(r => r.slug === slug);
}
