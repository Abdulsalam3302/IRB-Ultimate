import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/contexts/LanguageContext";
import {
  Shield, Zap, Brain, Clock, FileCheck, Users, ArrowRight,
  Target, Eye, Lightbulb, BarChart3, Globe, Award,
  ChevronRight, Star, Search, MessageSquare, Heart, BookOpen, ArrowLeft,
  Sun, Moon, Sparkles, Linkedin
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/91022535/HJDnd7J2v7Rqud6TxjUN74/irb-logo-oReN3TBKtvR3zcf4YvwKmu.webp";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { t, isRtl } = useT();
  const { theme, toggleTheme } = useTheme();

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
    <div className="min-h-screen bg-background">
      {/* Apple-style Glass Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="IRB" className="h-9 w-9 rounded-lg object-contain" />
            <div>
              <span className="font-bold text-lg tracking-tight">{t("footer.brand")}</span>
              <span className="hidden sm:inline text-xs text-muted-foreground ms-2">Saudi Arabia</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {toggleTheme && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-apple"
                onClick={toggleTheme}
                title={theme === "dark" ? "Light Mode" : "Dark Mode"}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <LanguageToggle />
            <Button variant="ghost" size="sm" onClick={() => setLocation("/verify")} className="hidden sm:inline-flex transition-apple">
              <Search className="h-3.5 w-3.5 me-1" /> {t("nav.verify")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/resources")} className="hidden md:inline-flex transition-apple">
              {t("nav.resources")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/policy")} className="hidden md:inline-flex transition-apple">
              {t("nav.policy")}
            </Button>
            {isAuthenticated ? (
              <Button size="sm" className="btn-apple shadow-sm" onClick={() => setLocation("/dashboard")}>
                {t("nav.dashboard")} <ChevronIcon className="h-4 w-4 ms-1" />
              </Button>
            ) : (
              <Button size="sm" className="btn-apple shadow-sm" onClick={() => { window.location.href = getLoginUrl(); }}>
                {t("nav.login")} <ChevronIcon className="h-4 w-4 ms-1" />
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section — Apple-style with gradient and animations */}
      <section className="relative overflow-hidden gradient-hero">
        {/* Decorative blurs */}
        <div className="absolute top-20 end-10 w-80 h-80 bg-primary/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-10 start-10 w-96 h-96 bg-emerald-200/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-100/10 rounded-full blur-[150px]" />

        <div className="container relative py-24 lg:py-36">
          <div className="max-w-3xl mx-auto text-center">
            {/* Logo */}
            <div className="animate-fade-in-up mb-8">
              <img src={LOGO_URL} alt="IRB Review Platform" className="h-20 w-20 mx-auto rounded-2xl shadow-lg" />
            </div>

            <Badge variant="secondary" className="animate-fade-in-up animate-delay-100 mb-6 px-4 py-1.5 text-sm font-medium border-primary/20 bg-primary/5">
              <Sparkles className="h-3.5 w-3.5 me-1.5 text-primary" /> {t("hero.badge")}
            </Badge>

            <h1 className="animate-fade-in-up animate-delay-200 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
              {t("hero.subtitle")}
            </h1>

            <p className="animate-fade-in-up animate-delay-300 text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              {t("hero.desc")}
            </p>

            <div className="animate-fade-in-up animate-delay-400 flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="btn-apple text-base px-8 h-13 shadow-lg gradient-accent text-white border-0" onClick={handleStartApplication}>
                {t("hero.apply")} <ArrowIcon className="ms-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="btn-apple text-base px-8 h-13 bg-background/80 backdrop-blur-sm" onClick={() => setLocation("/verify")}>
                {t("hero.verify")}
              </Button>
            </div>

            <div className="animate-fade-in-up animate-delay-500 mt-14 flex items-center justify-center gap-8 sm:gap-12 text-sm text-muted-foreground flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium">{t("stats.target")}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium">{t("stats.ai")}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium">NBCE</span>
              </div>
            </div>
          </div>
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
            <Badge variant="secondary" className="mb-4 border-primary/20 bg-primary/5">
              <Sparkles className="h-3 w-3 me-1.5 text-primary" /> {t("features.title")}
            </Badge>
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

      {/* How It Works — Apple-style steps */}
      <section id="how-it-works" className="py-24 bg-card border-y">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("how.title")}</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", titleKey: "how.step1.title", descKey: "how.step1.desc", icon: FileCheck },
              { step: "02", titleKey: "how.step2.title", descKey: "how.step2.desc", icon: Brain },
              { step: "03", titleKey: "how.step3.title", descKey: "how.step3.desc", icon: Users },
              { step: "04", titleKey: "how.step4.title", descKey: "how.step4.desc", icon: Award },
            ].map((s, i) => (
              <div key={i} className="relative text-center group">
                <div className="text-6xl font-black text-primary/8 mb-4 tracking-tighter">{s.step}</div>
                <div className="h-14 w-14 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-5 shadow-lg group-hover:shadow-xl transition-apple">
                  <s.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2 tracking-tight">{t(s.titleKey)}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{t(s.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
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
              {isRtl ? "هل أنت مستعد لتقديم بحثك؟" : "Ready to Submit Your Research?"}
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10 leading-relaxed">
              {isRtl
                ? "انضم إلى الباحثين في جميع أنحاء المملكة العربية السعودية الذين يسرعون موافقات IRB من خلال منصتنا."
                : "Join researchers across Saudi Arabia who are accelerating their IRB approvals with our AI-powered platform."}
            </p>
            <Button size="lg" className="btn-apple text-base px-10 h-13 shadow-lg gradient-accent text-white border-0" onClick={handleStartApplication}>
              {t("hero.apply")} <ArrowIcon className="ms-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer — Apple-style minimal */}
      <footer className="border-t py-12">
        <div className="container">
          <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="IRB" className="h-8 w-8 rounded-lg object-contain" />
              <span className="font-semibold tracking-tight">{t("footer.brand")}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => setLocation("/verify")} className="hover:text-foreground transition-apple">{t("nav.verify")}</button>
              <button onClick={() => setLocation("/resources")} className="hover:text-foreground transition-apple">{t("nav.resources")}</button>
              <button onClick={() => setLocation("/policy")} className="hover:text-foreground transition-apple">{t("nav.policy")}</button>
              <button onClick={() => setLocation("/support")} className="hover:text-foreground transition-apple flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {t("nav.support")}
              </button>
              <button onClick={() => setLocation("/statistics")} className="hover:text-foreground transition-apple flex items-center gap-1">
                <BarChart3 className="h-3 w-3" /> {isRtl ? "إحصائيات" : "Statistics"}
              </button>
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                {t("footer.madeWith")} <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500" />
              </p>
              <p className="text-xs text-muted-foreground">
                <a href="https://www.ahss-sa.org/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2 transition-apple">{t("footer.org")}</a> — {t("footer.approved")}{" "}
                <a href="https://www.linkedin.com/in/abdulsalam-aleid-mbbs-mba-mim-911446142/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2 transition-apple">Dr. Abdulsalam Aleid</a>
              </p>
              <p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5">
                <MessageSquare className="h-3 w-3" />
                <span>{t("footer.feedback")}:</span>
                <a
                  href="https://www.linkedin.com/in/abdulsalam-aleid-mbbs-mba-mim-911446142/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground underline underline-offset-2 transition-apple"
                  aria-label={t("footer.feedbackCta")}
                >
                  <Linkedin className="h-3 w-3" />
                  {t("footer.feedbackCta")}
                </a>
              </p>
              <p className="text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} <a href="https://ncbe.kacst.edu.sa" target="_blank" rel="noopener noreferrer" className="hover:text-foreground underline underline-offset-2 transition-apple">{t("footer.nbce")}</a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
