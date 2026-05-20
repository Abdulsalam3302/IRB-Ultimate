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
      "Complete application form template with all sections required for IRB submission, including PI information, research classification, and ethics declaration.",
    descAr:
      "نموذج طلب كامل يتضمن جميع الأقسام المطلوبة لتقديم IRB، بما في ذلك معلومات الباحث الرئيسي وتصنيف البحث وإعلان الأخلاقيات.",
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
          "I declare that the information submitted is truthful and complete to the best of my knowledge, and that I will conduct the research in accordance with NBCE guidelines, the Declaration of Helsinki, and applicable Saudi laws.",
        bodyAr:
          "أُقرّ أن المعلومات المقدمة صحيحة وكاملة على حد علمي، وأن البحث سيُجرى وفقًا لإرشادات NBCE وإعلان هلسنكي والأنظمة السعودية المعمول بها.",
      },
    ],
  },
  {
    slug: "informed-consent",
    category: "template",
    titleEn: "Informed Consent Form Template",
    titleAr: "نموذج الموافقة المستنيرة",
    descEn:
      "Template for creating participant informed consent forms compliant with Saudi regulations and NBCE guidelines.",
    descAr:
      "نموذج لإنشاء نماذج الموافقة المستنيرة للمشاركين متوافقة مع اللوائح السعودية وإرشادات NBCE.",
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
        bodyEn: "Primary and secondary objectives. State each hypothesis in measurable terms.",
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
        bodyAr: "المصادر، الأدوات، تدفق البيانات، موقع التخزين، التشفير، فترة الاحتفاظ، وخطة الحذف.",
      },
      {
        headingEn: "5. Statistical Analysis",
        headingAr: "٥. التحليل الإحصائي",
        bodyEn:
          "Planned analyses for each objective, software, and how missing / outlier data will be handled.",
        bodyAr: "التحليلات المخطط لها لكل هدف، البرامج، وكيفية التعامل مع البيانات المفقودة/الشاذة.",
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
        bodyEn: "Milestones from kick-off to publication. Funding source and budget itemisation.",
        bodyAr: "المعالم من البداية حتى النشر. مصدر التمويل وبنود الميزانية.",
      },
    ],
  },
  {
    slug: "nbce-ethics-summary",
    category: "guideline",
    titleEn: "NBCE Ethics Guidelines Summary",
    titleAr: "ملخص إرشادات NBCE الأخلاقية",
    descEn:
      "Key principles and requirements for ethical research in Saudi Arabia, including informed consent, privacy, and Vision 2030 alignment.",
    descAr:
      "المبادئ والمتطلبات الرئيسية للبحث الأخلاقي في المملكة العربية السعودية، بما في ذلك الموافقة المستنيرة والخصوصية والتوافق مع رؤية 2030.",
    sections: [
      {
        headingEn: "Core Principles",
        headingAr: "المبادئ الأساسية",
        bodyEn:
          "Respect for persons, beneficence, non-maleficence, justice, and integrity. All studies on human subjects must be approved by a registered IRB before recruitment begins.",
        bodyAr:
          "احترام الأشخاص، تحقيق المنفعة، عدم الإضرار، العدالة، والنزاهة. يجب اعتماد كل الدراسات التي تشمل البشر من قبل IRB مسجَّل قبل بدء التجنيد.",
      },
      {
        headingEn: "Informed Consent",
        headingAr: "الموافقة المستنيرة",
        bodyEn:
          "Written consent in the participant's preferred language, free of coercion, with mandatory disclosure of risks, benefits, and the right to withdraw.",
        bodyAr:
          "موافقة كتابية باللغة المفضلة للمشارك، دون إكراه، مع الإفصاح الإلزامي عن المخاطر والفوائد وحق الانسحاب.",
      },
      {
        headingEn: "Privacy and Data Protection",
        headingAr: "الخصوصية وحماية البيانات",
        bodyEn:
          "Compliance with PDPL (Personal Data Protection Law) and NDMO data-classification rules. Sensitive personal data — including health data — should be stored inside KSA unless an explicit cross-border transfer authorisation exists.",
        bodyAr:
          "الامتثال لنظام حماية البيانات الشخصية (PDPL) وقواعد تصنيف البيانات من NDMO. البيانات الشخصية الحساسة — بما فيها البيانات الصحية — يجب أن تُخزَّن داخل المملكة ما لم يوجد تصريح صريح للنقل عبر الحدود.",
      },
      {
        headingEn: "Adverse Events and Amendments",
        headingAr: "الأحداث الضارة والتعديلات",
        bodyEn:
          "Serious adverse events must be reported within 7 days. Any protocol change that affects risk-benefit must be filed as an amendment and approved before implementation.",
        bodyAr:
          "يجب الإبلاغ عن الأحداث الضارة الجسيمة خلال ٧ أيام. أي تغيير على البروتوكول يؤثر على ميزان المخاطر/الفوائد يجب تقديمه كتعديل واعتماده قبل التنفيذ.",
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
        bodyEn: "Participant code (NOT name). Date of data collection. Site / center code.",
        bodyAr: "رمز المشارك (وليس الاسم). تاريخ الجمع. رمز الموقع / المركز.",
      },
      {
        headingEn: "Demographics",
        headingAr: "البيانات الديموغرافية",
        bodyEn: "Age range. Sex. Nationality. Education level. Occupation category.",
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
          "Pilot-test on 10–30 participants before launch. Report Cronbach's alpha or test-retest reliability for multi-item scales.",
        bodyAr:
          "اختبر تجريبيًا على ١٠–٣٠ مشاركًا قبل الإطلاق. أبلغ عن ألفا كرونباخ أو موثوقية الاختبار-إعادة الاختبار للمقاييس متعددة البنود.",
      },
    ],
  },
];

export function getResourceBySlug(slug: string): ResourceItem | undefined {
  return RESOURCES.find(r => r.slug === slug);
}
