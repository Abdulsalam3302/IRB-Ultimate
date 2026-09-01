import { Navbar } from "@/components/Navbar";
import { useT } from "@/contexts/LanguageContext";
import { SiteFooter } from "@/components/design/SiteFooter";

const sectionsEn = [
  { title: "1. Purpose and Scope", text: "IRB Saudi Arabia is the official digital Institutional Review Board of the National Committee of BioEthics (NCBE) of Saudi Arabia, operated with Advanced Healthcare Systems Society (AHSS · ahss-sa.org). The platform reviews research involving human subjects for researchers and institutions in the Kingdom, in compliance with PDPL, NCBE ethical guidelines, the Declaration of Helsinki, ICH-GCP, and Saudi Vision 2030 digitalization goals." },
  { title: "2. Eligibility and Registration", text: "Any qualified researcher affiliated with a recognized institution in Saudi Arabia may submit an IRB application through this platform. Users must provide accurate personal and institutional information during registration. Misrepresentation of credentials, affiliations, or research details constitutes a violation of these terms and may result in permanent account suspension and referral to relevant authorities." },
  { title: "3. Application Process", text: "The application process consists of two stages. Stage 1 requires classification of the research type and basic project information. Stage 2 requires detailed methodology, ethics considerations, and supporting documentation. Each stage undergoes an AI-powered compliance check that evaluates adherence to NCBE guidelines, the Declaration of Helsinki, the Belmont Report, and ICH-GCP standards. A minimum score of 70/100 is required at each stage to proceed." },
  { title: "4. AI-Powered Review", text: "The platform employs artificial intelligence to pre-screen applications for compliance and completeness, then runs an official digital review pathway (AI Swarm and four designated digital reviewers). When the swarm or the unanimous four-reviewer panel passes, the platform issues official approval and an IRB certificate. When both fail, the platform owner is alerted for manual action. AI scores and feedback are provided to help applicants improve their submissions." },
  { title: "5. Committee Review Process", text: "Upon successful AI pre-screening, applications are randomly assigned to five (5) committee members for independent review. Committee members have twenty-four (24) hours to submit their review decision. If a committee member fails to respond within the allotted time, their review assignment expires. A minimum of three (3) approvals from committee members is required for an application to advance to final administrative approval." },
  { title: "6. Rejection and Resubmission Policy", text: "If an application is rejected, the applicant will receive detailed feedback explaining the reasons for rejection. Applicants are permitted one (1) resubmission opportunity. During resubmission, applicants may upload the rejection documentation for comparison. If an application is rejected a second time, the rejection becomes permanent and no further submissions for the same research protocol will be accepted." },
  { title: "7. IRB Certification", text: "Upon final approval, the platform generates a unique IRB certificate with a verifiable IRB number. This certificate is valid for one (1) year from the date of issuance unless otherwise specified. Researchers must apply for renewal before the expiration date. The IRB number must be referenced in all publications, presentations, and reports arising from the approved research." },
  { title: "8. Confidentiality and Data Protection", text: "All information submitted through this platform is treated as confidential. The platform complies with Saudi Arabia's Personal Data Protection Law (PDPL) and applicable international data protection standards. Committee members are bound by confidentiality agreements and may not disclose application details to third parties." },
  { title: "9. Committee Member Obligations", text: "Committee members appointed by the administrator are expected to review assigned applications promptly and impartially. Members must declare any conflicts of interest before reviewing an application. Failure to respond within the 24-hour review window will result in the assignment being marked as expired. Repeated non-responsiveness may result in removal from the committee." },
  { title: "10. Administrator Authority", text: "The platform administrator has authority to manage committee membership, override random assignments, make final approval or rejection decisions, and access platform metrics and audit logs on behalf of AHSS. The administrator ensures operations follow applicable Saudi regulations and international ethical standards referenced on this platform." },
  { title: "11. Compliance with Regulations", text: "All users of this platform must comply with the regulations set forth by the National Committee of BioEthics (NCBE) of Saudi Arabia, the Saudi Food and Drug Authority (SFDA) where applicable, and international ethical research standards including the Declaration of Helsinki (2024 revision), the Belmont Report, ICH Guidelines for Good Clinical Practice (ICH-GCP), and the Council for International Organizations of Medical Sciences (CIOMS) guidelines." },
  { title: "12. Amendments and Updates", text: "This policy may be updated periodically to reflect changes in regulations, technology, or operational procedures. Users will be notified of significant changes through the platform. Continued use of the platform after policy updates constitutes acceptance of the revised terms." },
];

const sectionsAr = [
  { title: "١. الغرض والنطاق", text: "IRB السعودية هي المنصة الرقمية الرسمية للجنة أخلاقيات البحث المؤسسية التابعة للجنة الوطنية للأخلاقيات الحيوية (NCBE)، وتُشغَّل مع جمعية أنظمة الرعاية الصحية المتقدمة (AHSS · ahss-sa.org). تراجع البحوث التي تشمل البشر وفق PDPL وإرشادات NCBE الأخلاقية وإعلان هلسنكي وICH-GCP ورؤية 2030." },
  { title: "٢. الأهلية والتسجيل", text: "يحق لأي باحث مؤهل تابع لمؤسسة معترف بها في المملكة العربية السعودية تقديم طلب IRB عبر هذه المنصة. يجب على المستخدمين تقديم معلومات شخصية ومؤسسية دقيقة أثناء التسجيل. يعتبر تحريف المؤهلات أو الانتماءات أو تفاصيل البحث انتهاكاً لهذه الشروط." },
  { title: "٣. عملية التقديم", text: "تتكون عملية التقديم من مرحلتين. المرحلة الأولى تتطلب تصنيف نوع البحث والمعلومات الأساسية للمشروع. المرحلة الثانية تتطلب المنهجية التفصيلية والاعتبارات الأخلاقية والوثائق الداعمة. تخضع كل مرحلة لفحص امتثال مدعوم بالذكاء الاصطناعي. يلزم حد أدنى 70/100 في كل مرحلة للمتابعة." },
  { title: "٤. المراجعة بالذكاء الاصطناعي", text: "تستخدم المنصة الذكاء الاصطناعي لفحص الطلبات ثم مساراً رقمياً رسمياً (سرب الذكاء الاصطناعي وأربعة مراجعين رقميين معيّنين). عند اجتياز السرب أو إجماع المراجعين الأربعة تُصدر الموافقة الرسمية وشهادة IRB. عند فشل الاثنين يُنبَّه مالك المنصة للمراجعة اليدوية." },
  { title: "٥. عملية مراجعة اللجنة", text: "عند اجتياز الفحص المسبق بالذكاء الاصطناعي، يتم تعيين الطلبات عشوائياً لخمسة (5) أعضاء من اللجنة للمراجعة المستقلة. لدى أعضاء اللجنة أربع وعشرون (24) ساعة لتقديم قرار المراجعة. يلزم حد أدنى من ثلاث (3) موافقات لتقدم الطلب إلى الموافقة الإدارية النهائية." },
  { title: "٦. سياسة الرفض وإعادة التقديم", text: "في حالة رفض الطلب، سيتلقى المتقدم ملاحظات مفصلة توضح أسباب الرفض. يُسمح للمتقدمين بفرصة إعادة تقديم واحدة (1). في حالة رفض الطلب مرة ثانية، يصبح الرفض نهائياً ولا يُقبل أي تقديم إضافي لنفس بروتوكول البحث." },
  { title: "٧. شهادة IRB", text: "عند الموافقة النهائية، تُنشئ المنصة شهادة IRB فريدة برقم IRB قابل للتحقق. هذه الشهادة صالحة لمدة سنة واحدة (1) من تاريخ الإصدار ما لم يُحدد خلاف ذلك. يجب الإشارة إلى رقم IRB في جميع المنشورات والعروض والتقارير الناتجة عن البحث المعتمد." },
  { title: "٨. السرية وحماية البيانات", text: "تُعامل جميع المعلومات المقدمة عبر هذه المنصة على أنها سرية. تتوافق المنصة مع نظام حماية البيانات الشخصية في المملكة العربية السعودية (PDPL) ومعايير حماية البيانات الدولية المعمول بها." },
  { title: "٩. التزامات أعضاء اللجنة", text: "يُتوقع من أعضاء اللجنة المعينين من قبل المسؤول مراجعة الطلبات المسندة بسرعة وحيادية. يجب على الأعضاء الإفصاح عن أي تضارب في المصالح قبل مراجعة الطلب. عدم الاستجابة المتكرر قد يؤدي إلى الإزالة من اللجنة." },
  { title: "١٠. صلاحيات المسؤول", text: "يتمتع مسؤول المنصة بالصلاحية الكاملة لإدارة عضوية اللجنة، وتجاوز التعيينات العشوائية، واتخاذ قرارات الموافقة أو الرفض النهائية، والوصول إلى جميع مقاييس المنصة وسجلات التدقيق." },
  { title: "١١. الامتثال للوائح", text: "يجب على جميع مستخدمي هذه المنصة الامتثال للوائح الصادرة عن اللجنة الوطنية للأخلاقيات الحيوية في المملكة العربية السعودية، وهيئة الغذاء والدواء السعودية (SFDA) حيثما ينطبق، والمعايير الأخلاقية الدولية للبحوث بما في ذلك إعلان هلسنكي وتقرير بلمونت وإرشادات ICH-GCP." },
  { title: "١٢. التعديلات والتحديثات", text: "قد يتم تحديث هذه السياسة بشكل دوري لتعكس التغييرات في اللوائح أو التكنولوجيا أو الإجراءات التشغيلية. سيتم إخطار المستخدمين بالتغييرات الجوهرية عبر المنصة. يعتبر الاستمرار في استخدام المنصة بعد تحديثات السياسة قبولاً للشروط المعدلة." },
];

export default function Policy() {
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const sections = isAr ? sectionsAr : sectionsEn;
  // Fixed revision date — a terms page must show when the terms actually
  // changed, not render today's date on every visit. Bump on every edit
  // to the sections above.
  const lastUpdated = new Date("2026-09-01T00:00:00Z");

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
