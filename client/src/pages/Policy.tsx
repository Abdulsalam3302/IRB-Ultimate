import { Navbar } from "@/components/Navbar";
import { useT } from "@/contexts/LanguageContext";
import { SiteFooter } from "@/components/design/SiteFooter";

const sectionsEn = [
  {
    "title": "1. Purpose and scope",
    "text": "IRB Saudi Arabia is independent software for preparing and managing research ethics applications, initially focused on Saudi Arabia. It does not assert government affiliation or NCBE accreditation. A platform account does not confer authority to conduct research. International expansion is planned from 2027, subject to requirements and operational readiness in each jurisdiction."
  },
  {
    "title": "2. Researcher responsibilities",
    "text": "Provide accurate researcher, institution, protocol, and funding information. Confirm the responsible committee’s authority and your institution’s acceptance before beginning research. Obtain any additional approvals required for the study. Do not fabricate data, signatures, qualifications, or consent."
  },
  {
    "title": "3. AI assistance and human decisions",
    "text": "AI identifies potential gaps, drafts text, and supports assessment. It can be incomplete or wrong. Researchers must review every suggested change. Model analyses, simulated panels, and numerical scores do not constitute human committee votes or ethics approval. Authorized, qualified human reviewers retain responsibility for ethics decisions."
  },
  {
    "title": "4. Review process and timing",
    "text": "Complete the declaration, research information, methodology, ethics safeguards, and supporting documents before submission. Review may require corrections, further evidence, or escalation. The responsible committee determines the applicable pathway and conditions. Review time depends on completeness, risk, and reviewer availability; no approval outcome or turnaround is guaranteed."
  },
  {
    "title": "5. Reviewer appointment and conflicts",
    "text": "Committee participation requires a documented human appointment and verified qualifications. An administrator account or AI persona is not sufficient. Reviewers must assess conflicts of interest and maintain confidentiality. A researcher must not decide their own application. Ethical decision authority and software administration are separate responsibilities."
  },
  {
    "title": "6. Documents, certificates, and verification",
    "text": "Generated templates are drafts for review and do not carry an authorized ethics decision or a reviewer’s signature. Issued decision records must be checked for current status, conditions, dates, and any withdrawal. Verification confirms a platform record; it does not establish institutional or international acceptance. Follow the dates and scope recorded in the actual decision."
  },
  {
    "title": "7. Confidentiality and data minimization",
    "text": "Use protocol-level information and de-identified examples. Do not place patient names, national identifiers, medical records, passwords, or API keys in chat or document generation. Only upload information you are authorized to share. AI requests may be processed by the configured model provider; consult the privacy notice and your institution before sharing restricted information."
  },
  {
    "title": "8. Acceptable use and service limits",
    "text": "Do not attempt unauthorized access, data extraction, impersonation, prompt manipulation to bypass controls, or bulk generation that exceeds service limits. Quotas and temporary restrictions protect users and service availability. Do not automatically replay a submission or generation after an uncertain response; check its state first. Security and audit records may be retained to investigate misuse."
  },
  {
    "title": "9. Amendments, withdrawals, and support",
    "text": "Follow the responsible committee’s requirements for protocol amendments, adverse event reporting, continuing review, and closure. Account deletion does not automatically erase decision and audit records that must be retained. Use the support area for application questions and privacy requests; avoid sharing sensitive study details in public or social messages."
  }
];
const sectionsAr = [
  {
    "title": "1. الغرض والنطاق",
    "text": "منصة IRB السعودية برنامج مستقل لإعداد طلبات أخلاقيات البحث وإدارتها، ويركز في البداية على السعودية. لا تدّعي المنصة التبعية لجهة حكومية أو الاعتماد من اللجنة الوطنية للأخلاقيات الحيوية. ولا يمنح حساب المنصة صلاحية إجراء البحث. يُخطط للتوسع الدولي ابتداءً من 2027 وفق متطلبات كل دولة وجاهزيتها التشغيلية."
  },
  {
    "title": "2. مسؤوليات الباحث",
    "text": "قدّم معلومات دقيقة عن الباحث والمؤسسة والبروتوكول والتمويل. تحقّق من صلاحية اللجنة المختصة وقبول مؤسستك قبل بدء البحث، واحصل على أي موافقات إضافية تتطلبها الدراسة. يُحظر اختلاق البيانات أو التوقيعات أو المؤهلات أو موافقة المشاركين."
  },
  {
    "title": "3. المساعدة بالذكاء الاصطناعي والقرارات البشرية",
    "text": "يساعد الذكاء الاصطناعي على اكتشاف النواقص وصياغة النصوص ودعم التقييم، وقد تكون نتائجه ناقصة أو خاطئة. يجب على الباحث مراجعة كل تعديل مقترح. لا تُعد تحليلات النماذج أو اللجان المحاكاة أو الدرجات العددية أصواتاً للجنة بشرية أو موافقة أخلاقية. وتبقى مسؤولية القرار لدى المراجعين البشريين المؤهلين والمخولين."
  },
  {
    "title": "4. إجراءات المراجعة ومدتها",
    "text": "أكمل الإقرار ومعلومات البحث والمنهجية والضمانات الأخلاقية والمستندات الداعمة قبل التقديم. قد تتطلب المراجعة تصحيحات أو أدلة إضافية أو إحالة للمختصين. وتحدد اللجنة المختصة المسار والشروط المنطبقة. تعتمد المدة على اكتمال الطلب ومخاطره وتوفر المراجعين، ولا تُضمن نتيجة الموافقة أو مدة محددة."
  },
  {
    "title": "5. تعيين المراجعين وتعارض المصالح",
    "text": "تتطلب عضوية اللجنة تعييناً بشرياً موثقاً والتحقق من المؤهلات. ولا يكفي حساب إداري أو شخصية مولّدة بالذكاء الاصطناعي. يلتزم المراجعون بتقييم تعارض المصالح والحفاظ على السرية، ولا يجوز للباحث البت في طلبه. صلاحية القرار الأخلاقي وإدارة البرنامج مسؤوليتان منفصلتان."
  },
  {
    "title": "6. المستندات والشهادات والتحقق",
    "text": "النماذج المنشأة مسودات للمراجعة ولا تحمل قراراً أخلاقياً مخولاً أو توقيع مراجع. يجب التحقق من حالة سجل القرار وشروطه وتواريخه وأي سحب للموافقة. يؤكد التحقق سجل المنصة، ولا يثبت قبوله مؤسسياً أو دولياً. التزم بالتواريخ والنطاق المحددين في القرار الفعلي."
  },
  {
    "title": "7. السرية وتقليل البيانات",
    "text": "استخدم معلومات البروتوكول وأمثلة منزوعة الهوية. لا تُدخل أسماء المرضى أو أرقام الهوية أو السجلات الطبية أو كلمات المرور أو مفاتيح API في المحادثة أو إنشاء المستندات. ارفع فقط ما لديك صلاحية مشاركته. قد تُعالج طلبات الذكاء الاصطناعي لدى المزود المضبوط؛ راجع إشعار الخصوصية ومؤسستك قبل مشاركة المعلومات المقيدة."
  },
  {
    "title": "8. الاستخدام المقبول وحدود الخدمة",
    "text": "يُحظر الوصول غير المخول أو استخراج البيانات أو انتحال الهوية أو التلاعب بالتعليمات لتجاوز الضوابط أو التوليد الجماعي المتجاوز لحدود الخدمة. تحمي الحصص والقيود المؤقتة المستخدمين وتوفر الخدمة. لا تُكرر التقديم أو التوليد آلياً بعد استجابة غير مؤكدة؛ تحقق من حالته أولاً. قد تُحفظ سجلات الأمن والتدقيق للتحقيق في سوء الاستخدام."
  },
  {
    "title": "9. التعديلات وسحب الموافقة والدعم",
    "text": "اتبع متطلبات اللجنة المختصة لتعديل البروتوكول والإبلاغ عن الأحداث الضارة والمراجعة المستمرة وإغلاق الدراسة. لا يؤدي حذف الحساب تلقائياً إلى محو سجلات القرارات والتدقيق الواجب الاحتفاظ بها. استخدم الدعم للاستفسارات وطلبات الخصوصية، وتجنب مشاركة تفاصيل الدراسة الحساسة في الرسائل العامة أو وسائل التواصل."
  }
];

export default function Policy() {
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const sections = isAr ? sectionsAr : sectionsEn;
  // Fixed revision date — a terms page must show when the terms actually
  // changed, not render today's date on every visit. Bump on every edit
  // to the sections above.
  const lastUpdated = new Date("2026-09-05T00:00:00Z");

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo="/" backLabel={t("common.backHome")} />

      <div className="container py-12 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{t("policy.title")}</h1>
        <p className="text-muted-foreground mb-8">{t("policy.subtitle")}</p>

        <div className="prose prose-neutral max-w-none space-y-8">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-xl font-semibold mb-3 text-foreground">{s.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{s.text}</p>
            </section>
          ))}

          <div className="border-t pt-6 mt-10">
            <p className="text-sm text-muted-foreground">
              {isAr ? "آخر تحديث: " : "Last updated: "}{lastUpdated.toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {isAr ? "للاستفسارات حول هذه السياسة، يرجى التواصل مع إدارة لجنة IRB المحلية." : "For questions regarding this policy, please contact the IRB Local Committee administration."}
            </p>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
