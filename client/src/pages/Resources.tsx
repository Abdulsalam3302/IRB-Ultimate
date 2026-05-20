import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Navbar } from "@/components/Navbar";
import { useT } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import {
  FileText, Download, BookOpen, ClipboardList,
  FileCheck, AlertTriangle, Lightbulb, ChevronRight, ExternalLink, ArrowLeft
} from "lucide-react";

// Visual metadata for each downloadable template. The canonical content
// (sections + bilingual body) lives in shared/resources.ts and is served
// via /api/export/resource/<slug>.<pdf|docx>. Adding a new entry here
// also needs a matching slug in shared/resources.ts.
const templates: Array<{
  slug: string;
  titleEn: string; titleAr: string;
  descEn: string; descAr: string;
  icon: typeof FileText; color: string;
}> = [
  {
    slug: "irb-application-form",
    titleEn: "IRB Application Form Template", titleAr: "نموذج طلب IRB",
    descEn: "Complete application form template with all sections required for IRB submission, including PI info, research classification, and ethics declaration.",
    descAr: "نموذج طلب كامل يتضمن جميع الأقسام المطلوبة لتقديم IRB، بما في ذلك معلومات الباحث الرئيسي وتصنيف البحث وإعلان الأخلاقيات.",
    icon: FileText, color: "text-blue-600 bg-blue-100",
  },
  {
    slug: "informed-consent",
    titleEn: "Informed Consent Form Template", titleAr: "نموذج الموافقة المستنيرة",
    descEn: "Template for creating participant informed consent forms compliant with Saudi regulations and NBCE guidelines.",
    descAr: "نموذج لإنشاء نماذج الموافقة المستنيرة للمشاركين متوافقة مع اللوائح السعودية وإرشادات NBCE.",
    icon: FileCheck, color: "text-emerald-600 bg-emerald-100",
  },
  {
    slug: "research-protocol",
    titleEn: "Research Protocol Template", titleAr: "نموذج بروتوكول البحث",
    descEn: "Structured template for writing your research protocol, covering objectives, methodology, ethics, and data management.",
    descAr: "نموذج منظم لكتابة بروتوكول البحث الخاص بك، يغطي الأهداف والمنهجية والأخلاقيات وإدارة البيانات.",
    icon: FileText, color: "text-indigo-600 bg-indigo-100",
  },
  {
    slug: "nbce-ethics-summary",
    titleEn: "NBCE Ethics Guidelines Summary", titleAr: "ملخص إرشادات NBCE الأخلاقية",
    descEn: "Key principles and requirements for ethical research in Saudi Arabia, including informed consent, privacy, and Vision 2030 alignment.",
    descAr: "المبادئ والمتطلبات الرئيسية للبحث الأخلاقي في المملكة العربية السعودية، بما في ذلك الموافقة المستنيرة والخصوصية والتوافق مع رؤية 2030.",
    icon: AlertTriangle, color: "text-amber-600 bg-amber-100",
  },
  {
    slug: "data-collection-instrument",
    titleEn: "Data Collection Instrument Template", titleAr: "نموذج أداة جمع البيانات",
    descEn: "Template for designing questionnaires, surveys, and data collection tools with best practices and example formats.",
    descAr: "نموذج لتصميم الاستبيانات والمسوحات وأدوات جمع البيانات مع أفضل الممارسات وأمثلة التنسيقات.",
    icon: ClipboardList, color: "text-purple-600 bg-purple-100",
  },
];

const guidelines = [
  {
    titleEn: "NBCE Ethical Guidelines for Research", titleAr: "الإرشادات الأخلاقية للجنة الوطنية للأخلاقيات الحيوية",
    descEn: "Official National Bioethics Committee guidelines for conducting ethical research in Saudi Arabia.",
    descAr: "الإرشادات الرسمية للجنة الوطنية للأخلاقيات الحيوية لإجراء البحوث الأخلاقية في المملكة.",
    url: "https://www.ncbe.kacst.edu.sa", type: "Regulation",
  },
  {
    titleEn: "Declaration of Helsinki", titleAr: "إعلان هلسنكي",
    descEn: "World Medical Association ethical principles for medical research involving human subjects.",
    descAr: "المبادئ الأخلاقية للجمعية الطبية العالمية للبحوث الطبية التي تشمل البشر.",
    url: "https://www.wma.net/policies-post/wma-declaration-of-helsinki/", type: "Regulation",
  },
  {
    titleEn: "ICH-GCP Guidelines", titleAr: "إرشادات ICH-GCP",
    descEn: "International Conference on Harmonisation Good Clinical Practice guidelines for clinical trials.",
    descAr: "إرشادات الممارسة السريرية الجيدة للمؤتمر الدولي للتنسيق للتجارب السريرية.",
    url: "https://www.ich.org/page/efficacy-guidelines", type: "Guide",
  },
  {
    titleEn: "Data Privacy & Confidentiality Guide", titleAr: "دليل خصوصية وسرية البيانات",
    descEn: "Guidelines for handling participant data in compliance with Saudi data protection regulations.",
    descAr: "إرشادات للتعامل مع بيانات المشاركين وفقاً لأنظمة حماية البيانات السعودية.",
    url: "#", type: "Guide",
  },
];

const faqs = [
  {
    qEn: "What types of research require IRB approval?", qAr: "ما أنواع البحوث التي تتطلب موافقة IRB؟",
    aEn: "All research involving human subjects, their data, or biological specimens requires IRB review. This includes clinical trials, surveys, observational studies, retrospective chart reviews, and educational research.",
    aAr: "جميع البحوث التي تشمل البشر أو بياناتهم أو عيناتهم البيولوجية تتطلب مراجعة IRB. يشمل ذلك التجارب السريرية والاستبيانات والدراسات الرصدية ومراجعة السجلات بأثر رجعي.",
  },
  {
    qEn: "How long does the IRB review process take?", qAr: "كم تستغرق عملية مراجعة IRB؟",
    aEn: "Our AI-powered platform targets 24-48 hours for standard applications. The AI pre-screening is instant, and committee members have a 24-hour window to respond.",
    aAr: "تستهدف منصتنا المدعومة بالذكاء الاصطناعي 24-48 ساعة للطلبات القياسية. الفحص المسبق بالذكاء الاصطناعي فوري، ولدى أعضاء اللجنة 24 ساعة للرد.",
  },
  {
    qEn: "Can I resubmit a rejected application?", qAr: "هل يمكنني إعادة تقديم طلب مرفوض؟",
    aEn: "Yes, you can resubmit once after a rejection. Upload the rejection feedback file along with your revised application. A second rejection is permanent.",
    aAr: "نعم، يمكنك إعادة التقديم مرة واحدة بعد الرفض. قم بتحميل ملف ملاحظات الرفض مع طلبك المعدل. الرفض الثاني نهائي.",
  },
  {
    qEn: "What is the AI pre-screening?", qAr: "ما هو الفحص المسبق بالذكاء الاصطناعي؟",
    aEn: "The AI evaluates your application against NBCE guidelines, ethical standards, and scientific rigor. A minimum score of 70/100 is required at each stage to proceed.",
    aAr: "يقيّم الذكاء الاصطناعي طلبك وفقاً لإرشادات NBCE والمعايير الأخلاقية والدقة العلمية. يلزم حد أدنى 70/100 في كل مرحلة للمتابعة.",
  },
  {
    qEn: "How are committee reviewers assigned?", qAr: "كيف يتم تعيين مراجعي اللجنة؟",
    aEn: "Five committee members are randomly assigned to each application. The admin can also manually assign specific reviewers if needed. Each reviewer has 24 hours to respond.",
    aAr: "يتم تعيين خمسة أعضاء من اللجنة بشكل عشوائي لكل طلب. يمكن للمسؤول أيضاً تعيين مراجعين محددين يدوياً. لدى كل مراجع 24 ساعة للرد.",
  },
  {
    qEn: "How do I verify an IRB certificate?", qAr: "كيف أتحقق من شهادة IRB؟",
    aEn: "Use the 'Verify IRB' feature on our platform. Enter the IRB serial number and the system will display the certificate details and allow you to download a copy.",
    aAr: "استخدم ميزة 'التحقق من IRB' على منصتنا. أدخل الرقم التسلسلي لـ IRB وسيعرض النظام تفاصيل الشهادة ويسمح لك بتنزيل نسخة.",
  },
];

export default function Resources() {
  const { t, lang } = useT();
  const [, setLocation] = useLocation();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ChevronRight;

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo="/" backLabel={t("common.backHome")} />

      <div className="container py-12 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">{t("resources.title")}</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">{t("resources.title")}</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t("resources.desc")}</p>
        </div>

        {/* Templates */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t("resources.templates")}</h2>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl, i) => (
              <Card key={i} className="group hover:shadow-md transition-all">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`h-9 w-9 rounded-lg ${tpl.color} flex items-center justify-center`}>
                      <tpl.icon className="h-4 w-4" />
                    </div>
                    <Badge variant="secondary" className="text-xs">PDF / DOCX</Badge>
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{isAr ? tpl.titleAr : tpl.titleEn}</h3>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{isAr ? tpl.descAr : tpl.descEn}</p>
                  {/* Both downloads are content-addressable by slug and rendered
                      server-side from shared/resources.ts. No external CDN
                      dependency — the platform owns its canonical content. */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/export/resource/${tpl.slug}.pdf`} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3 w-3 me-1" /> PDF
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/export/resource/${tpl.slug}.docx`} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3 w-3 me-1" /> DOCX
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="mb-12" />

        {/* Guidelines */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t("resources.guidelines")}</h2>
            </div>
          </div>
          <div className="grid gap-3">
            {guidelines.map((g, i) => (
              <Card key={i} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {g.type === "Regulation" ? <AlertTriangle className="h-4 w-4 text-amber-600" /> :
                         <Lightbulb className="h-4 w-4 text-blue-600" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{isAr ? g.titleAr : g.titleEn}</h3>
                          <Badge variant="outline" className="text-xs shrink-0">{g.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{isAr ? g.descAr : g.descEn}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => window.open(g.url, "_blank")}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="mb-12" />

        {/* FAQ */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t("resources.faq")}</h2>
            </div>
          </div>
          <div className="grid gap-4">
            {faqs.map((faq, i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-4">
                  <h3 className="font-semibold text-sm mb-2 flex items-start gap-2">
                    <span className="text-primary font-bold">Q:</span>
                    {isAr ? faq.qAr : faq.qEn}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed ps-5">{isAr ? faq.aAr : faq.aEn}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="py-8 text-center">
            <h3 className="text-xl font-bold mb-2">
              {isAr ? "هل أنت مستعد لتقديم طلبك؟" : "Ready to Submit Your Application?"}
            </h3>
            <p className="text-primary-foreground/80 mb-4">
              {isAr ? "استخدم النماذج أعلاه لإعداد طلبك، ثم ابدأ عملية التقديم." : "Use the templates above to prepare your application, then start the submission process."}
            </p>
            <Button variant="secondary" size="lg" onClick={() => setLocation("/dashboard")}>
              {t("hero.apply")} <Arrow className="h-4 w-4 ms-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
