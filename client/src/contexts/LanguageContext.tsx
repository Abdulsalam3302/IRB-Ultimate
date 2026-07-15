import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en" | "ar";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

// Shorthand hook
export function useT() {
  const { t, lang, dir, isRtl } = useLanguage();
  return { t, lang, dir, isRtl };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem("irb-lang");
    return (saved === "ar" ? "ar" : "en") as Language;
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("irb-lang", newLang);
  };

  const dir = lang === "ar" ? "rtl" : "ltr";
  const isRtl = lang === "ar";

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
    if (lang === "ar") {
      document.body.style.fontFamily = "'Noto Kufi Arabic', 'Inter', sans-serif";
    } else {
      document.body.style.fontFamily = "'Inter', sans-serif";
    }
  }, [lang, dir]);

  const t = (key: string): string => {
    const translations = lang === "ar" ? ar : en;
    return (translations as Record<string, string>)[key] || (en as Record<string, string>)[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
}

// ─── English translations ──────────────────────────────────────────────────
const en: Record<string, string> = {
  // Navigation
  "nav.home": "Home",
  "nav.apply": "Apply for IRB",
  "nav.verify": "Verify IRB",
  "nav.registry": "Public Registry",
  "nav.resources": "Resources",
  "nav.support": "Support",
  "nav.policy": "Policy",
  "nav.disclaimer": "Disclaimer",
  "nav.dashboard": "Dashboard",
  "nav.admin": "Admin Panel",
  "nav.reviews": "My Reviews",
  "nav.login": "Sign In",
  "nav.logout": "Sign Out",
  "nav.language": "العربية",

  // Platform independence notice (always visible)
  "platform.notice":
    "Independent ethical research review platform for the Kingdom of Saudi Arabia, operated by AHSS with AI-powered workflows and digital certification in alignment with applicable Saudi regulations and international ethical standards.",

  // Demo / pilot banner (VITE_PUBLIC_DEMO_BANNER=1)
  "demo.banner":
    "Demo environment — do not submit real participant data or PHI. This deployment is for evaluation and feedback only.",

  // Open beta (always on for v1.1.0)
  "beta.banner": "Open beta · v1.1.0 — features may change; feedback welcome.",
  "beta.learnMore": "About & disclaimer",

  // Disclaimer / about (first-visit gate)
  "disclaimer.badge": "Open beta · IRB Saudi Arabia",
  "disclaimer.title": "Disclaimer & About",
  "disclaimer.subtitle": "Please read before using the platform",
  "disclaimer.aboutFounder": "About the founder",
  "disclaimer.founderBody":
    "Dr. Abdulsalam Aleid is a physician and health-systems leader building tools that give researchers clear structure, honest guidance, and faster ethical review — without replacing human judgment.",
  "disclaimer.aboutProject": "About this project",
  "disclaimer.projectBody":
    "IRB Saudi Arabia is an independent AI-assisted ethical review platform operated by the Advanced Healthcare Systems Society (AHSS). It helps researchers prepare and submit IRB-style applications with transparent workflows and verifiable digital certificates.",
  "disclaimer.operatedBy": "Operated by",
  "disclaimer.openBeta": "Open beta",
  "disclaimer.openBetaBody":
    "This platform is in open beta. Workflows, AI guidance, and interfaces may change. Do not treat outputs as final medical, legal, ethical, or regulatory advice. Report issues via Support so we can improve the service for the research community.",
  "disclaimer.legal": "Important notice",
  "disclaimer.legalBody":
    "IRB Saudi Arabia is an independent academic-productivity and ethical-review facilitation platform. It does not provide medical, legal, ethical, or clinical advice, and it is not an official NCBE Institutional Review Board provider. Researchers remain responsible for compliance with applicable Saudi regulations and institutional requirements.",
  "disclaimer.acknowledge": "I understand — continue",
  "disclaimer.linkedinCta": "Visit LinkedIn profile",

  "footer.version": "v1.1.0 · open beta",

  // Hero
  "hero.badge": "Digital IRB Review Platform",
  "hero.title": "Institutional Review Board",
  "hero.subtitle": "Ethical Research Approval Platform",
  "hero.desc": "A modern, AI-powered platform for fast, transparent, and compliant IRB review — reducing approval time from weeks to 24–48 hours with increasing quality and quantity of the service.",
  "hero.apply": "Apply for IRB Approval",
  "hero.verify": "Verify an IRB Certificate",
  "hero.learnMore": "Learn More",
  "hero.cta.title": "Ready to Submit Your Research?",
  "hero.cta.desc": "Join researchers across Saudi Arabia who are accelerating their IRB approvals with our AI-powered platform.",

  // Stats
  "stats.target": "24-48h Target",
  "stats.targetDesc": "Approval Time",
  "stats.ai": "AI-Powered",
  "stats.aiDesc": "Compliance Check",
  "stats.committee": "Scientific Committee",
  "stats.committeeDesc": "Per Application",
  "stats.digital": "100% Digital",
  "stats.digitalDesc": "Paperless Process",

  // Vision/Mission
  "vision.title": "Our Vision",
  "vision.text": "To be the leading digital IRB platform in Saudi Arabia, setting the standard for ethical research oversight through innovation, transparency, and efficiency — fully aligned with the Kingdom's Vision 2030.",
  "mission.title": "Our Mission",
  "mission.text": "To accelerate the ethical review process by leveraging artificial intelligence and modern technology, ensuring every research project receives thorough, fair, and timely evaluation while maintaining the highest standards of bioethics compliance.",
  "aim.title": "Our Aim",
  "aim.text": "To reduce IRB approval time to 24–48 hours through AI-integrated pre-screening, automated committee assignment, and digital certification — minimizing cost, effort, and bureaucratic delays while maximizing research outcomes.",

  // How It Works
  "how.title": "How It Works",
  "how.step1.title": "Submit Application",
  "how.step1.desc": "Complete a two-stage application form with AI-powered compliance checks at each stage.",
  "how.step2.title": "Committee Review",
  "how.step2.desc": "Your application is randomly assigned to 5 committee members who have 24 hours to review.",
  "how.step3.title": "Admin Approval",
  "how.step3.desc": "Once 3 members approve, the application moves to the admin for final decision.",
  "how.step4.title": "IRB Certificate",
  "how.step4.desc": "Upon approval, receive your IRB certificate with a unique serial number instantly.",

  // Features
  "features.title": "Platform Features",
  "features.ai.title": "AI Pre-Screening",
  "features.ai.desc": "Automated compliance checks against NCBE ethical guidelines, the Declaration of Helsinki, and ICH-GCP standards before human review.",
  "features.fast.title": "Rapid Processing",
  "features.fast.desc": "24-48 hour target turnaround with automated committee assignment and real-time status tracking.",
  "features.secure.title": "Secure & Compliant",
  "features.secure.desc": "End-to-end encryption, audit trails, and full compliance with Saudi data protection regulations.",
  "features.digital.title": "Digital Certificates",
  "features.digital.desc": "Instantly generated PDF certificates with unique IRB numbers, verifiable through our public portal.",
  "features.analytics.title": "Real-time Analytics",
  "features.analytics.desc": "Administrators can track metrics, response times, approval rates, and committee performance in real time.",
  "features.vision.title": "Standards Compliant",
  "features.vision.desc": "Designed to support NCBE ethical guidelines, PDPL, Helsinki, ICH-GCP, and Saudi Vision 2030 — as an independent AHSS platform.",

  // Footer
  "footer.brand": "IRB Review Platform",
  "footer.desc": "Independent ethical research review platform for the Kingdom of Saudi Arabia — AI-powered workflows and digital certification by AHSS.",
  "footer.independence": "Independent ethical research review platform for the Kingdom of Saudi Arabia, operated by AHSS with AI-powered workflows and digital certification in alignment with applicable Saudi regulations and international ethical standards.",
  "footer.quickLinks": "Quick Links",
  "footer.legal": "Legal",
  "footer.contact": "Contact",
  "footer.privacy": "Privacy Policy",
  "footer.terms": "Terms of Service",
  "footer.madeWith": "Made with Love in Saudi Arabia",
  "footer.org": "Advanced Healthcare Systems Society",
  "footer.stamp.ahss": "AHSS Independent",
  "footer.stamp.pdpl": "PDPL compliant",
  "footer.stamp.nbceGuidelines": "NCBE guidelines",
  "footer.stamp.helsinki": "Helsinki",
  "footer.stamp.vision2030": "Vision 2030",
  "footer.nbceReference": "For official NCBE regulations and guidance, visit",
  "footer.founded": "Founded by Dr. Abdulsalam Aleid",
  "footer.nbceLink": "National Committee of BioEthics (NCBE)",
  "footer.vision2030": "Saudi Vision 2030",
  "footer.feedback": "Suggestions & complaints",
  "footer.feedbackCta": "Reach Dr. Aleid on LinkedIn",
  "footer.copyright": "©",
  "footer.partnership": "For partnership and cooperation inquiries, reach us on LinkedIn.",
  "footer.partnershipCta": "Connect on LinkedIn",

  // Format wizard
  "format.button": "Format",
  "format.chooseTemplate": "Choose template — answer questions, then generate",
  "format.wizardBadge": "Guided format wizard",
  "format.prefilledHint": "Fields pre-filled from your saved application — review and edit before generating.",
  "format.generateTitle": "Generate your document",
  "format.generatePdf": "Generate PDF",
  "format.generateDocx": "Generate DOCX",
  "format.missingFields": "{n} field(s) still empty — you can generate anyway or complete them first.",
  "format.readyToGenerate": "All fields completed. Ready to generate your stamped document.",
  "format.stampNote": "Every generated document includes Dr. Abdulsalam Aleid's authorized signature and platform seal.",
  "format.enterHint": "Enter:",
  "format.showExample": "Show ideal example",
  "format.answerPlaceholder": "Type your answer here…",
  "format.filledSection": "Pre-filled format (Q&A wizard)",
  "format.blankSection": "Blank template (manual download)",
  "format.languageNotice":
    "Questions and your exported file will be in English. Use the language toggle in the header to switch to Arabic (العربية) — both the Q&A and the PDF/DOCX will follow your choice.",
  "format.exportLanguage": "Export language: English",
  "format.generateSuccess": "Document generated successfully",
  "format.generateError": "Failed to generate document",

  // Theme
  "theme.light": "Light mode",
  "theme.dark": "Dark mode",

  // Navigation extras
  "nav.statistics": "Statistics",

  // Dashboard
  "dash.title": "My Applications",
  "dash.welcome": "Welcome back",
  "dash.newApp": "New Application",
  "dash.noApps": "No Applications Yet",
  "dash.noAppsDesc": "Start your first IRB application to begin the ethical review process.",
  "dash.startApp": "Start New Application",
  "dash.status": "Status",
  "dash.created": "Created",
  "dash.actions": "Actions",
  "dash.view": "View",
  "dash.continue": "Continue",
  "dash.resubmit": "Resubmit",
  "dash.totalApps": "Total Applications",
  "dash.approved": "Approved",
  "dash.pending": "Under Review",
  "dash.drafts": "Drafts",

  // Application Form
  "form.stage1.title": "Stage 1: Research Type & Basic Information",
  "form.stage1.desc": "Define your research type and provide basic project information. Each field will be evaluated by our AI system.",
  "form.stage2.title": "Stage 2: Research Details & Ethics",
  "form.stage2.desc": "Provide detailed methodology, ethics considerations, and supporting documentation.",
  "form.researchType": "Research Type",
  "form.irbCategory": "Review Category",
  "form.researchTitle": "Research Title",
  "form.pi": "Principal Investigator",
  "form.piEmail": "PI Email",
  "form.institution": "Institution",
  "form.department": "Department",
  "form.funding": "Funding Source",
  "form.duration": "Estimated Duration",
  "form.save": "Save Progress",
  "form.runAi": "Run AI Review",
  "form.next": "Next Stage",
  "form.submit": "Submit Application",
  "form.aiChecking": "AI is reviewing your application...",
  "form.aiPassed": "AI Review Passed",
  "form.aiFailed": "AI Review Failed",
  "form.score": "Score",
  "form.feedback": "Feedback",
  "form.recommendations": "Recommendations",

  // Research Types
  "research.clinical_trial": "Clinical Trial",
  "research.observational": "Observational Study",
  "research.retrospective": "Retrospective Study",
  "research.survey_questionnaire": "Survey / Questionnaire",
  "research.case_study": "Case Study",
  "research.laboratory": "Laboratory Research",
  "research.educational": "Educational Research",
  "research.social_behavioral": "Social/Behavioral Research",
  "research.other": "Other",

  // Research-type specific fields
  "form.questionnaire.upload": "Upload Questionnaire File",
  "form.questionnaire.required": "(Required for Survey/Questionnaire)",
  "form.retrospective.source": "Data Source",
  "form.retrospective.required": "(Required for Retrospective Study)",
  "form.retrospective.placeholder": "Specify where the data will be obtained from (e.g., hospital records, national registry...)",
  "form.clinical.details": "Clinical Trial Details",
  "form.clinical.optional": "(Optional)",
  "form.clinical.supplementary": "Supplementary Documents",
  "form.lab.approval": "Head of Lab Approval",
  "form.lab.name": "Head of Lab Name",
  "form.lab.email": "Head of Lab Email",
  "form.lab.phone": "Head of Lab Phone",

  // Stage 2 fields
  "form.objectives": "Research Objectives",
  "form.methodology": "Methodology",
  "form.sampleSize": "Sample Size",
  "form.targetPop": "Target Population",
  "form.inclusion": "Inclusion Criteria",
  "form.exclusion": "Exclusion Criteria",
  "form.dataCollection": "Data Collection Methods",
  "form.consent": "Informed Consent Process",
  "form.risk": "Risk Assessment",
  "form.benefit": "Benefit Assessment",
  "form.confidentiality": "Confidentiality Measures",
  "form.conflict": "Conflict of Interest",
  "form.rejectionFile": "Previous Rejection File (if resubmitting)",

  // Authors
  "authors.title": "Research Authors / Co-Investigators",
  "authors.add": "Add Author",
  "authors.name": "Name",
  "authors.email": "Email",
  "authors.phone": "Phone",
  "authors.institution": "Institution",
  "authors.department": "Department",
  "authors.country": "Country",
  "authors.remove": "Remove",
  "authors.noAuthors": "No co-authors added yet.",

  // Verify
  "verify.title": "Verify IRB Certificate",
  "verify.desc": "Enter an IRB serial number to verify the authenticity of a certificate.",
  "verify.placeholder": "Enter IRB Number (e.g., IRB-SA-2026-00001)",
  "verify.button": "Verify",
  "verify.searching": "Searching...",
  "verify.found": "Certificate Verified",
  "verify.notFound": "No valid IRB certificate found with this number.",
  "verify.download": "Download Certificate",
  "verify.details": "Certificate Details",
  "verify.issuedTo": "Issued To",
  "verify.approvedDate": "Approved Date",

  // Resources
  "resources.title": "Resource Center",
  "resources.desc": "Download templates, guidelines, and reference materials to help you prepare your IRB application.",
  "resources.templates": "Application Templates",
  "resources.guidelines": "Guidelines & Standards",
  "resources.faq": "Frequently Asked Questions",
  "resources.download": "Download",

  // Support
  "support.title": "Support Center",
  "support.desc": "Have a question, issue, or suggestion? We're here to help.",
  "support.name": "Your Name",
  "support.email": "Your Email",
  "support.subject": "Subject",
  "support.category": "Category",
  "support.message": "Message",
  "support.submit": "Submit Ticket",
  "support.success": "Your support ticket has been submitted successfully. We'll get back to you soon.",
  "support.cat.issue": "Issue / Bug Report",
  "support.cat.suggestion": "Suggestion",
  "support.cat.question": "Question",
  "support.cat.other": "Other",
  "support.fillAll": "Please fill in all fields",
  "support.error": "Failed to submit ticket",
  "support.submitted": "Ticket Submitted",
  "support.submittedDesc": "Thank you for reaching out. Your support ticket has been received and our team will review it shortly.",
  "support.submitAnother": "Submit Another",
  "support.submitting": "Submitting...",
  "support.formTitle": "Submit a Support Ticket",
  "support.formDesc": "All fields are required. We typically respond within 24 hours.",
  "support.namePlaceholder": "Full name",
  "support.categoryPlaceholder": "Select category",
  "support.subjectPlaceholder": "Brief description of your inquiry",
  "support.messagePlaceholder": "Please describe your issue, suggestion, or question in detail...",
  "support.catIssue": "Report an Issue",
  "support.catSuggestion": "Suggestion",
  "support.catQuestion": "Question",
  "support.catOther": "Other",

  // Policy
  "policy.title": "Usage Policy & Terms of Service",
  "policy.subtitle": "IRB Saudi Arabia — Independent platform by AHSS · PDPL · NCBE guidelines · Helsinki · Vision 2030",

  // Admin
  "admin.title": "Admin Dashboard",
  "admin.applications": "Applications",
  "admin.committee": "Committee",
  "admin.tickets": "Support Tickets",
  "admin.reports": "Reports",
  "admin.auditLog": "Audit Log",
  "admin.stats.total": "Total Applications",
  "admin.stats.approved": "Approved",
  "admin.stats.rejected": "Rejected",
  "admin.stats.pending": "Pending Review",
  "admin.approve": "Approve",
  "admin.reject": "Reject",
  "admin.resubmit": "Allow Resubmission",
  "admin.assign": "Manual Assign",
  "admin.addMember": "Add Committee Member",
  "admin.removeMember": "Remove Member",
  "admin.exportReport": "Export Report",
  "admin.monthlyReport": "Monthly Report",
  "admin.annualReport": "Annual Report",

  // Review
  "review.title": "Committee Review Dashboard",
  "review.pending": "Pending Reviews",
  "review.history": "Review History",
  "review.noPending": "No pending reviews at this time.",
  "review.approve": "Approve",
  "review.reject": "Reject",
  "review.comments": "Comments (optional)",
  "review.expires": "Expires",
  "review.submitted": "Review Submitted",

  // Notifications
  "notif.title": "Notifications",
  "notif.empty": "No notifications yet.",
  "notif.markRead": "Mark as Read",
  "notif.markAllRead": "Mark All as Read",

  // Status labels
  "status.draft": "Draft",
  "status.stage1_pending": "Stage 1 Review",
  "status.stage1_failed": "Stage 1 Failed",
  "status.stage2_pending": "Stage 2 Review",
  "status.stage2_failed": "Stage 2 Failed",
  "status.submitted": "Ready to Submit",
  "status.under_review": "Under Committee Review",
  "status.pending_admin": "Pending Admin Approval",
  "status.approved": "Approved",
  "status.rejected": "Rejected",
  "status.resubmission_required": "Resubmission Required",
  "status.permanently_rejected": "Permanently Rejected",

  // Common
  "common.loading": "Loading...",
  "common.error": "An error occurred",
  "common.back": "Back",
  "common.backHome": "Back to Home",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.yes": "Yes",
  "common.no": "No",
  "common.or": "or",
  "common.and": "and",
  "common.search": "Search",
  "common.filter": "Filter",
  "common.noResults": "No results found",
  "common.comingSoon": "Feature coming soon",
  "common.signIn": "Sign In",

  // Auth (Supabase)
  "auth.signInTitle": "Sign in to IRB Platform",
  "auth.signUpTitle": "Create your account",
  "auth.subtitle": "Sign in or create an account to access the platform.",
  "auth.continueGoogle": "Continue with Google",
  "auth.continueApple": "Continue with Apple",
  "auth.continueLinkedIn": "Continue with LinkedIn",
  "auth.orEmail": "or email",
  "auth.fullName": "Full name",
  "auth.email": "Work email",
  "auth.password": "Password (min. 12 characters)",
  "auth.signInButton": "Sign in",
  "auth.signUpButton": "Create account",
  "auth.noAccount": "Don't have an account?",
  "auth.hasAccount": "Already have an account?",
  "auth.signUpLink": "Register",
  "auth.signInLink": "Sign in",
  "auth.checkEmail": "Check your email to confirm your account, then sign in.",
  "auth.failed": "Authentication failed. Please try again.",
  "auth.noSession": "No active session. Please sign in again.",
  "auth.signingIn": "Signing you in…",
  "auth.tryAgain": "Try again",
  "auth.notConfigured": "Sign-in is being updated. Please try again in a few minutes or contact support.",
  "auth.invalidEmail": "Please enter a valid email address.",
  "auth.weakPassword": "Password must be at least 12 characters.",
  "auth.emailExists": "An account with this email already exists. Please sign in.",
  "auth.invalidCredentials": "Invalid email or password.",
  "auth.rateLimited": "Too many attempts. Please wait a few minutes and try again.",
  "auth.networkError": "Network error. Please check your connection and try again.",

  // Declaration Phase 0
  "decl.title": "Declaration of Honesty & Consent",
  "decl.desc": "Before proceeding with your IRB application, you must read and accept the following declarations. These reflect ethical standards aligned with NCBE guidelines, Helsinki, and ICH-GCP.",
  "decl.honesty": "I declare that all information provided in this application is truthful, accurate, and complete to the best of my knowledge.",
  "decl.nbce": "I confirm that I hold a valid NCBE certification or equivalent bioethics training certification.",
  "decl.consent": "I confirm that all participants will be provided with clear, understandable informed consent documents and that their participation will be voluntary.",
  "decl.policy": "I have read and accept the IRB Review Platform Usage Policy and Terms of Service, and I agree to comply with all applicable regulations.",
  "decl.uploadCert": "Upload NCBE Certificate (Optional)",
  "decl.uploadCertDesc": "Upload your NCBE certification or equivalent bioethics training certificate for verification.",
  "decl.allRequired": "All declarations must be accepted to proceed.",
  "decl.proceed": "Accept & Proceed to Stage 1",
  "decl.phase": "Phase 0 of 3",
  "decl.subtitle": "Declaration & Consent",

  // Retraction
  "retract.title": "IRB Approval Retracted",
  "retract.notice": "This IRB approval has been retracted.",
  "retract.reason": "Retraction Reason",
  "retract.date": "Retraction Date",
  "retract.downloadCert": "Download Retraction Certificate",

  // Status additions
  "status.declaration_pending": "Declaration Phase",
  "status.retracted": "Retracted",
  "status.hidden": "Hidden",
};

// ─── Arabic translations ───────────────────────────────────────────────────
const ar: Record<string, string> = {
  // Navigation
  "nav.home": "الرئيسية",
  "nav.apply": "تقديم طلب IRB",
  "nav.verify": "التحقق من IRB",
  "nav.registry": "السجل العام",
  "nav.resources": "الموارد",
  "nav.support": "الدعم",
  "nav.policy": "السياسة",
  "nav.disclaimer": "إخلاء المسؤولية",
  "nav.dashboard": "لوحة التحكم",
  "nav.admin": "لوحة الإدارة",
  "nav.reviews": "مراجعاتي",
  "nav.login": "تسجيل الدخول",
  "nav.logout": "تسجيل الخروج",
  "nav.language": "English",

  // Platform independence notice (always visible)
  "platform.notice":
    "منصة مستقلة للمراجعة الأخلاقية للبحوث في المملكة العربية السعودية، تشغّلها AHSS بإجراءات عمل مدعومة بالذكاء الاصطناعي وشهادات رقمية، وفق الأنظمة السعودية المعمول بها والمعايير الأخلاقية الدولية.",

  // Demo / pilot banner (VITE_PUBLIC_DEMO_BANNER=1)
  "demo.banner":
    "بيئة تجريبية — لا تُدخل بيانات مشاركين حقيقية أو معلومات صحية محمية. هذه النسخة مخصصة للتقييم وجمع الملاحظات فقط.",

  "beta.banner": "نسخة تجريبية مفتوحة · v1.1.0 — قد تتغير الميزات؛ نرحب بملاحظاتكم.",
  "beta.learnMore": "عن المنصة وإخلاء المسؤولية",

  "disclaimer.badge": "نسخة تجريبية مفتوحة · IRB السعودية",
  "disclaimer.title": "إخلاء المسؤولية وعن المنصة",
  "disclaimer.subtitle": "يرجى القراءة قبل استخدام المنصة",
  "disclaimer.aboutFounder": "عن المؤسس",
  "disclaimer.founderBody":
    "د. عبدالسلام العيد طبيب وقائد في أنظمة الرعاية الصحية يبني أدوات تمنح الباحثين هيكلاً واضحاً وإرشاداً صادقاً ومراجعة أخلاقية أسرع — دون أن تحل محل الحكم البشري.",
  "disclaimer.aboutProject": "عن المشروع",
  "disclaimer.projectBody":
    "IRB السعودية منصة مستقلة للمراجعة الأخلاقية بمساعدة الذكاء الاصطناعي تشغّلها جمعية أنظمة الرعاية الصحية المتقدمة (AHSS). تساعد الباحثين على إعداد وتقديم طلبات بأسلوب IRB عبر مسارات شفافة وشهادات رقمية قابلة للتحقق.",
  "disclaimer.operatedBy": "تُشغّلها",
  "disclaimer.openBeta": "نسخة تجريبية مفتوحة",
  "disclaimer.openBetaBody":
    "المنصة في مرحلة تجريبية مفتوحة. قد تتغير المسارات وإرشادات الذكاء الاصطناعي والواجهات. لا تُعامل المخرجات كنصيحة طبية أو قانونية أو أخلاقية أو تنظيمية نهائية. أبلغ عن المشكلات عبر الدعم لنحسّن الخدمة للمجتمع البحثي.",
  "disclaimer.legal": "تنويه مهم",
  "disclaimer.legalBody":
    "IRB السعودية منصة مستقلة لتسهيل الإنتاجية الأكاديمية والمراجعة الأخلاقية. لا تقدّم مشورة طبية أو قانونية أو أخلاقية أو سريرية، وليست جهة IRB رسمية تابعة لـ NCBE. يبقى الباحثون مسؤولين عن الامتثال للأنظمة السعودية المعمول بها ومتطلبات مؤسساتهم.",
  "disclaimer.acknowledge": "أفهم — متابعة",
  "disclaimer.linkedinCta": "زيارة ملف LinkedIn",

  "footer.version": "v1.1.0 · نسخة تجريبية مفتوحة",

  // Hero
  "hero.badge": "منصة مراجعة IRB الرقمية",
  "hero.title": "لجنة أخلاقيات البحث العلمي",
  "hero.subtitle": "منصة الموافقات الأخلاقية للبحوث العلمية",
  "hero.desc": "منصة حديثة مدعومة بالذكاء الاصطناعي تتيح مراجعة أخلاقية سريعة وشفافة ومتوافقة مع المعايير — تختصر مدة الموافقة من أسابيع إلى 24-48 ساعة مع رفع جودة الخدمة وتوسيع نطاقها.",
  "hero.apply": "تقديم طلب موافقة IRB",
  "hero.verify": "التحقق من شهادة IRB",
  "hero.learnMore": "اعرف المزيد",
  "hero.cta.title": "هل أنت مستعد لتقديم بحثك؟",
  "hero.cta.desc": "انضم إلى باحثين من مختلف مناطق المملكة العربية السعودية يحصلون على موافقات IRB بوتيرة أسرع عبر منصتنا.",

  // Stats
  "stats.target": "24-48 ساعة",
  "stats.targetDesc": "وقت الموافقة المستهدف",
  "stats.ai": "ذكاء اصطناعي",
  "stats.aiDesc": "فحص الامتثال",
  "stats.committee": "لجنة علمية",
  "stats.committeeDesc": "لكل طلب",
  "stats.digital": "100% رقمي",
  "stats.digitalDesc": "بدون ورق",

  // Vision/Mission
  "vision.title": "رؤيتنا",
  "vision.text": "أن نكون المنصة الرقمية الرائدة للمراجعة الأخلاقية للبحوث في المملكة العربية السعودية، وأن نرسي معيار الرقابة الأخلاقية على البحوث عبر الابتكار والشفافية والكفاءة — بما يتوافق مع رؤية المملكة 2030.",
  "mission.title": "رسالتنا",
  "mission.text": "تسريع المراجعة الأخلاقية بالاستفادة من الذكاء الاصطناعي والتقنيات الحديثة، بما يضمن حصول كل مشروع بحثي على تقييم شامل وعادل في وقته، مع الالتزام بأعلى معايير أخلاقيات البحث العلمي.",
  "aim.title": "هدفنا",
  "aim.text": "خفض مدة الحصول على موافقة IRB إلى 24-48 ساعة عبر الفحص المسبق بالذكاء الاصطناعي والإسناد التلقائي للجان والشهادات الرقمية، بما يقلّل التكلفة والجهد والتأخير الإجرائي ويعزّز مخرجات البحث.",

  // How It Works
  "how.title": "كيف تعمل المنصة",
  "how.step1.title": "تقديم الطلب",
  "how.step1.desc": "أكمل نموذج الطلب على مرحلتين، مع فحص امتثال بالذكاء الاصطناعي في كل مرحلة.",
  "how.step2.title": "مراجعة اللجنة",
  "how.step2.desc": "يُسند طلبك عشوائيًا إلى خمسة من أعضاء اللجنة، ولكل منهم 24 ساعة لإتمام المراجعة.",
  "how.step3.title": "موافقة الإدارة",
  "how.step3.desc": "عند موافقة ثلاثة أعضاء، يُحال الطلب إلى الإدارة لاتخاذ القرار النهائي.",
  "how.step4.title": "شهادة IRB",
  "how.step4.desc": "بعد اعتماد الطلب، تحصل فورًا على شهادة IRB برقم تسلسلي فريد.",

  // Features
  "features.title": "مميزات المنصة",
  "features.ai.title": "فحص مسبق بالذكاء الاصطناعي",
  "features.ai.desc": "فحوصات امتثال تلقائية وفقًا لإرشادات NCBE وإعلان هلسنكي ومعايير ICH-GCP قبل المراجعة البشرية.",
  "features.fast.title": "معالجة سريعة",
  "features.fast.desc": "إنجاز مستهدف خلال 24-48 ساعة، مع إسناد تلقائي للجان وتتبّع حالة الطلب لحظة بلحظة.",
  "features.secure.title": "آمنة ومتوافقة",
  "features.secure.desc": "تشفير شامل وسجلات تدقيق، وامتثال كامل لأنظمة حماية البيانات في المملكة.",
  "features.digital.title": "شهادات رقمية",
  "features.digital.desc": "شهادات PDF تصدر فورًا بأرقام IRB فريدة، ويمكن التحقق منها عبر البوابة العامة للمنصة.",
  "features.analytics.title": "تحليلات لحظية",
  "features.analytics.desc": "تتيح للمشرفين متابعة المؤشرات وأوقات الاستجابة ومعدلات الموافقة وأداء اللجان لحظة بلحظة.",
  "features.vision.title": "متوافقة مع المعايير",
  "features.vision.desc": "منصة مستقلة من AHSS صُممت بما يدعم إرشادات NCBE الأخلاقية ونظام حماية البيانات الشخصية (PDPL) وإعلان هلسنكي ومعايير ICH-GCP ورؤية 2030.",

  // Footer
  "footer.brand": "منصة مراجعة IRB",
  "footer.desc": "منصة مستقلة للمراجعة الأخلاقية للبحوث في المملكة — إجراءات مدعومة بالذكاء الاصطناعي وشهادات رقمية من AHSS.",
  "footer.independence": "منصة مستقلة لمراجعة الأبحاث الأخلاقية في المملكة العربية السعودية، تُشغّلها AHSS بسير عمل مدعوم بالذكاء الاصطناعي وشهادات رقمية وفق الأنظمة السعودية والمعايير الأخلاقية الدولية.",
  "footer.quickLinks": "روابط سريعة",
  "footer.legal": "قانوني",
  "footer.contact": "اتصل بنا",
  "footer.privacy": "سياسة الخصوصية",
  "footer.terms": "شروط الخدمة",
  "footer.madeWith": "صُنعت بحب في المملكة العربية السعودية",
  "footer.org": "جمعية أنظمة الرعاية الصحية المتقدمة",
  "footer.stamp.ahss": "مستقلة من AHSS",
  "footer.stamp.pdpl": "متوافقة مع PDPL",
  "footer.stamp.nbceGuidelines": "إرشادات NCBE",
  "footer.stamp.helsinki": "هلسنكي",
  "footer.stamp.vision2030": "رؤية 2030",
  "footer.nbceReference": "للاطلاع على لوائح NCBE الرسمية وإرشاداتها، تفضل بزيارة",
  "footer.founded": "أسسها د. عبدالسلام العيد",
  "footer.nbceLink": "اللجنة الوطنية للأخلاقيات الحيوية (NCBE)",
  "footer.vision2030": "رؤية السعودية 2030",
  "footer.feedback": "اقتراحات وشكاوى",
  "footer.feedbackCta": "تواصل مع د. العيد على لينكدإن",
  "footer.copyright": "©",
  "footer.partnership": "للشراكة والتعاون، تواصل معنا عبر لينكدإن.",
  "footer.partnershipCta": "تواصل عبر لينكدإن",

  // Format wizard
  "format.button": "تنسيق",
  "format.chooseTemplate": "اختر النموذج — أجب عن الأسئلة ثم أنشئ المستند",
  "format.wizardBadge": "معالج التنسيق الموجّه",
  "format.prefilledHint": "عُبّئت الحقول مسبقًا من طلبك المحفوظ — راجعها وعدّلها قبل إنشاء المستند.",
  "format.generateTitle": "إنشاء مستندك",
  "format.generatePdf": "إنشاء PDF",
  "format.generateDocx": "إنشاء DOCX",
  "format.missingFields": "لا تزال {n} من الحقول فارغة — يمكنك إنشاء المستند الآن أو إكمالها أولًا.",
  "format.readyToGenerate": "اكتملت جميع الحقول، ويمكنك الآن إنشاء مستندك المختوم.",
  "format.stampNote": "يتضمن كل مستند صادر عن المنصة التوقيع المعتمد للدكتور عبدالسلام العيد وختم المنصة.",
  "format.enterHint": "أدخل:",
  "format.showExample": "عرض مثال مثالي",
  "format.answerPlaceholder": "اكتب إجابتك هنا…",
  "format.filledSection": "نموذج معبّأ مسبقًا (أسئلة وأجوبة)",
  "format.blankSection": "نموذج فارغ (تنزيل يدوي)",
  "format.languageNotice":
    "ستظهر الأسئلة ويصدر الملف باللغة العربية. للتبديل إلى English استخدم مبدّل اللغة في الشريط العلوي — وستتبع الأسئلة وملف PDF/DOCX اللغة التي تختارها.",
  "format.exportLanguage": "لغة التصدير: العربية",
  "format.generateSuccess": "تم إنشاء الملف بنجاح",
  "format.generateError": "تعذّر إنشاء الملف",

  // Theme
  "theme.light": "الوضع الفاتح",
  "theme.dark": "الوضع الداكن",

  // Navigation extras
  "nav.statistics": "إحصائيات",

  // Dashboard
  "dash.title": "طلباتي",
  "dash.welcome": "مرحبًا بعودتك",
  "dash.newApp": "طلب جديد",
  "dash.noApps": "لا توجد طلبات بعد",
  "dash.noAppsDesc": "قدّم طلبك الأول لتبدأ عملية المراجعة الأخلاقية.",
  "dash.startApp": "بدء طلب جديد",
  "dash.status": "الحالة",
  "dash.created": "تاريخ الإنشاء",
  "dash.actions": "الإجراءات",
  "dash.view": "عرض",
  "dash.continue": "متابعة",
  "dash.resubmit": "إعادة تقديم",
  "dash.totalApps": "إجمالي الطلبات",
  "dash.approved": "معتمدة",
  "dash.pending": "قيد المراجعة",
  "dash.drafts": "مسودات",

  // Application Form
  "form.stage1.title": "المرحلة 1: نوع البحث والمعلومات الأساسية",
  "form.stage1.desc": "حدّد نوع البحث وأدخل المعلومات الأساسية للمشروع. يقيّم نظام الذكاء الاصطناعي كل حقل من الحقول.",
  "form.stage2.title": "المرحلة 2: تفاصيل البحث والأخلاقيات",
  "form.stage2.desc": "قدّم المنهجية التفصيلية والاعتبارات الأخلاقية والمستندات الداعمة.",
  "form.researchType": "نوع البحث",
  "form.irbCategory": "فئة المراجعة",
  "form.researchTitle": "عنوان البحث",
  "form.pi": "الباحث الرئيسي",
  "form.piEmail": "البريد الإلكتروني للباحث",
  "form.institution": "المؤسسة",
  "form.department": "القسم",
  "form.funding": "مصدر التمويل",
  "form.duration": "المدة المتوقعة",
  "form.save": "حفظ التقدم",
  "form.runAi": "تشغيل مراجعة الذكاء الاصطناعي",
  "form.next": "المرحلة التالية",
  "form.submit": "تقديم الطلب",
  "form.aiChecking": "الذكاء الاصطناعي يراجع طلبك...",
  "form.aiPassed": "اجتاز مراجعة الذكاء الاصطناعي",
  "form.aiFailed": "فشل في مراجعة الذكاء الاصطناعي",
  "form.score": "النتيجة",
  "form.feedback": "الملاحظات",
  "form.recommendations": "التوصيات",

  // Research Types
  "research.clinical_trial": "تجربة سريرية",
  "research.observational": "دراسة رصدية",
  "research.retrospective": "دراسة استرجاعية",
  "research.survey_questionnaire": "استبيان / استطلاع",
  "research.case_study": "دراسة حالة",
  "research.laboratory": "بحث مختبري",
  "research.educational": "بحث تعليمي",
  "research.social_behavioral": "بحث اجتماعي/سلوكي",
  "research.other": "أخرى",

  // Research-type specific fields
  "form.questionnaire.upload": "رفع ملف الاستبيان",
  "form.questionnaire.required": "(مطلوب للاستبيان/الاستطلاع)",
  "form.retrospective.source": "مصدر البيانات",
  "form.retrospective.required": "(مطلوب للدراسة الاسترجاعية)",
  "form.retrospective.placeholder": "حدد من أين سيتم الحصول على البيانات (مثل: سجلات المستشفى، السجل الوطني...)",
  "form.clinical.details": "تفاصيل التجربة السريرية",
  "form.clinical.optional": "(اختياري)",
  "form.clinical.supplementary": "وثائق تكميلية",
  "form.lab.approval": "موافقة رئيس المختبر",
  "form.lab.name": "اسم رئيس المختبر",
  "form.lab.email": "البريد الإلكتروني لرئيس المختبر",
  "form.lab.phone": "هاتف رئيس المختبر",

  // Stage 2 fields
  "form.objectives": "أهداف البحث",
  "form.methodology": "المنهجية",
  "form.sampleSize": "حجم العينة",
  "form.targetPop": "الفئة المستهدفة",
  "form.inclusion": "معايير الإدراج",
  "form.exclusion": "معايير الاستبعاد",
  "form.dataCollection": "طرق جمع البيانات",
  "form.consent": "عملية الموافقة المستنيرة",
  "form.risk": "تقييم المخاطر",
  "form.benefit": "تقييم الفوائد",
  "form.confidentiality": "إجراءات السرية",
  "form.conflict": "تضارب المصالح",
  "form.rejectionFile": "ملف الرفض السابق (في حالة إعادة التقديم)",

  // Authors
  "authors.title": "مؤلفو البحث / الباحثون المشاركون",
  "authors.add": "إضافة مؤلف",
  "authors.name": "الاسم",
  "authors.email": "البريد الإلكتروني",
  "authors.phone": "الهاتف",
  "authors.institution": "المؤسسة",
  "authors.department": "القسم",
  "authors.country": "الدولة",
  "authors.remove": "حذف",
  "authors.noAuthors": "لم يتم إضافة باحثين مشاركين بعد.",

  // Verify
  "verify.title": "التحقق من شهادة IRB",
  "verify.desc": "أدخل الرقم التسلسلي لـ IRB للتحقق من صحة الشهادة.",
  "verify.placeholder": "أدخل رقم IRB (مثال: IRB-SA-2026-00001)",
  "verify.button": "تحقق",
  "verify.searching": "جاري البحث...",
  "verify.found": "تم التحقق من الشهادة",
  "verify.notFound": "لم يتم العثور على شهادة IRB صالحة بهذا الرقم.",
  "verify.download": "تحميل الشهادة",
  "verify.details": "تفاصيل الشهادة",
  "verify.issuedTo": "صادرة لـ",
  "verify.approvedDate": "تاريخ الموافقة",

  // Resources
  "resources.title": "مركز الموارد",
  "resources.desc": "قم بتحميل النماذج والإرشادات والمواد المرجعية لمساعدتك في إعداد طلب IRB.",
  "resources.templates": "نماذج الطلبات",
  "resources.guidelines": "الإرشادات والمعايير",
  "resources.faq": "الأسئلة الشائعة",
  "resources.download": "تحميل",

  // Support
  "support.title": "مركز الدعم",
  "support.desc": "هل لديك سؤال أو مشكلة أو اقتراح؟ نحن هنا للمساعدة.",
  "support.name": "اسمك",
  "support.email": "بريدك الإلكتروني",
  "support.subject": "الموضوع",
  "support.category": "الفئة",
  "support.message": "الرسالة",
  "support.submit": "إرسال التذكرة",
  "support.success": "تم إرسال تذكرة الدعم بنجاح. سنعود إليك قريبًا.",
  "support.cat.issue": "مشكلة / تقرير خطأ",
  "support.cat.suggestion": "اقتراح",
  "support.cat.question": "سؤال",
  "support.cat.other": "أخرى",
  "support.fillAll": "يرجى ملء جميع الحقول",
  "support.error": "فشل في إرسال التذكرة",
  "support.submitted": "تم إرسال التذكرة",
  "support.submittedDesc": "شكرًا لتواصلك. تم استلام تذكرة الدعم الخاصة بك وسيقوم فريقنا بمراجعتها قريبًا.",
  "support.submitAnother": "إرسال أخرى",
  "support.submitting": "جاري الإرسال...",
  "support.formTitle": "إرسال تذكرة دعم",
  "support.formDesc": "جميع الحقول مطلوبة. نرد عادةً خلال 24 ساعة.",
  "support.namePlaceholder": "الاسم الكامل",
  "support.categoryPlaceholder": "اختر الفئة",
  "support.subjectPlaceholder": "وصف موجز لاستفسارك",
  "support.messagePlaceholder": "يرجى وصف مشكلتك أو اقتراحك أو سؤالك بالتفصيل...",
  "support.catIssue": "الإبلاغ عن مشكلة",
  "support.catSuggestion": "اقتراح",
  "support.catQuestion": "سؤال",
  "support.catOther": "أخرى",

  // Policy
  "policy.title": "سياسة الاستخدام وشروط الخدمة",
  "policy.subtitle": "IRB السعودية — منصة مستقلة من AHSS · PDPL · إرشادات NCBE · هلسنكي · رؤية 2030",

  // Admin
  "admin.title": "لوحة الإدارة",
  "admin.applications": "الطلبات",
  "admin.committee": "اللجنة",
  "admin.tickets": "تذاكر الدعم",
  "admin.reports": "التقارير",
  "admin.auditLog": "سجل التدقيق",
  "admin.stats.total": "إجمالي الطلبات",
  "admin.stats.approved": "معتمدة",
  "admin.stats.rejected": "مرفوضة",
  "admin.stats.pending": "قيد المراجعة",
  "admin.approve": "موافقة",
  "admin.reject": "رفض",
  "admin.resubmit": "السماح بإعادة التقديم",
  "admin.assign": "تعيين يدوي",
  "admin.addMember": "إضافة عضو لجنة",
  "admin.removeMember": "إزالة العضو",
  "admin.exportReport": "تصدير التقرير",
  "admin.monthlyReport": "تقرير شهري",
  "admin.annualReport": "تقرير سنوي",

  // Review
  "review.title": "لوحة مراجعة اللجنة",
  "review.pending": "المراجعات المعلقة",
  "review.history": "سجل المراجعات",
  "review.noPending": "لا توجد مراجعات معلقة حاليًا.",
  "review.approve": "موافقة",
  "review.reject": "رفض",
  "review.comments": "التعليقات (اختياري)",
  "review.expires": "ينتهي في",
  "review.submitted": "تم تقديم المراجعة",

  // Notifications
  "notif.title": "الإشعارات",
  "notif.empty": "لا توجد إشعارات بعد.",
  "notif.markRead": "تحديد كمقروء",
  "notif.markAllRead": "تحديد الكل كمقروء",

  // Status labels
  "status.draft": "مسودة",
  "status.stage1_pending": "مراجعة المرحلة 1",
  "status.stage1_failed": "فشل المرحلة 1",
  "status.stage2_pending": "مراجعة المرحلة 2",
  "status.stage2_failed": "فشل المرحلة 2",
  "status.submitted": "جاهز للتقديم",
  "status.under_review": "قيد مراجعة اللجنة",
  "status.pending_admin": "بانتظار موافقة الإدارة",
  "status.approved": "معتمد",
  "status.rejected": "مرفوض",
  "status.resubmission_required": "مطلوب إعادة تقديم",
  "status.permanently_rejected": "مرفوض نهائيًا",

  // Common
  "common.loading": "جاري التحميل...",
  "common.error": "حدث خطأ",
  "common.back": "رجوع",
  "common.backHome": "العودة للرئيسية",
  "common.save": "حفظ",
  "common.cancel": "إلغاء",
  "common.delete": "حذف",
  "common.edit": "تعديل",
  "common.close": "إغلاق",
  "common.confirm": "تأكيد",
  "common.yes": "نعم",
  "common.no": "لا",
  "common.or": "أو",
  "common.and": "و",
  "common.search": "بحث",
  "common.filter": "تصفية",
  "common.noResults": "لم يتم العثور على نتائج",
  "common.comingSoon": "الميزة قادمة قريبًا",
  "common.signIn": "تسجيل الدخول",

  // Auth (Supabase)
  "auth.signInTitle": "تسجيل الدخول إلى منصة IRB",
  "auth.signUpTitle": "إنشاء حساب",
  "auth.subtitle": "سجّل الدخول أو أنشئ حسابًا للوصول إلى المنصة.",
  "auth.continueGoogle": "المتابعة مع Google",
  "auth.continueApple": "المتابعة مع Apple",
  "auth.continueLinkedIn": "المتابعة مع LinkedIn",
  "auth.orEmail": "أو البريد الإلكتروني",
  "auth.fullName": "الاسم الكامل",
  "auth.email": "البريد المؤسسي",
  "auth.password": "كلمة المرور (12 حرفًا على الأقل)",
  "auth.signInButton": "تسجيل الدخول",
  "auth.signUpButton": "إنشاء حساب",
  "auth.noAccount": "ليس لديك حساب؟",
  "auth.hasAccount": "لديك حساب بالفعل؟",
  "auth.signUpLink": "التسجيل",
  "auth.signInLink": "تسجيل الدخول",
  "auth.checkEmail": "تحقق من بريدك لتأكيد الحساب ثم سجّل الدخول.",
  "auth.failed": "فشل تسجيل الدخول. حاول مرة أخرى.",
  "auth.noSession": "لا توجد جلسة نشطة. سجّل الدخول مرة أخرى.",
  "auth.signingIn": "جاري تسجيل الدخول…",
  "auth.tryAgain": "حاول مرة أخرى",
  "auth.notConfigured": "جاري تحديث تسجيل الدخول. حاول بعد دقائق أو تواصل مع الدعم.",
  "auth.invalidEmail": "يرجى إدخال بريد إلكتروني صالح.",
  "auth.weakPassword": "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل.",
  "auth.emailExists": "يوجد حساب بهذا البريد الإلكتروني بالفعل. يرجى تسجيل الدخول.",
  "auth.invalidCredentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth.rateLimited": "محاولات كثيرة جدًا. يرجى الانتظار بضع دقائق والمحاولة مرة أخرى.",
  "auth.networkError": "خطأ في الشبكة. تحقق من اتصالك وحاول مرة أخرى.",

  // Declaration Phase 0
  "decl.title": "إقرار الصدق والموافقة",
  "decl.desc": "قبل المتابعة في طلب IRB، يجب قراءة وقبول الإقرارات التالية. تعكس معايير أخلاقية متوافقة مع إرشادات NCBE وهلسنكي وICH-GCP.",
  "decl.honesty": "أقر بأن جميع المعلومات المقدمة في هذا الطلب صادقة ودقيقة وكاملة على حد علمي.",
  "decl.nbce": "أؤكد أنني أحمل شهادة NCBE سارية أو شهادة تدريب أخلاقيات حيوية معادلة.",
  "decl.consent": "أؤكد أن جميع المشاركين سيتم تزويدهم بوثائق موافقة مستنيرة واضحة ومفهومة وأن مشاركتهم ستكون طوعية.",
  "decl.policy": "لقد قرأت وأقبل سياسة استخدام منصة مراجعة IRB وشروط الخدمة، وأوافق على الامتثال لجميع اللوائح المعمول بها.",
  "decl.uploadCert": "رفع شهادة NCBE (اختياري)",
  "decl.uploadCertDesc": "ارفع شهادة NCBE أو شهادة تدريب أخلاقيات حيوية معادلة للتحقق.",
  "decl.allRequired": "يجب قبول جميع الإقرارات للمتابعة.",
  "decl.proceed": "قبول والمتابعة إلى المرحلة 1",
  "decl.phase": "المرحلة 0 من 3",
  "decl.subtitle": "الإقرار والموافقة",

  // Retraction
  "retract.title": "تم سحب موافقة IRB",
  "retract.notice": "تم سحب هذه الموافقة على IRB.",
  "retract.reason": "سبب السحب",
  "retract.date": "تاريخ السحب",
  "retract.downloadCert": "تحميل شهادة السحب",

  // Status additions
  "status.declaration_pending": "مرحلة الإقرار",
  "status.retracted": "تم السحب",
  "status.hidden": "مخفي",
};
