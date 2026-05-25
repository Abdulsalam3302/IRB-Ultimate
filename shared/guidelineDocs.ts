export type GuidelineSection = {
  titleEn: string;
  titleAr: string;
  bodyEn: string[];
  bodyAr: string[];
};

export type GuidelineDoc = {
  slug: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  sections: GuidelineSection[];
};

export const GUIDELINE_DOCS: GuidelineDoc[] = [
  {
    slug: "nbce-ethical-guidelines",
    titleEn: "NBCE Ethical Guidelines for Research",
    titleAr: "الإرشادات الأخلاقية للجنة الوطنية للأخلاقيات الحيوية",
    descEn: "Core principles for ethical human-subjects research in Saudi Arabia.",
    descAr: "المبادئ الأساسية للبحث الأخلاقي على البشر في المملكة العربية السعودية.",
    sections: [
      {
        titleEn: "Scope and Authority",
        titleAr: "النطاق والسلطة",
        bodyEn: [
          "The National Bioethics Committee of Saudi Arabia (NBCE) establishes the national framework for ethical review of research involving humans, their data, or biological materials.",
          "All institutions conducting research in the Kingdom must ensure IRB review aligns with NBCE regulations before research begins.",
        ],
        bodyAr: [
          "تضع اللجنة الوطنية للأخلاقيات الحيوية في المملكة العربية السعودية (NBCE) الإطار الوطني للمراجعة الأخلاقية للبحوث التي تشمل البشر أو بياناتهم أو موادهم البيولوجية.",
          "يجب على جميع المؤسسات التي تجري بحوثاً في المملكة ضمان توافق مراجعة IRB مع لوائح NBCE قبل بدء البحث.",
        ],
      },
      {
        titleEn: "Core Ethical Principles",
        titleAr: "المبادئ الأخلاقية الأساسية",
        bodyEn: [
          "Respect for persons: voluntary participation, adequate information, and capacity to consent.",
          "Beneficence: maximize anticipated benefits and minimize foreseeable harms.",
          "Justice: equitable selection of subjects and fair distribution of research burdens and benefits.",
          "Scientific validity: research must be methodologically sound before ethical approval is meaningful.",
        ],
        bodyAr: [
          "احترام الأشخاص: المشاركة الطوعية، وتوفير معلومات كافية، والقدرة على الموافقة.",
          "الإ beneficence: تعظيم الفوائد المتوقعة وتقليل الأضرار المتوقعة.",
          "العدالة: اختيار عادل للمشاركين وتوزيع عادل لأعباء وفوائد البحث.",
          "الصلاحية العلمية: يجب أن يكون البحث سليماً منهجياً قبل أن تكون الموافقة الأخلاقية ذات معنى.",
        ],
      },
      {
        titleEn: "Informed Consent",
        titleAr: "الموافقة المستنيرة",
        bodyEn: [
          "Consent must be documented unless a waiver is ethically justified and IRB-approved.",
          "Information must be presented in language understandable to participants, including purpose, procedures, risks, benefits, alternatives, confidentiality, and right to withdraw without penalty.",
          "Vulnerable populations require additional safeguards, including assent procedures for minors and proxy consent where appropriate.",
        ],
        bodyAr: [
          "يجب توثيق الموافقة ما لم يُبرر إعفاء أخلاقي ووافقت عليه IRB.",
          "يجب تقديم المعلومات بلغة مفهومة للمشاركين، بما في ذلك الغرض والإجراءات والمخاطر والفوائد والبدائل والسرية وحق الانسحاب دون عقوبة.",
          "تتطلب الفئات ال vulnerable ضمانات إضافية، بما في ذلك إجراءات الموافقة للقاصرين والموافقة بالنيابة حيث يناسب.",
        ],
      },
      {
        titleEn: "Privacy and Data Protection",
        titleAr: "الخصوصية وحماية البيانات",
        bodyEn: [
          "Researchers must comply with Saudi Personal Data Protection Law (PDPL) and institutional policies.",
          "Data should be collected only for stated research purposes, stored securely, and de-identified where feasible.",
          "Cross-border data transfer requires appropriate legal basis and IRB approval.",
        ],
        bodyAr: [
          "يجب على الباحثين الامتثال لنظام حماية البيانات الشخصية السعودي (PDPL) وسياسات المؤسسة.",
          "يجب جمع البيانات فقط للأغراض البحثية المعلنة، وتخزينها بشكل آمن، وإزالة الهوية حيثما أمكن.",
          "يتطلب نقل البيانات عبر الحدود أساساً قانونياً مناسباً وموافقة IRB.",
        ],
      },
      {
        titleEn: "Risk–Benefit Assessment",
        titleAr: "تقييم المخاطر والفوائد",
        bodyEn: [
          "Applications must describe foreseeable risks, mitigation strategies, and expected benefits to participants and society.",
          "Research with greater than minimal risk requires full board review unless expedited criteria are met.",
          "Monitoring plans should be included for studies with ongoing safety concerns.",
        ],
        bodyAr: [
          "يجب أن تصف الطلبات المخاطر المتوقعة واستراتيجيات التخفيف والفوائد المتوقعة للمشاركين والمجتمع.",
          "يتطلب البحث الذي يتجاوز الحد الأدنى من المخاطر مراجعة كاملة للجنة ما لم تتحقق معايير المراجعة المسرّعة.",
          "يجب تضمين خطط المراقبة للدراسات ذات المخاطر المستمرة.",
        ],
      },
    ],
  },
  {
    slug: "declaration-of-helsinki",
    titleEn: "Declaration of Helsinki",
    titleAr: "إعلان هلسنكي",
    descEn: "World Medical Association ethical principles for medical research involving human subjects.",
    descAr: "المبادئ الأخلاقية للجمعية الطبية العالمية للبحوث الطبية على البشر.",
    sections: [
      {
        titleEn: "General Principles",
        titleAr: "المبادئ العامة",
        bodyEn: [
          "The Declaration of Helsinki provides ethical principles for medical research involving human subjects, including research on identifiable human material and data.",
          "The physician's duty is to promote and safeguard the health, well-being, and rights of patients, including those involved in medical research.",
          "Medical research must conform to generally accepted scientific principles, be based on thorough knowledge of the literature, and be conducted by scientifically qualified persons.",
        ],
        bodyAr: [
          "يقدم إعلان هلسنكي المبادئ الأخلاقية للبحوث الطبية التي تشمل البشر، بما في ذلك البحث على المواد والبيانات البشرية القابلة للتحديد.",
          "واجب الطبيب هو تعزيز وحماية صحة المرضى ورفاهيتهم وحقوقهم، بما في ذلك المشاركون في البحث الطبي.",
          "يجب أن يتوافق البحث الطبي مع المبادئ العلمية المقبولة عموماً، وأن يستند إلى معرفة شاملة بالأدبيات، وأن يُجرى بواسطة أشخاص مؤهلين علمياً.",
        ],
      },
      {
        titleEn: "Risks, Burdens, and Benefits",
        titleAr: "المخاطر والأعباء والفوائد",
        bodyEn: [
          "Appropriate research must be conducted to assess risks, burdens, and benefits.",
          "Physicians may not participate in research unless they are confident that risks have been adequately assessed and can be satisfactorily managed.",
          "The welfare of research participants takes precedence over the interests of science and society.",
        ],
        bodyAr: [
          "يجب إجراء بحث مناسب لتقييم المخاطر والأعباء والفوائد.",
          "لا يجوز للأطباء المشاركة في البحث ما لم يكونوا واثقين من أن المخاطر قد قُيّمت بشكل كافٍ ويمكن إدارتها بشكل مرضٍ.",
          "تتقدم رفاهية المشاركين في البحث على مصالح العلم والمجتمع.",
        ],
      },
      {
        titleEn: "Informed Consent",
        titleAr: "الموافقة المستنيرة",
        bodyEn: [
          "Participation in medical research must be voluntary and based on informed consent.",
          "Each potential subject must be adequately informed of aims, methods, sources of funding, conflicts of interest, institutional affiliations, anticipated benefits and risks, discomfort, and right to refuse or withdraw.",
          "Written informed consent should be obtained unless a waiver is justified and approved by an ethics committee.",
        ],
        bodyAr: [
          "يجب أن تكون المشاركة في البحث الطبي طوعية وتستند إلى موافقة مستنيرة.",
          "يجب إبلاغ كل مشارك محتمل بشكل كافٍ بالأهداف والطرق ومصادر التمويل وتضارب المصالح والانتماءات المؤسسية والفوائد والمخاطر المتوقعة وعدم الراحة وحق الرفض أو الانسحاب.",
          "يجب الحصول على موافقة مستنيرة مكتوبة ما لم يُبرر إعفاء ووافقت عليه لجنة أخلاقيات.",
        ],
      },
      {
        titleEn: "Vulnerable Groups and Publication",
        titleAr: "الفئات ال vulnerable والنشر",
        bodyEn: [
          "Groups that are unable to give consent require additional protections; research should only be conducted when it benefits the group or cannot otherwise be performed.",
          "Every research study involving human subjects must be registered in a publicly accessible database before recruitment.",
          "Authors, editors, and publishers have ethical obligations to publish research results and to minimize publication bias.",
        ],
        bodyAr: [
          "تتطلب المجموعات غير القادرة على الموافقة حماية إضافية؛ يجب إجراء البحث فقط عندما يفيد المجموعة أو لا يمكن إجراؤه بطريقة أخرى.",
          "يجب تسجيل كل دراسة بحثية تشمل البشر في قاعدة بيانات متاحة للجمهور قبل التوظيف.",
          "للمؤلفين والمحررين والناشرين التزامات أخلاقية بنشر نتائج البحث وتقليل التحيز في النشر.",
        ],
      },
    ],
  },
  {
    slug: "ich-gcp",
    titleEn: "ICH-GCP Guidelines",
    titleAr: "إرشادات ICH-GCP",
    descEn: "Good Clinical Practice standards for clinical trial design, conduct, and reporting.",
    descAr: "معايير الممارسة السريرية الجيدة لتصميم التجارب السريرية وإجرائها وإبلاغها.",
    sections: [
      {
        titleEn: "Purpose and Scope",
        titleAr: "الغرض والنطاق",
        bodyEn: [
          "ICH Good Clinical Practice (GCP) is an international ethical and scientific quality standard for designing, conducting, recording, and reporting trials involving human subjects.",
          "Compliance provides public assurance that the rights, safety, and well-being of trial subjects are protected and that trial data are credible.",
        ],
        bodyAr: [
          "تُعد الممارسة السريرية الجيدة (GCP) معياراً دولياً للجودة الأخلاقية والعلمية لتصميم التجارب وإجرائها وتسجيلها والإبلاغ عنها على البشر.",
          "يوفر الامتثال ضماناً للجمهور بأن حقوق وسلامة ورفاهية المشاركين محمية وأن بيانات التجربة موثوقة.",
        ],
      },
      {
        titleEn: "Investigator Responsibilities",
        titleAr: "مسؤوليات الباحث الرئيسي",
        bodyEn: [
          "Investigators must be qualified by education, training, and experience and must comply with the protocol, GCP, and applicable regulations.",
          "Adequate resources, including qualified staff and facilities, must be available for the duration of the trial.",
          "Investigators are responsible for obtaining and documenting informed consent and for reporting adverse events per protocol.",
        ],
        bodyAr: [
          "يجب أن يكون الباحثون مؤهلين بالتعليم والتدريب والخبرة ويجب أن يلتزموا بالبروتوكول وGCP واللوائح المعمول بها.",
          "يجب توفر موارد كافية، بما في ذلك مو staff مؤهل ومرافق، طوال مدة التجربة.",
          "الباحثون مسؤولون عن الحصول على الموافقة المستنيرة وتوثيقها والإبلاغ عن الأحداث الضارة وفق البروتوكول.",
        ],
      },
      {
        titleEn: "Protocol and Data Integrity",
        titleAr: "البروتوكول وسلامة البيانات",
        bodyEn: [
          "The protocol must be scientifically sound, clearly written, and approved by IRB/IEC before implementation.",
          "All trial data must be recorded, handled, and stored to permit accurate reporting and verification.",
          "Source documents must be retained to enable reconstruction and evaluation of the trial.",
        ],
        bodyAr: [
          "يجب أن يكون البروتوكول سليماً علمياً ومكتوباً بوضوح ومعتمداً من IRB/IEC قبل التنفيذ.",
          "يجب تسجيل جميع بيانات التجربة ومعالجتها وتخزينها للسماح بالإبلاغ والتحقق الدقيق.",
          "يجب الاحتفاظ بالوثائق المصدر لتمكين إعادة بناء التجربة وتقييمها.",
        ],
      },
      {
        titleEn: "Monitoring, Auditing, and Inspection",
        titleAr: "المراقبة والتدقيق والتفتيش",
        bodyEn: [
          "Trials should be monitored to verify compliance with protocol, GCP, and regulatory requirements.",
          "Regulatory authorities may inspect trial sites; investigators must permit access to source data and documents.",
          "Quality management systems should address protocol deviations and corrective actions.",
        ],
        bodyAr: [
          "يجب مراقبة التجارب للتحقق من الامتثال للبروتوكول وGCP والمتطلبات التنظيمية.",
          "قد ت inspect السلطات التنظيمية مواقع التجارب؛ يجب على الباحثين السماح بالوصول إلى البيانات والوثائق المصدر.",
          "يجب أن تتناول أنظمة إدارة الجودة انحرافات البروتوكول والإجراءات التصحيحية.",
        ],
      },
    ],
  },
  {
    slug: "data-privacy",
    titleEn: "Data Privacy & Confidentiality Guide",
    titleAr: "دليل خصوصية وسرية البيانات",
    descEn: "Handling participant data under Saudi PDPL and research ethics requirements.",
    descAr: "التعامل مع بيانات المشاركين وفق نظام PDPL السعودي ومتطلبات أخلاقيات البحث.",
    sections: [
      {
        titleEn: "Legal Framework",
        titleAr: "الإطار القانوني",
        bodyEn: [
          "Researchers must comply with Saudi Arabia's Personal Data Protection Law (PDPL) and institutional data governance policies.",
          "Personal data includes any information that identifies or can identify a natural person, directly or indirectly.",
          "Processing requires a lawful basis such as consent, public interest research with safeguards, or legal obligation.",
        ],
        bodyAr: [
          "يجب على الباحثين الامتثال لنظام حماية البيانات الشخصية السعودي (PDPL) وسياسات حوكمة البيانات المؤسسية.",
          "تشمل البيانات الشخصية أي معلومات تحدد أو يمكن أن تحدد شخصاً طبيعياً، بشكل مباشر أو غير مباشر.",
          "يتطلب المعالجة أساساً قانونياً مثل الموافقة، أو البحث ذي المصلحة العامة مع ضمانات، أو التزام قانوني.",
        ],
      },
      {
        titleEn: "Minimization and Security",
        titleAr: "التقليل والأمن",
        bodyEn: [
          "Collect only data necessary for the research objectives; avoid collecting identifiable data when de-identified data suffices.",
          "Use encryption for data at rest and in transit; restrict access on a need-to-know basis.",
          "Maintain audit trails for access to sensitive research datasets.",
        ],
        bodyAr: [
          "اجمع فقط البيانات اللازمة لأهداف البحث؛ تجنب جمع بيانات قابلة للتحديد عندما تكفي البيانات مجهولة الهوية.",
          "استخدم التشفير للبيانات المخزنة والمنقولة؛ قيّد الوصول على أساس الحاجة للمعرفة.",
          "حافظ على سجلات تدقيق للوصول إلى مجموعات البيانات البحثية الحساسة.",
        ],
      },
      {
        titleEn: "Retention and Breach Response",
        titleAr: "الاحتفاظ والاستجابة للاختراق",
        bodyEn: [
          "Define retention periods aligned with IRB approval and legal requirements; securely destroy data when no longer needed.",
          "Report data breaches to institutional authorities and, where required, to the Saudi Data & AI Authority without undue delay.",
          "Include confidentiality measures in informed consent and staff training.",
        ],
        bodyAr: [
          "حدد فترات الاحتفاظ بما يتوافق مع موافقة IRB والمتطلبات القانونية؛ دمّر البيانات بشكل آمن عندما لم تعد مطلوبة.",
          "أبلغ عن اختراقات البيانات للسلطات المؤسسية، وحيث يلزم، لهيئة البيانات والذكاء الاصطناعي السعودية دون تأخير غير مبرر.",
          "ضمّن تدابير السرية في الموافقة المستنيرة وتدريب المو staff.",
        ],
      },
    ],
  },
  {
    slug: "privacy-policy",
    titleEn: "Privacy Policy",
    titleAr: "سياسة الخصوصية",
    descEn: "How IRB Ultimate collects, uses, and protects your personal information.",
    descAr: "كيف تجمع منصة IRB Ultimate معلوماتك الشخصية وتستخدمها وتحميها.",
    sections: [
      {
        titleEn: "Information We Collect",
        titleAr: "المعلومات التي نجمعها",
        bodyEn: [
          "Account information: name, email, institutional affiliation, and authentication identifiers.",
          "Application data: research protocols, investigator details, uploaded documents, and review history.",
          "Usage data: audit logs, support tickets, and system interactions for security and service improvement.",
        ],
        bodyAr: [
          "معلومات الحساب: الاسم والبريد الإلكتروني والانتماء المؤسسي ومعرّفات المصادقة.",
          "بيانات الطلب: بروتوكولات البحث وتفاصيل الباحثين والوثائق المرفوعة وسجل المراجعة.",
          "بيانات الاستخدام: سجلات التدقيق وتذاكر الدعم وتفاعلات النظام للأمن وتحسين الخدمة.",
        ],
      },
      {
        titleEn: "How We Use Information",
        titleAr: "كيف نستخدم المعلومات",
        bodyEn: [
          "To process IRB applications, conduct AI-assisted pre-screening, and facilitate committee review.",
          "To issue and verify IRB certificates and maintain regulatory audit trails.",
          "We do not sell personal data. AI processing is limited to application review and document generation you request.",
        ],
        bodyAr: [
          "لمعالجة طلبات IRB، وإجراء الفحص المسبق بمساعدة الذكاء الاصطناعي، وتسهيل مراجعة اللجنة.",
          "لإصدار شهادات IRB والتحقق منها والحفاظ على سجلات التدقيق التنظيمية.",
          "لا نبيع البيانات الشخصية. معالجة الذكاء الاصطناعي محدودة بمراجعة الطلبات وإنشاء المستندات التي تطلبها.",
        ],
      },
      {
        titleEn: "Your Rights",
        titleAr: "حقوقك",
        bodyEn: [
          "Under PDPL, you may request access, correction, or deletion of personal data subject to legal and research retention requirements.",
          "Contact platform administration for privacy inquiries. Approved IRB records may be retained as required by NBCE regulations.",
        ],
        bodyAr: [
          "بموجب PDPL، يمكنك طلب الوصول أو التصحيح أو الحذف للبيانات الشخصية وفق متطلبات الاحتفاظ القانونية والبحثية.",
          "تواصل مع إدارة المنصة لاستفسارات الخصوصية. قد تُحفظ سجلات IRB المعتمدة كما تتطلب لوائح NBCE.",
        ],
      },
    ],
  },
];

export function getGuidelineBySlug(slug: string): GuidelineDoc | undefined {
  return GUIDELINE_DOCS.find(d => d.slug === slug);
}
