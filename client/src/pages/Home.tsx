import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/design/Logo";
import { Stamp } from "@/components/design/Stamp";
import { SiteFooter } from "@/components/design/SiteFooter";
import { useT } from "@/contexts/LanguageContext";
import {
  Shield, Brain, FileCheck, Users, ArrowRight,
  Target, Eye, Lightbulb, BarChart3, Globe,
  ChevronRight, Search, Sparkles, ArrowLeft, Check, Scale, Zap,
} from "lucide-react";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { t, isRtl } = useT();

  const handleStartApplication = () => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    } else {
      window.location.href = getLoginUrl();
    }
  };

  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;
  const ChevronIcon = isRtl ? ArrowLeft : ChevronRight;

  return (
    <div className="min-h-screen bg-cream-50">
      <nav className="sticky top-0 z-50 glass border-b border-forest-900/10">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Logo size={32} />
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageToggle />
            <Button variant="ghost" size="sm" onClick={() => setLocation("/verify")} className="hidden sm:inline-flex">
              <Search className="h-3.5 w-3.5 me-1" /> {t("nav.verify")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/resources")} className="hidden md:inline-flex">
              {t("nav.resources")}
            </Button>
            {isAuthenticated ? (
              <Button size="sm" className="bg-forest-900 hover:bg-forest-800 text-cream-50" onClick={() => setLocation("/dashboard")}>
                {t("nav.dashboard")} <ChevronIcon className="h-4 w-4 ms-1" />
              </Button>
            ) : (
              <Button size="sm" className="bg-forest-900 hover:bg-forest-800 text-cream-50" onClick={() => { window.location.href = getLoginUrl(); }}>
                {t("nav.login")} <ChevronIcon className="h-4 w-4 ms-1" />
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero — design v0.2 */}
      <section className="relative grain overflow-hidden bg-gradient-to-b from-white to-[#f6faf8]">
        <div className="absolute -end-40 -top-20 w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.10),transparent_60%)]" />
        <div className="container relative py-20 lg:py-28 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <Stamp>{t("hero.badge")}</Stamp>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-forest-900 leading-[1.05] mt-6">
              {t("hero.subtitle")}
            </h1>
            <p className="mt-6 text-lg text-ink-soft max-w-xl leading-relaxed">{t("hero.desc")}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="bg-forest-900 hover:bg-forest-800 text-cream-50 h-12 px-8" onClick={handleStartApplication}>
                {t("hero.apply")} <ArrowIcon className="ms-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 ring-forest-900/15" onClick={() => setLocation("/verify")}>
                <Shield className="h-4 w-4 me-2" /> {t("hero.verify")}
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-4 text-[12.5px] text-ink-muted">
              {[t("footer.stamp.pdpl"), t("footer.stamp.nbceGuidelines"), t("footer.stamp.helsinki")].map(item => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-jade-600" /> {item}
                </span>
              ))}
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="irb-card p-8 shadow-lift relative">
              <div className="absolute -top-4 -start-4 z-10">
                <div className="seal">{isRtl ? "مختوم · معتمد" : "Stamped · Approved"}</div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">
                    {isRtl ? "شهادة موافقة IRB" : "Certificate of IRB approval"}
                  </div>
                  <div className="font-display text-xl font-semibold text-forest-900 mt-1 num">SA-2026-04188</div>
                </div>
                <Logo size={36} withText={false} />
              </div>
              <div className="hair h-px my-5" />
              <dl className="grid grid-cols-2 gap-y-2 text-[12.5px]">
                <dt className="text-ink-muted">{isRtl ? "القرار" : "Decision"}</dt>
                <dd className="text-jade-700 font-semibold flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> {isRtl ? "موافق" : "Approved"}
                </dd>
                <dt className="text-ink-muted">{isRtl ? "الجهة المعتمدة" : "Authority"}</dt>
                <dd className="text-forest-900 font-medium">Dr. Abdulsalam Aleid</dd>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Stat band */}
      <section className="border-y border-forest-900/10 bg-cream-50">
        <div className="container py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            [t("stats.target"), t("stats.targetDesc")],
            [t("stats.ai"), t("stats.aiDesc")],
            [t("stats.committee"), t("stats.committeeDesc")],
            [t("stats.digital"), t("stats.digitalDesc")],
          ].map(([v, sub], i) => (
            <div key={i}>
              <div className="font-display text-3xl font-bold text-forest-900 num">{v}</div>
              <div className="text-[12.5px] text-ink-soft mt-1">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Vision, Mission, Aim — Apple-style cards */}
      <section className="py-24 bg-card border-y">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Eye, titleKey: "vision.title", textKey: "vision.text" },
              { icon: Target, titleKey: "mission.title", textKey: "mission.text" },
              { icon: Lightbulb, titleKey: "aim.title", textKey: "aim.text" },
            ].map((item, i) => (
              <div key={i} className="apple-card p-8 text-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 transition-apple group-hover:bg-primary/15">
                  <item.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3 tracking-tight">{t(item.titleKey)}</h3>
                <p className="text-muted-foreground leading-relaxed">{t(item.textKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Apple-style grid */}
      <section className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <Stamp className="mb-4">{t("features.title")}</Stamp>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("features.title")}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Brain, titleKey: "features.ai.title", descKey: "features.ai.desc" },
              { icon: Zap, titleKey: "features.fast.title", descKey: "features.fast.desc" },
              { icon: Users, titleKey: "features.secure.title", descKey: "features.secure.desc" },
              { icon: FileCheck, titleKey: "features.digital.title", descKey: "features.digital.desc" },
              { icon: BarChart3, titleKey: "features.analytics.title", descKey: "features.analytics.desc" },
              { icon: Globe, titleKey: "features.vision.title", descKey: "features.vision.desc" },
            ].map((f, i) => (
              <div key={i} className="apple-card group p-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-apple">
                  <f.icon className="h-5.5 w-5.5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2 tracking-tight">{t(f.titleKey)}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t(f.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — magazine layout */}
      <section id="how-it-works" className="py-20 container">
        <div className="grid lg:grid-cols-12 gap-8 mb-10">
          <div className="lg:col-span-4">
            <Stamp>{t("how.title")}</Stamp>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-forest-900 mt-4 leading-tight">
              {isRtl ? "أربع محطات. بلا ورق." : "Four checkpoints. Zero paper."}
            </h2>
          </div>
          <p className="lg:col-span-7 lg:col-start-6 text-ink-soft leading-relaxed self-end">
            {t("mission.text")}
          </p>
        </div>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { step: "01", titleKey: "how.step1.title", descKey: "how.step1.desc", icon: FileCheck },
            { step: "02", titleKey: "how.step2.title", descKey: "how.step2.desc", icon: Brain },
            { step: "03", titleKey: "how.step3.title", descKey: "how.step3.desc", icon: Scale },
            { step: "04", titleKey: "how.step4.title", descKey: "how.step4.desc", icon: Check },
          ].map((s, i) => (
            <li key={i} className="irb-card p-6 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute -end-4 -top-6 font-display font-bold text-7xl text-forest-900/[0.04] num pointer-events-none">
                {s.step}
              </div>
              <span className="w-10 h-10 rounded-lg bg-forest-50 text-forest-900 flex items-center justify-center">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-bold text-forest-900">{t(s.titleKey)}</h3>
              <p className="text-[13.5px] text-ink-soft leading-relaxed flex-1">{t(s.descKey)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Stats — Apple-style with rounded card */}
      <section className="py-24">
        <div className="container">
          <div className="gradient-accent rounded-3xl p-12 lg:p-16 shadow-2xl">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 text-center">
              {[
                { valueKey: "stats.target", labelKey: "stats.targetDesc" },
                { valueKey: "stats.ai", labelKey: "stats.aiDesc" },
                { valueKey: "stats.committee", labelKey: "stats.committeeDesc" },
                { valueKey: "stats.digital", labelKey: "stats.digitalDesc" },
              ].map((s, i) => (
                <div key={i}>
                  <div className="text-3xl lg:text-4xl font-extrabold text-white mb-2 tracking-tight">{t(s.valueKey)}</div>
                  <div className="text-white/75 text-sm font-medium">{t(s.labelKey)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA — Apple-style clean */}
      <section className="py-24 bg-card border-t">
        <div className="container text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-5">
              {t("hero.cta.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10 leading-relaxed">
              {t("hero.cta.desc")}
            </p>
            <Button size="lg" className="bg-forest-900 hover:bg-forest-800 text-cream-50 text-base px-10 h-13 shadow-lg" onClick={handleStartApplication}>
              {t("hero.apply")} <ArrowIcon className="ms-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
