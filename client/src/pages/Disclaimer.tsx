import { Navbar } from "@/components/Navbar";
import { SiteFooter } from "@/components/design/SiteFooter";
import { Button } from "@/components/ui/button";
import { useT } from "@/contexts/LanguageContext";
import { AUTHOR, PLATFORM, PLATFORM_DISCLAIMER } from "@shared/branding";
import { acknowledgeDisclaimer } from "@shared/disclaimer";
import { Linkedin, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function Disclaimer() {
  const { t, lang } = useT();
  const [, setLocation] = useLocation();
  const isAr = lang === "ar";

  const continueToApp = () => {
    acknowledgeDisclaimer();
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar showBack backTo="/" backLabel={t("common.backHome")} />

      <main className="container py-12 max-w-3xl mx-auto flex-1">
        <p className="font-mono uppercase text-[11px] tracking-[0.18em] text-muted-foreground mb-3">
          {t("disclaimer.badge")}
        </p>
        <h1 className="text-3xl font-bold mb-2">{t("disclaimer.title")}</h1>
        <p className="text-muted-foreground mb-10">{t("disclaimer.subtitle")}</p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold mb-3">{t("disclaimer.aboutFounder")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("disclaimer.founderBody")}
            </p>
            <a
              href={AUTHOR.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button type="button" variant="outline" className="gap-2">
                <Linkedin className="h-4 w-4" />
                {t("disclaimer.linkedinCta")}
              </Button>
            </a>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t("disclaimer.aboutProject")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              {t("disclaimer.projectBody")}
            </p>
            <p className="text-muted-foreground leading-relaxed text-sm">
              {isAr ? PLATFORM_DISCLAIMER.ar : PLATFORM_DISCLAIMER.en}
            </p>
            <p className="text-muted-foreground leading-relaxed text-sm mt-3">
              {t("disclaimer.operatedBy")}{" "}
              <a
                href={PLATFORM.ahssUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                AHSS · ahss-sa.org
              </a>
            </p>
          </section>

          <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
            <h2 className="text-xl font-semibold mb-3">{t("disclaimer.openBeta")}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("disclaimer.openBetaBody")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t("disclaimer.legal")}</h2>
            <p className="text-muted-foreground leading-relaxed text-sm">
              {t("disclaimer.legalBody")}
            </p>
          </section>

          <div className="border-t pt-8 space-y-6">
            <p className="text-foreground font-medium">
              {isAr
                ? `${AUTHOR.nameAr} ، ${AUTHOR.founderTitleAr}`
                : `${AUTHOR.nameEn}, ${AUTHOR.founderTitleEn}`}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button type="button" size="lg" className="gap-2" onClick={continueToApp}>
                {t("disclaimer.acknowledge")}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <a href={AUTHOR.linkedin} target="_blank" rel="noopener noreferrer">
                <Button type="button" size="lg" variant="outline" className="gap-2 w-full sm:w-auto">
                  <Linkedin className="h-4 w-4" />
                  {t("disclaimer.linkedinCta")}
                </Button>
              </a>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
