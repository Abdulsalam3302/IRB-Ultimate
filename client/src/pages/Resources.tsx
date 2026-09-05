import { PLATFORM_FAQS } from "@shared/platformFaqs";
import { Separator } from "@/components/ui/separator";
import { Navbar } from "@/components/Navbar";
import { ResourceTemplateCard } from "@/components/design/ResourceTemplateCard";
import { Stamp } from "@/components/design/Stamp";
import { useAuth } from "@/_core/hooks/useAuth";
import { useT } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { GUIDELINE_DOCS } from "@shared/guidelineDocs";
import {
  FileText, BookOpen, ClipboardList, FileCheck, AlertTriangle, Scale, ChevronRight, ArrowLeft,
} from "lucide-react";
import { SiteFooter } from "@/components/design/SiteFooter";

const templates: Array<{
  slug: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  icon: typeof FileText;
}> = [
  {
    slug: "irb-application-form",
    titleEn: "IRB Application Form",
    titleAr: "نموذج طلب IRB",
    descEn: "PI details, classification, and ethics declaration.",
    descAr: "بيانات الباحث الرئيسي والتصنيف وإعلان الأخلاقيات.",
    icon: FileText,
  },
  {
    slug: "informed-consent",
    titleEn: "Informed Consent Form",
    titleAr: "نموذج الموافقة المستنيرة",
    descEn: "Draft participant consent for committee review.",
    descAr: "مسودة موافقة المشاركين لمراجعة اللجنة.",
    icon: FileCheck,
  },
  {
    slug: "research-protocol",
    titleEn: "Research Protocol",
    titleAr: "بروتوكول البحث",
    descEn: "Objectives, methodology, ethics, and data management.",
    descAr: "الأهداف والمنهجية والأخلاقيات وإدارة البيانات.",
    icon: FileText,
  },
  {
    slug: "nbce-ethics-summary",
    titleEn: "NCBE Ethics Summary",
    titleAr: "ملخص أخلاقيات NCBE",
    descEn: "Key principles for ethical research in KSA.",
    descAr: "المبادئ الأساسية للبحث الأخلاقي في المملكة.",
    icon: AlertTriangle,
  },
  {
    slug: "data-collection-instrument",
    titleEn: "Data Collection Instrument",
    titleAr: "أداة جمع البيانات",
    descEn: "Questionnaires and survey instruments.",
    descAr: "الاستبيانات وأدوات جمع البيانات.",
    icon: ClipboardList,
  },
];

const legalLinks = [
  { href: "/policy", titleEn: "Terms of Service", titleAr: "شروط الخدمة", icon: Scale },
  { href: "/resources/guideline/privacy-policy", titleEn: "Privacy Policy", titleAr: "سياسة الخصوصية", icon: Scale },
  { href: "/resources/guideline/declaration-of-helsinki", titleEn: "Declaration of Helsinki", titleAr: "إعلان هلسنكي", icon: BookOpen },
  { href: "/resources/guideline/ich-gcp", titleEn: "ICH-GCP", titleAr: "إرشادات ICH-GCP", icon: BookOpen },
];

const faqs = PLATFORM_FAQS;

export default function Resources() {
  const { t, lang } = useT();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ChevronRight;

  const { data: myApps } = trpc.application.myApplications.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const latestDraft = myApps?.find(a =>
    ["draft", "stage1_pending", "stage2_pending", "stage2_failed", "submitted"].includes(a.status),
  );

  return (
    <div className="min-h-screen bg-cream-50">
      <Navbar showBack backTo="/" backLabel={t("common.backHome")} />

      <div className="container py-10 max-w-6xl mx-auto">
        <Stamp>{t("resources.title")}</Stamp>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-forest-900 tracking-tight mt-3 leading-tight">
          {t("resources.title")}
        </h1>
        <p className="text-ink-soft text-[15.5px] mt-3 max-w-xl leading-relaxed">{t("resources.desc")}</p>

        <section className="mt-10 mb-12">
          <h2 className="font-display text-xl font-bold text-forest-900 mb-5">{t("resources.templates")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {templates.map(tpl => (
              <ResourceTemplateCard
                key={tpl.slug}
                slug={tpl.slug}
                titleEn={tpl.titleEn}
                titleAr={tpl.titleAr}
                descEn={tpl.descEn}
                descAr={tpl.descAr}
                appId={latestDraft?.id}
                icon={<tpl.icon className="h-5 w-5" />}
              />
            ))}
          </div>
        </section>

        <Separator className="mb-12" />

        <section className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-forest-50 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-forest-900" />
            </div>
            <h2 className="font-display text-xl font-bold text-forest-900">{t("resources.guidelines")}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {GUIDELINE_DOCS.map(g => (
              <button
                key={g.slug}
                type="button"
                onClick={() => setLocation(`/resources/guideline/${g.slug}`)}
                className="irb-card p-4 flex items-start gap-3 hover:shadow-lift transition-shadow text-start w-full"
              >
                <span className="w-10 h-10 rounded-lg bg-cream-100 text-forest-900 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-forest-900 leading-snug">
                    {isAr ? g.titleAr : g.titleEn}
                  </div>
                  <div className="text-[11.5px] text-ink-muted mt-1 line-clamp-2">
                    {isAr ? g.descAr : g.descEn}
                  </div>
                </div>
                <Arrow className="h-4 w-4 text-ink-muted shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </section>

        <Separator className="mb-12" />

        <section className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-forest-50 flex items-center justify-center">
              <Scale className="h-5 w-5 text-forest-900" />
            </div>
            <h2 className="font-display text-xl font-bold text-forest-900">{t("footer.legal")}</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {legalLinks.map(link => (
              <button
                key={link.href}
                type="button"
                onClick={() => setLocation(link.href)}
                className="irb-card p-4 flex items-center gap-3 hover:shadow-lift transition-shadow text-start"
              >
                <link.icon className="h-4 w-4 text-forest-900 shrink-0" />
                <span className="text-[13.5px] font-medium text-forest-900">
                  {isAr ? link.titleAr : link.titleEn}
                </span>
                <Arrow className="h-4 w-4 text-ink-muted ms-auto" />
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-ink-muted mt-4">
            {isAr
              ? "للاطلاع على سياسة استخدام المنصة الكاملة، راجع "
              : "For the full platform usage policy, see "}
            <button type="button" className="text-forest-900 font-medium underline underline-offset-2" onClick={() => setLocation("/policy")}>
              {t("policy.title")}
            </button>
          </p>
        </section>

        <Separator className="mb-12" />

        <section>
          <h2 className="font-display text-xl font-bold text-forest-900 mb-5">{t("resources.faq")}</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="irb-card p-5">
                <h3 className="font-medium text-forest-900 text-[15px]">{isAr ? faq.qAr : faq.qEn}</h3>
                <p className="text-[13.5px] text-ink-soft mt-2 leading-relaxed">{isAr ? faq.aAr : faq.aEn}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
