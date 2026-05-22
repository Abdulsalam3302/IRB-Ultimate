import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Navbar } from "@/components/Navbar";
import { ResourceTemplateCard } from "@/components/design/ResourceTemplateCard";
import { Stamp } from "@/components/design/Stamp";
import { useAuth } from "@/_core/hooks/useAuth";
import { useT } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  FileText, BookOpen, ClipboardList, FileCheck, AlertTriangle,
} from "lucide-react";

const templates: Array<{
  slug: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  refTag: string;
  icon: typeof FileText;
}> = [
  {
    slug: "irb-application-form",
    titleEn: "IRB Application Form Template",
    titleAr: "نموذج طلب IRB",
    descEn: "Complete application form with PI info, research classification, and ethics declaration.",
    descAr: "نموذج طلب كامل يتضمن معلومات الباحث الرئيسي وتصنيف البحث وإعلان الأخلاقيات.",
    refTag: "NBCE §1",
    icon: FileText,
  },
  {
    slug: "informed-consent",
    titleEn: "Informed Consent Form Template",
    titleAr: "نموذج الموافقة المستنيرة",
    descEn: "Participant consent aligned with Saudi regulations and NBCE guidelines.",
    descAr: "موافقة مشاركين متوافقة مع اللوائح السعودية وإرشادات NBCE.",
    refTag: "NBCE §4.2",
    icon: FileCheck,
  },
  {
    slug: "research-protocol",
    titleEn: "Research Protocol Template",
    titleAr: "نموذج بروتوكول البحث",
    descEn: "Structured protocol covering objectives, methodology, ethics, and data management.",
    descAr: "بروتوكول منظم يغطي الأهداف والمنهجية والأخلاقيات وإدارة البيانات.",
    refTag: "NBCE §3",
    icon: FileText,
  },
  {
    slug: "nbce-ethics-summary",
    titleEn: "NBCE Ethics Guidelines Summary",
    titleAr: "ملخص إرشادات NBCE الأخلاقية",
    descEn: "Key principles for ethical research in Saudi Arabia.",
    descAr: "المبادئ الرئيسية للبحث الأخلاقي في المملكة العربية السعودية.",
    refTag: "NBCE",
    icon: AlertTriangle,
  },
  {
    slug: "data-collection-instrument",
    titleEn: "Data Collection Instrument Template",
    titleAr: "نموذج أداة جمع البيانات",
    descEn: "Questionnaires and data collection tools with best practices.",
    descAr: "استبيانات وأدوات جمع البيانات مع أفضل الممارسات.",
    refTag: "PDPL",
    icon: ClipboardList,
  },
];

const guidelines = [
  {
    titleEn: "NBCE Ethical Guidelines for Research",
    titleAr: "الإرشادات الأخلاقية للجنة الوطنية للأخلاقيات الحيوية",
    descEn: "Official National Bioethics Committee guidelines.",
    descAr: "الإرشادات الرسمية للجنة الوطنية للأخلاقيات الحيوية.",
    url: "https://www.ncbe.kacst.edu.sa",
  },
  {
    titleEn: "Declaration of Helsinki",
    titleAr: "إعلان هلسنكي",
    descEn: "World Medical Association ethical principles.",
    descAr: "المبادئ الأخلاقية للجمعية الطبية العالمية.",
    url: "https://www.wma.net/policies-post/wma-declaration-of-helsinki/",
  },
  {
    titleEn: "ICH-GCP Guidelines",
    titleAr: "إرشادات ICH-GCP",
    descEn: "Good Clinical Practice for clinical trials.",
    descAr: "الممارسة السريرية الجيدة للتجارب السريرية.",
    url: "https://www.ich.org/page/efficacy-guidelines",
  },
];

export default function Resources() {
  const { t, lang } = useT();
  const { isAuthenticated } = useAuth();
  const isAr = lang === "ar";

  const { data: myApps } = trpc.application.myApplications.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const latestDraft = myApps?.find(a =>
    ["draft", "stage1_complete", "stage2_complete", "submitted"].includes(a.status),
  );

  return (
    <div className="min-h-screen bg-cream-50">
      <Navbar showBack backTo="/" backLabel={t("common.backHome")} />

      <div className="container py-10 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-6 mb-10">
          <div className="lg:col-span-7">
            <Stamp>{t("resources.title")}</Stamp>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-forest-900 tracking-tight mt-3 leading-tight">
              {isAr ? "كل نموذج، بطريقتين." : "Every template, two ways."}
            </h1>
            <p className="text-ink-soft text-[15.5px] mt-3 max-w-xl leading-relaxed">{t("resources.desc")}</p>
          </div>
          <div className="lg:col-span-5 irb-card p-6 bg-forest-50/60">
            <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">
              {isAr ? "كيف أختار؟" : "How do I choose?"}
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-[12.5px]">
              <div>
                <div className="font-medium text-forest-900 mb-1">A · {t("format.blankSection")}</div>
                <div className="text-ink-soft leading-snug">
                  {isAr ? "للاستخدام الخارجي أو إن لم يكن لديك طلب بعد." : "For external use or if you don't have an application yet."}
                </div>
              </div>
              <div>
                <div className="font-medium text-forest-900 mb-1">B · {t("format.filledSection")}</div>
                <div className="text-ink-soft leading-snug">
                  {isAr ? "للمخرجات الجاهزة للتقديم مع ختم د. العيد." : "For submission-ready, stamped output linked to your IRB number."}
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="mb-12">
          <h2 className="font-display text-xl font-bold text-forest-900 mb-6">{t("resources.templates")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {templates.map(tpl => (
              <ResourceTemplateCard
                key={tpl.slug}
                slug={tpl.slug}
                titleEn={tpl.titleEn}
                titleAr={tpl.titleAr}
                descEn={tpl.descEn}
                descAr={tpl.descAr}
                refTag={tpl.refTag}
                appId={latestDraft?.id}
                icon={<tpl.icon className="h-5 w-5" />}
              />
            ))}
          </div>
        </section>

        <Separator className="mb-12" />

        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-forest-50 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-forest-900" />
            </div>
            <h2 className="font-display text-xl font-bold text-forest-900">{t("resources.guidelines")}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guidelines.map((g, i) => (
              <a
                key={i}
                href={g.url}
                target="_blank"
                rel="noopener noreferrer"
                className="irb-card p-4 flex items-start gap-3 hover:shadow-lift transition-shadow"
              >
                <span className="w-10 h-10 rounded-lg bg-cream-100 text-forest-900 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-forest-900 leading-snug">
                    {isAr ? g.titleAr : g.titleEn}
                  </div>
                  <div className="text-[11.5px] text-ink-muted mt-1">{isAr ? g.descAr : g.descEn}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
