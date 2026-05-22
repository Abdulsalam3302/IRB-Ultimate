import { useT } from "@/contexts/LanguageContext";
import { Logo } from "./Logo";
import { Stamp } from "./Stamp";
import { Linkedin } from "lucide-react";
import { AUTHOR } from "@shared/branding";

const LINKEDIN = AUTHOR.linkedin;

export function SiteFooter() {
  const { t } = useT();

  return (
    <footer className="bg-forest-950 text-cream-50 grain">
      <div className="container py-14 grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-5">
          <Logo size={30} tone="cream" />
          <p className="mt-5 text-cream-200/70 text-[14px] leading-relaxed max-w-sm">{t("footer.desc")}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Stamp className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">NBCE aligned</Stamp>
            <Stamp className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">PDPL compliant</Stamp>
            <Stamp className="!bg-cream-50/10 !text-cream-50 !ring-cream-50/15">Vision 2030</Stamp>
          </div>
        </div>
        <div className="col-span-6 md:col-span-2">
          <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">
            {t("footer.quickLinks")}
          </h4>
          <ul className="space-y-2 text-[13.5px] text-cream-50/85">
            <li>{t("nav.dashboard")}</li>
            <li>{t("dash.newApp")}</li>
            <li>{t("nav.resources")}</li>
            <li>{t("nav.verify")}</li>
          </ul>
        </div>
        <div className="col-span-6 md:col-span-2">
          <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">
            {t("footer.legal")}
          </h4>
          <ul className="space-y-2 text-[13.5px] text-cream-50/85">
            <li>{t("footer.terms")}</li>
            <li>{t("footer.privacy")}</li>
            <li>Declaration of Helsinki</li>
            <li>ICH-GCP</li>
          </ul>
        </div>
        <div className="col-span-12 md:col-span-3">
          <h4 className="font-mono uppercase text-[10.5px] tracking-[0.18em] text-cream-50/50 mb-4">
            Partnership
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
        </div>
      </div>
      <div className="border-t border-cream-50/10">
        <div className="container py-5 flex flex-col md:flex-row items-start md:items-center gap-3 justify-between text-[12px] text-cream-50/55">
          <div>
            {t("footer.copyright")} {t("footer.nbce")}
          </div>
          <div className="font-mono uppercase tracking-[0.16em] text-[10.5px]">AHSS · KSA</div>
        </div>
      </div>
    </footer>
  );
}
