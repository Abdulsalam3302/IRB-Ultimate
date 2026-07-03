import { useT } from "@/contexts/LanguageContext";
import { Logo } from "./Logo";
import { Stamp } from "./Stamp";
import { Linkedin, Heart } from "lucide-react";
import { AUTHOR, PLATFORM } from "@shared/branding";
import { useLocation } from "wouter";

const LINKEDIN = AUTHOR.linkedin;
const NCBE_URL = PLATFORM.nbceUrl;
const AHSS_URL = PLATFORM.ahssUrl;

const QUICK_LINKS = [
  ["/dashboard", "nav.dashboard"],
  ["/resources", "nav.resources"],
  ["/verify", "nav.verify"],
  ["/registry", "nav.registry"],
  ["/statistics", "nav.statistics"],
  ["/support", "nav.support"],
  ["/policy", "footer.terms"],
  ["/resources/guideline/privacy-policy", "footer.privacy"],
] as const;

const COMPLIANCE_STAMPS = [
  "footer.stamp.ahss",
  "footer.stamp.pdpl",
  "footer.stamp.nbceGuidelines",
  "footer.stamp.helsinki",
  "footer.stamp.vision2030",
] as const;

export function SiteFooter() {
  const { t, lang } = useT();
  const [, setLocation] = useLocation();
  const isAr = lang === "ar";

  return (
    <footer className="bg-forest-950 text-cream-50 grain">
      <div className="container py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand — one section: platform description + independence, AHSS linked */}
          <div className="md:col-span-5">
            <Logo size={30} tone="cream" />
            <p className="mt-5 text-cream-200/75 text-[13.5px] leading-relaxed max-w-md">
              {t("footer.desc")}{" "}
              {t("footer.independence")}{" "}
              <a
                href={AHSS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 text-cream-50/90 hover:text-jade-400 transition-colors"
              >
                ahss-sa.org
              </a>
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {COMPLIANCE_STAMPS.map((key) => (
                <Stamp key={key} className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">
                  {t(key)}
                </Stamp>
              ))}
            </div>
          </div>

          {/* Quick links — single unified column */}
          <div className="md:col-span-3">
            <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">
              {t("footer.quickLinks")}
            </h4>
            <ul className="space-y-2 text-[13.5px] text-cream-50/85">
              {QUICK_LINKS.map(([href, key]) => (
                <li key={href}>
                  <button type="button" className="hover:text-white transition-colors" onClick={() => setLocation(href)}>
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Partnership */}
          <div className="md:col-span-4">
            <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">
              {t("footer.contact")}
            </h4>
            <p className="text-[13.5px] text-cream-50/85 leading-relaxed mb-4">{t("footer.partnership")}</p>
            <a
              href={LINKEDIN}
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 px-4 rounded-lg bg-cream-50 text-forest-950 font-medium text-[13px] inline-flex items-center gap-2 hover:bg-white transition-colors"
            >
              <Linkedin className="h-3.5 w-3.5" />
              {t("footer.partnershipCta")}
            </a>
            <p className="mt-4 text-[12.5px] text-cream-50/70">{t("footer.feedback")}</p>
            <p className="mt-3 text-[11.5px] text-cream-50/55 leading-relaxed">
              {t("footer.nbceReference")}{" "}
              <a href={NCBE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-jade-400">
                NCBE
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-cream-50/10">
        <div className="container py-8">
          <div className="max-w-2xl mx-auto text-center flex flex-col items-center gap-2.5 text-[12.5px] text-cream-50/75 leading-relaxed">
            <p>
              {t("footer.copyright")}{" "}
              <a
                href={LINKEDIN}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cream-50 font-medium underline underline-offset-2 hover:text-jade-400 transition-colors"
              >
                {isAr ? AUTHOR.nameAr : AUTHOR.nameEn}
              </a>
            </p>
            <a
              href={AHSS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.16em] text-[11px] text-cream-50/80 hover:text-jade-400 transition-colors"
            >
              <img
                src="/ahss-logo.png"
                alt="AHSS — Advanced Healthcare & Service Society"
                className="h-5 w-5 rounded-full bg-white/90 p-px"
                loading="lazy"
              />
              ahss-sa.org
            </a>
            <p className="flex items-center justify-center gap-1.5 text-cream-50/70">
              {t("footer.madeWith")}
              <Heart className="h-3.5 w-3.5 text-jade-400 fill-jade-400/30" aria-hidden="true" />
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
