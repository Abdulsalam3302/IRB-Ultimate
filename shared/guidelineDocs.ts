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
    slug: "how-to-get-irb-approval-saudi-arabia",
    titleEn: "How to Get IRB Approval in Saudi Arabia: Step by Step",
    titleAr: "كيف تحصل على موافقة لجنة أخلاقيات البحث (IRB) في السعودية: خطوة بخطوة",
    descEn: "A practical, step-by-step guide to preparing and submitting a research ethics application in Saudi Arabia, from protocol to decision.",
    descAr: "دليل عملي خطوة بخطوة لإعداد طلب أخلاقيات البحث وتقديمه في السعودية، من البروتوكول حتى القرار.",
    sections: [
      {
        titleEn: "Short answer",
        titleAr: "الإجابة المختصرة",
        bodyEn: [
          "Research involving people, their identifiable data or their biological samples in Saudi Arabia needs review by an institutional research ethics committee (IRB) registered under the National Committee of BioEthics (NCBE) before it starts, as required by the Law of Ethics of Research on Living Creatures and its Implementing Regulations.",
          "On this platform you prepare the application in guided steps, check its quality instantly, and submit it for review by qualified human reviewers. Screening starts the moment you submit, and the service target is a first review within 24 hours for complete applications.",
        ],
        bodyAr: [
          "تحتاج البحوث التي تشمل أشخاصاً أو بياناتهم القابلة للتعريف أو عيناتهم الحيوية في السعودية إلى مراجعة لجنة أخلاقيات بحث مؤسسية (IRB) مسجلة لدى اللجنة الوطنية للأخلاقيات الحيوية قبل البدء، وفق نظام أخلاقيات البحث على المخلوقات الحية ولائحته التنفيذية.",
          "تُعدّ طلبك في المنصة عبر خطوات موجّهة، وتتحقق من جودته فوراً، ثم تقدّمه لمراجعين بشريين مؤهلين. يبدأ الفحص فور التقديم، وهدف الخدمة إتمام المراجعة الأولى خلال 24 ساعة للطلبات المكتملة.",
        ],
      },
      {
        titleEn: "Step 1 — Prepare before you start",
        titleAr: "الخطوة 1 — استعد قبل البدء",
        bodyEn: [
          "Have your research question, study design, target population, sample size justification, consent approach and data protection plan ready.",
          "Complete research ethics (bioethics) training accepted by your institution and keep the certificate for the declaration step.",
          "Confirm who the principal investigator is, their institution and department, the funding source and the expected duration.",
        ],
        bodyAr: [
          "جهّز سؤال البحث وتصميم الدراسة والفئة المستهدفة ومبررات حجم العينة وطريقة الحصول على الموافقة وخطة حماية البيانات.",
          "أكمل تدريباً في أخلاقيات البحث تقبله مؤسستك واحتفظ بالشهادة لخطوة الإقرارات.",
          "حدّد الباحث الرئيس ومؤسسته وقسمه ومصدر التمويل والمدة المتوقعة.",
        ],
      },
      {
        titleEn: "Step 2 — Declarations and study classification",
        titleAr: "الخطوة 2 — الإقرارات وتصنيف الدراسة",
        bodyEn: [
          "Confirm the accuracy, training, consent and policy declarations.",
          "Choose the study type (for example observational, retrospective, survey, clinical trial) and the review category you are requesting. The committee confirms the final category.",
        ],
        bodyAr: [
          "أكّد إقرارات صحة المعلومات والتدريب والموافقة والسياسة.",
          "اختر نوع الدراسة (مثل رصدية أو بأثر رجعي أو استبانة أو تجربة سريرية) وفئة المراجعة المطلوبة، وتؤكد اللجنة الفئة النهائية.",
        ],
      },
      {
        titleEn: "Step 3 — Write the protocol (or use the chat assistant)",
        titleAr: "الخطوة 3 — اكتب البروتوكول (أو استخدم المساعد بالمحادثة)",
        bodyEn: [
          "Complete twelve protocol sections: objectives, methodology, sample size, target population, inclusion and exclusion criteria, data collection, informed consent, risks, benefits, confidentiality and conflict of interest.",
          "Prefer a conversation? The chat application asks one question at a time and fills the same sections for you to review. Optional AI feedback suggests improvements; it never invents facts or approvals.",
        ],
        bodyAr: [
          "أكمل اثني عشر قسماً في البروتوكول: الأهداف والمنهجية وحجم العينة والفئة المستهدفة ومعايير الإدراج والاستبعاد وجمع البيانات والموافقة المستنيرة والمخاطر والفوائد والسرية وتعارض المصالح.",
          "تفضّل المحادثة؟ يطرح التقديم بالمحادثة سؤالاً واحداً في كل مرة ويملأ الأقسام نفسها لتراجعها. تقترح ملاحظات الذكاء الاصطناعي الاختيارية تحسينات دون اختلاق حقائق أو موافقات.",
        ],
      },
      {
        titleEn: "Step 4 — Check quality, then submit",
        titleAr: "الخطوة 4 — تحقّق من الجودة ثم قدّم",
        bodyEn: [
          "Before submitting, the platform shows which required items are missing and gives instant quality tips on the points committees most often return applications for: a clear primary objective, a justified sample size, complete consent, safeguards for vulnerable groups, a PDPL-aligned data protection plan and risks with mitigation.",
          "Tips never block submission. Addressing them usually means fewer questions and a faster decision.",
        ],
        bodyAr: [
          "قبل التقديم تعرض المنصة العناصر المطلوبة الناقصة، وتقدّم نصائح جودة فورية في أكثر النقاط التي تعيد اللجان الطلبات بسببها: هدف رئيس واضح، وحجم عينة مبرر، وموافقة مكتملة، وضمانات للفئات المستضعفة، وخطة حماية بيانات متوافقة مع نظام حماية البيانات الشخصية، ومخاطر مع إجراءات تخفيفها.",
          "لا تمنع النصائح التقديم، لكن معالجتها تعني عادة أسئلة أقل وقراراً أسرع.",
        ],
      },
      {
        titleEn: "Step 5 — Review and decision",
        titleAr: "الخطوة 5 — المراجعة والقرار",
        bodyEn: [
          "After submission the application is screened and assigned to independent, appointed reviewers with a 24-hour review window. Lapsed assignments are renewed or reassigned automatically, and administrators are alerted if the 24-hour target is missed.",
          "You are notified in the platform and by email if reviewers ask questions and when a decision is recorded. Every decision is made by authorized people; automated checks never approve research. Issued records can be checked on the Verify page.",
        ],
        bodyAr: [
          "بعد التقديم يُفحص الطلب ويُحال إلى مراجعين مستقلين معيّنين بمهلة مراجعة 24 ساعة. تُجدَّد التكليفات المنتهية أو يُعاد إسنادها تلقائياً، ويُنبَّه المسؤولون إذا تجاوز الطلب هدف 24 ساعة.",
          "يصلك إشعار في المنصة وبالبريد الإلكتروني إذا طرح المراجعون أسئلة وعند تسجيل القرار. تصدر جميع القرارات عن أشخاص مخولين، ولا يعتمد الفحص الآلي أي بحث. يمكن التحقق من السجلات الصادرة عبر صفحة التحقق.",
        ],
      },
    ],
  },
  {
    slug: "irb-application-checklist",
    titleEn: "IRB Application Checklist for Researchers in Saudi Arabia",
    titleAr: "قائمة التحقق لطلب أخلاقيات البحث للباحثين في السعودية",
    descEn: "What a complete, high-quality research ethics application contains — the items committees check first.",
    descAr: "ما يتضمنه طلب أخلاقيات بحث مكتمل وعالي الجودة — العناصر التي تتحقق منها اللجان أولاً.",
    sections: [
      {
        titleEn: "Study essentials",
        titleAr: "أساسيات الدراسة",
        bodyEn: [
          "A specific title that names the design, population and setting.",
          "One primary objective with how it will be measured, plus any secondary objectives.",
          "The study design, setting, procedures, timeline and analysis plan.",
          "A sample size with its justification: power or precision calculation, qualitative saturation, or a defined census of all eligible records.",
        ],
        bodyAr: [
          "عنوان محدد يذكر التصميم والفئة والمكان.",
          "هدف رئيس واحد مع طريقة قياسه، إضافة إلى الأهداف الثانوية.",
          "تصميم الدراسة ومكانها وإجراءاتها وجدولها الزمني وخطة التحليل.",
          "حجم العينة مع مبرراته: حساب القوة أو الدقة، أو التشبع في البحث النوعي، أو حصر شامل لجميع السجلات المؤهلة.",
        ],
      },
      {
        titleEn: "Participants and consent",
        titleAr: "المشاركون والموافقة",
        bodyEn: [
          "Concrete inclusion and exclusion criteria (age range, condition, setting, time window).",
          "A consent process covering voluntary participation, the right to withdraw without penalty, risks, confidentiality, who obtains consent and a contact for questions — in Arabic and English where participants need it.",
          "For retrospective record reviews, a consent waiver request that explains why consent is impracticable, why risk is minimal and how identities are protected. The committee decides whether to grant it.",
          "Extra safeguards for children (guardian consent and child assent), students and employees (protection from pressure), and other vulnerable groups.",
        ],
        bodyAr: [
          "معايير إدراج واستبعاد محددة (الفئة العمرية، الحالة، المكان، الفترة الزمنية).",
          "عملية موافقة تغطي طوعية المشاركة وحق الانسحاب دون عقوبة والمخاطر والسرية ومن يحصل على الموافقة وجهة التواصل، بالعربية والإنجليزية حسب حاجة المشاركين.",
          "في مراجعة السجلات بأثر رجعي: طلب إعفاء من الموافقة يوضح سبب تعذرها وأن المخاطر في حدها الأدنى وكيف تُحمى الهويات، والقرار للجنة.",
          "ضمانات إضافية للأطفال (موافقة ولي الأمر وموافقة الطفل)، والطلاب والموظفين (الحماية من الضغط)، وغيرهم من الفئات المستضعفة.",
        ],
      },
      {
        titleEn: "Data, risk and integrity",
        titleAr: "البيانات والمخاطر والنزاهة",
        bodyEn: [
          "A data protection plan aligned with the Personal Data Protection Law: de-identification or coding, who can access the data and how it is secured, the retention period and disposal, and any transfer outside Saudi Arabia.",
          "Realistic risks (including privacy and psychological risks) with a specific mitigation for each, and realistic benefits.",
          "A conflict of interest statement — or a clear statement that there is none.",
          "For clinical trials: trial registration plans (for example the Saudi Clinical Trials Registry) and any Saudi Food and Drug Authority (SFDA) authorization needed for drugs or devices.",
          "No unresolved placeholders such as TBD, [MISSING] or [ASSUMPTION] left in the final text.",
        ],
        bodyAr: [
          "خطة لحماية البيانات متوافقة مع نظام حماية البيانات الشخصية: إخفاء الهوية أو الترميز، ومن يصل إلى البيانات وكيف تُؤمَّن، ومدة الاحتفاظ وطريقة الإتلاف، وأي نقل خارج المملكة.",
          "مخاطر واقعية (بما فيها الخصوصية والمخاطر النفسية) مع إجراء تخفيف محدد لكل منها، وفوائد واقعية.",
          "إفصاح عن تعارض المصالح، أو تصريح واضح بعدم وجوده.",
          "للتجارب السريرية: خطة تسجيل التجربة (مثل السجل السعودي للتجارب السريرية) وأي موافقة لازمة من الهيئة العامة للغذاء والدواء للأدوية أو الأجهزة.",
          "لا توجد عناصر ناقصة معلّمة مثل «يُحدد لاحقاً» أو [MISSING] أو [ASSUMPTION] في النص النهائي.",
        ],
      },
    ],
  },
  {
    slug: "exempt-expedited-full-board-review",
    titleEn: "Exempt, Expedited or Full Board Review: Which One Applies?",
    titleAr: "المراجعة المعفاة أو المسرّعة أو الكاملة: أيها ينطبق على دراستك؟",
    descEn: "How research ethics committees decide the level of review, with common examples. The committee confirms the category for each study.",
    descAr: "كيف تحدد لجان أخلاقيات البحث مستوى المراجعة، مع أمثلة شائعة. تؤكد اللجنة الفئة لكل دراسة.",
    sections: [
      {
        titleEn: "The short version",
        titleAr: "باختصار",
        bodyEn: [
          "The level of review follows risk. Minimal-risk studies may qualify for exempt or expedited review; research involving more than minimal risk, interventions or vulnerable participants usually needs review by the full committee.",
          "You may request a category, but only the committee can confirm it. Requesting a lighter category never authorizes a study to begin.",
        ],
        bodyAr: [
          "يتبع مستوى المراجعة درجة المخاطر. قد تؤهل الدراسات ذات الحد الأدنى من المخاطر للمراجعة المعفاة أو المسرّعة، بينما تحتاج البحوث التي تتجاوز الحد الأدنى من المخاطر أو تتضمن تدخلات أو فئات مستضعفة عادة إلى مراجعة اللجنة الكاملة.",
          "يمكنك طلب فئة معينة، لكن اللجنة وحدها تؤكدها، وطلب فئة أخف لا يجيز بدء الدراسة.",
        ],
      },
      {
        titleEn: "Common examples",
        titleAr: "أمثلة شائعة",
        bodyEn: [
          "Often exempt or expedited: anonymous surveys of adults on non-sensitive topics; retrospective reviews of de-identified records; analysis of publicly available data.",
          "Often expedited: minimal-risk prospective studies such as routine blood draws in healthy adults or non-invasive measurements.",
          "Usually full board: clinical trials of drugs or devices; studies with children, prisoners or people who cannot consent; sensitive topics where disclosure could cause harm; genetic research with identifiable samples.",
        ],
        bodyAr: [
          "غالباً معفاة أو مسرّعة: الاستبانات المجهولة للبالغين في موضوعات غير حساسة، ومراجعة السجلات منزوعة الهوية بأثر رجعي، وتحليل البيانات المتاحة للعموم.",
          "غالباً مسرّعة: الدراسات المستقبلية ذات الحد الأدنى من المخاطر مثل سحب الدم الروتيني من بالغين أصحاء أو القياسات غير الجراحية.",
          "عادة مراجعة كاملة: التجارب السريرية للأدوية أو الأجهزة، والدراسات على الأطفال أو السجناء أو من لا يستطيعون الموافقة، والموضوعات الحساسة التي قد يضر كشفها، والبحوث الجينية على عينات قابلة للتعريف.",
        ],
      },
      {
        titleEn: "How this platform handles it",
        titleAr: "كيف تتعامل المنصة مع ذلك",
        bodyEn: [
          "Full board requests are assigned to more reviewers than expedited or exempt requests. Automated screening highlights items that need a reviewer's judgement, and every final decision is recorded by an authorized person.",
        ],
        bodyAr: [
          "تُحال طلبات المراجعة الكاملة إلى عدد أكبر من المراجعين مقارنة بالطلبات المسرّعة أو المعفاة. يبرز الفحص الآلي العناصر التي تحتاج تقدير المراجع، ويسجل شخص مخول كل قرار نهائي.",
        ],
      },
    ],
  },
  {
    slug: "nbce-ethical-guidelines",
    titleEn: "NCBE Ethical Guidelines for Research",
    titleAr: "الإرشادات الأخلاقية للجنة الوطنية للأخلاقيات الحيوية",
    descEn: "Core principles for ethical human-subjects research in Saudi Arabia.",
    descAr: "المبادئ الأساسية للبحث الأخلاقي على البشر في المملكة العربية السعودية.",
    sections: [
      {
        titleEn: "Scope and Authority",
        titleAr: "النطاق والسلطة",
        bodyEn: [
          "The National Committee of BioEthics (NCBE) of Saudi Arabia establishes the national framework for ethical review of research involving humans, their data, or biological materials.",
          "All institutions conducting research in the Kingdom must ensure IRB review aligns with NCBE regulations before research begins.",
        ],
        bodyAr: [
          "تضع اللجنة الوطنية للأخلاقيات الحيوية في المملكة العربية السعودية (NCBE) الإطار الوطني للمراجعة الأخلاقية للبحوث التي تشمل البشر أو بياناتهم أو موادهم البيولوجية.",
          "يجب على جميع المؤسسات التي تجري بحوثاً في المملكة ضمان توافق مراجعة IRB مع لوائح NCBE قبل بدء البحث.",
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
          "الإحسان: تعظيم المنافع المتوقعة وتقليل الأضرار المحتملة إلى أدنى حد.",
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
          "تتطلب الفئات الأكثر عرضة للخطر ضمانات إضافية، بما في ذلك إجراءات موافقة القاصرين والموافقة بالإنابة حيثما يقتضي الأمر.",
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
        titleAr: "الفئات الأكثر عرضة للخطر والنشر العلمي",
        bodyEn: [
          "Groups that are unable to give consent require additional protections; research should only be conducted when it benefits the group or cannot otherwise be performed.",
          "Every research study involving human subjects must be registered in a publicly accessible database before recruitment.",
          "Authors, editors, and publishers have ethical obligations to publish research results and to minimize publication bias.",
        ],
        bodyAr: [
          "تتطلب المجموعات غير القادرة على الموافقة حماية إضافية؛ يجب إجراء البحث فقط عندما يفيد المجموعة أو لا يمكن إجراؤه بطريقة أخرى.",
          "يجب تسجيل كل دراسة بحثية تشمل البشر في قاعدة بيانات متاحة للجمهور قبل تسجيل أول مشارك.",
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
          "يجب توفر موارد كافية طوال مدة التجربة، بما في ذلك كوادر مؤهلة ومرافق مناسبة.",
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
          "يحق للجهات التنظيمية تفتيش مواقع التجارب؛ وعلى الباحثين إتاحة الوصول إلى البيانات والوثائق المصدرية.",
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
          "ضمّن تدابير السرية في نموذج الموافقة المستنيرة وفي تدريب فريق العمل.",
        ],
      },
    ],
  },
  {
    slug: "privacy-policy",
    titleEn: "Privacy Policy",
    titleAr: "سياسة الخصوصية",
    descEn: "How IRB Saudi Arabia collects, uses, and protects your personal information.",
    descAr: "كيف تجمع منصة IRB السعودية معلوماتك الشخصية وتستخدمها وتحميها.",
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
          "AI assistance sends relevant request content to the model provider configured by the operator. Protocol text and chat may contain confidential information; use de-identified examples and review what you share.",
          "Browser analytics is disabled by default. If the operator enables first-party public page counts, only approved public path names are recorded; application and verification routes are excluded. Third-party analytics scripts are not loaded in the workspace.",
        ],
        bodyAr: [
          "لمعالجة طلبات IRB، وإجراء الفحص المسبق بمساعدة الذكاء الاصطناعي، وتسهيل مراجعة اللجنة.",
          "لإصدار شهادات IRB والتحقق منها والحفاظ على سجلات التدقيق التنظيمية.",
          "ترسل المساعدة بالذكاء الاصطناعي المحتوى اللازم للطلب إلى مزود النموذج الذي يضبطه المشغل. قد تتضمن نصوص البروتوكول والمحادثة معلومات سرية؛ استخدم أمثلة منزوعة الهوية وراجع ما تشاركه.",
          "تُعطل تحليلات المتصفح افتراضياً. عند تفعيل المشغل إحصاء زيارات الصفحات العامة، تُسجل أسماء المسارات المسموحة فقط وتُستثنى مسارات الطلبات والتحقق. لا تُحمّل برامج تحليلات خارجية في مساحة العمل.",
        ],
      },
      {
        titleEn: "Your Rights",
        titleAr: "حقوقك",
        bodyEn: [
          "Under PDPL, you may request access, correction, or deletion of personal data subject to legal and research retention requirements.",
          "Use the Support page for privacy requests. Account deletion may preserve decision and audit records where retention is required. Do not assume that deleting an account removes every historical research record.",
          "Before accepting sensitive production data, the operator must publish the legal controller identity and contact details, processing purposes and lawful bases, provider/subprocessor list and locations, transfer safeguards, and the approved retention schedule. These operational facts cannot be established by this software alone.",
        ],
        bodyAr: [
          "بموجب PDPL، يمكنك طلب الوصول أو التصحيح أو الحذف للبيانات الشخصية وفق متطلبات الاحتفاظ القانونية والبحثية.",
          "استخدم صفحة الدعم لطلبات الخصوصية. قد تُحفظ سجلات القرارات والتدقيق بعد حذف الحساب إذا وجب الاحتفاظ بها. لا تفترض أن حذف الحساب يمحو جميع السجلات البحثية السابقة.",
          "قبل استقبال البيانات الحساسة في التشغيل الفعلي، يجب على المشغل نشر هوية جهة التحكم القانونية وبيانات التواصل وأغراض المعالجة ومسوغاتها وقائمة المزودين ومواقعهم وضمانات النقل وجدول الاحتفاظ المعتمد. لا يمكن إثبات هذه الحقائق التشغيلية من البرنامج وحده.",
        ],
      },
    ],
  },
];

export function getGuidelineBySlug(slug: string): GuidelineDoc | undefined {
  return GUIDELINE_DOCS.find(d => d.slug === slug);
}
