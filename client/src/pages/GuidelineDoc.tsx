import { Navbar } from "@/components/Navbar";
import { Stamp } from "@/components/design/Stamp";
import { useT } from "@/contexts/LanguageContext";
import { useLocation, useParams } from "wouter";
import { getGuidelineBySlug } from "@shared/guidelineDocs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/design/SiteFooter";

export default function GuidelineDoc() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const doc = slug ? getGuidelineBySlug(slug) : undefined;

  if (!doc) {
    return (
      <div className="min-h-screen bg-cream-50">
        <Navbar showBack backTo="/resources" backLabel={t("nav.resources")} />
        <div className="container py-16 max-w-2xl mx-auto text-center">
          <h1 className="font-display text-2xl font-bold text-forest-900 mb-4">
            {isAr ? "المستند غير موجود" : "Document not found"}
          </h1>
          <Button onClick={() => setLocation("/resources")}>{t("nav.resources")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50">
      <Navbar showBack backTo="/resources" backLabel={t("nav.resources")} />

      <div className="container py-10 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" className="mb-4 -ms-2" onClick={() => setLocation("/resources")}>
          <ArrowLeft className="h-4 w-4 me-1" /> {t("nav.resources")}
        </Button>
        <Stamp>{t("resources.guidelines")}</Stamp>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-forest-900 mt-3 leading-tight">
          {isAr ? doc.titleAr : doc.titleEn}
        </h1>
        <p className="text-ink-soft mt-3 leading-relaxed">{isAr ? doc.descAr : doc.descEn}</p>

        <p className="mt-5 rounded-lg border p-4 text-sm text-ink-soft">{isAr ? "هذا ملخص للإعداد ولا يحل محل النصوص الرسمية أو قرار اللجنة المختصة. راجع المصادر الرسمية والمتطلبات الحالية قبل تطبيقه على دراستك." : "This preparation summary does not replace official texts or the responsible committee’s decision. Check official sources and current requirements before applying it to your study."}</p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm"><a href="https://www.ncbe.kacst.edu.sa" rel="noopener noreferrer" target="_blank" className="underline">NCBE</a><a href="https://sdaia.gov.sa/en/SDAIA/about/Pages/RegulationsAndPolicies.aspx" rel="noopener noreferrer" target="_blank" className="underline">SDAIA / PDPL</a><a href="https://www.wma.net/policies-post/wma-declaration-of-helsinki/" rel="noopener noreferrer" target="_blank" className="underline">{isAr ? "إعلان هلسنكي" : "Declaration of Helsinki"}</a><a href="https://www.ich.org/page/efficacy-guidelines" rel="noopener noreferrer" target="_blank" className="underline">ICH guidelines</a></p>
        <div className="mt-10 space-y-10">
          {doc.sections.map((section, i) => (
            <section key={i}>
              <h2 className="font-display text-xl font-semibold text-forest-900 mb-3">
                {isAr ? section.titleAr : section.titleEn}
              </h2>
              <div className="space-y-3 text-[15px] text-ink-soft leading-relaxed">
                {(isAr ? section.bodyAr : section.bodyEn).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
