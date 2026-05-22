import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/design/Logo";
import { Stamp } from "@/components/design/Stamp";
import { Loader2, FileDown, ChevronLeft, ChevronRight, Globe, Languages, Check } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { getTemplateSections, isFormattableSlug } from "@shared/templateFields";
import { buildPrefillMap } from "@shared/resourcePrefill";
import { SLUG_META } from "@shared/formatMeta";
import { toast } from "sonner";
import NotFound from "@/pages/NotFound";

export default function FormatWizard() {
  const { slug = "" } = useParams<{ slug: string }>();
  const search = useSearch();
  const appId = useMemo(() => {
    const p = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    const raw = p.get("appId");
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }, [search]);

  const { t, lang, isRtl } = useT();
  const isAr = lang === "ar";
  const [, setLocation] = useLocation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<"pdf" | "docx" | null>(null);
  const [initialized, setInitialized] = useState(false);

  if (!isFormattableSlug(slug)) return <NotFound />;

  const sections = getTemplateSections(slug)!;
  const meta = SLUG_META[slug];
  const allFields = sections.flatMap(s => s.fields);
  const filledCount = allFields.filter(f => answers[f.id]?.trim()).length;
  const progressPct = allFields.length ? Math.round((filledCount / allFields.length) * 100) : 0;

  const { data: app, isLoading: appLoading } = trpc.application.getById.useQuery(
    { id: appId! },
    { enabled: !!appId },
  );

  useEffect(() => {
    if (initialized) return;
    if (appId && appLoading) return;
    if (appId && app) {
      const prefill = buildPrefillMap(
        slug,
        app,
        (app.authors ?? []).map(a => ({
          name: a.name,
          email: a.email,
          institution: a.institution,
          department: a.department,
          country: a.country,
        })),
      );
      setAnswers(prefill);
    }
    setInitialized(true);
  }, [app, appId, appLoading, initialized, slug]);

  const setField = (id: string, value: string) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const missingCount = allFields.filter(f => !answers[f.id]?.trim()).length;

  const generate = async (format: "pdf" | "docx") => {
    setGenerating(format);
    try {
      const resp = await fetch("/api/export/format/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug, lang, format, answers, appId }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Generation failed");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        resp.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `${slug}-${lang}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("format.generateSuccess"));
    } catch (err) {
      toast.error(t("format.generateError"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setGenerating(null);
    }
  };

  const backTo = appId
    ? slug === "irb-application-form"
      ? `/apply/${appId}/stage1`
      : `/apply/${appId}/stage2`
    : "/resources";

  const BackIcon = isRtl ? ChevronRight : ChevronLeft;
  let fieldNum = 0;

  return (
    <div className="min-h-screen bg-cream-50">
      <Navbar showBack backTo={backTo} />

      <div className="container py-8 max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setLocation(backTo)}
            className="text-[12.5px] text-ink-soft hover:text-forest-900 inline-flex items-center gap-2 mb-3"
          >
            <BackIcon className="h-4 w-4" /> {t("common.back")}
          </button>
          <Stamp>{t("format.wizardBadge")}</Stamp>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-forest-900 tracking-tight mt-3 leading-tight">
            {isAr ? meta.titleAr : meta.titleEn}
          </h1>
          <p className="text-ink-soft text-[15px] mt-2 max-w-2xl">{isAr ? meta.descAr : meta.descEn}</p>
          {appId && app?.irbNumber && (
            <p className="text-[13px] text-ink-muted mt-2">
              {t("format.prefilledHint")}{" "}
              <span className="font-mono num text-forest-900">{app.irbNumber}</span>
            </p>
          )}
        </div>

        <Alert className="mb-6 border-forest-900/10 bg-forest-50 rounded-xl">
          <Globe className="h-4 w-4 text-forest-900" />
          <AlertTitle className="flex items-center gap-2 text-forest-900">
            <Languages className="h-4 w-4" />
            {t("format.exportLanguage")}
          </AlertTitle>
          <AlertDescription className="text-sm text-ink-soft leading-relaxed flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>{t("format.languageNotice")}</span>
            <LanguageToggle variant="outline" size="sm" />
          </AlertDescription>
        </Alert>

        {appId && appLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-jade-500" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <Card className="irb-card border-0 shadow-soft">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="font-display text-lg text-forest-900">
                      {allFields.length} {isAr ? "أسئلة" : "questions"}
                    </CardTitle>
                    <span className="font-mono num text-[11px] text-ink-muted">
                      {filledCount}/{allFields.length}
                    </span>
                  </div>
                  <Progress value={progressPct} className="h-1.5 mt-2 [&>div]:bg-jade-500" />
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {sections.map((section, si) => (
                    <div key={si} className="px-6">
                      <h2 className="font-display text-base font-semibold text-forest-900 py-4 border-b border-forest-900/10">
                        {isAr ? section.headingAr : section.headingEn}
                      </h2>
                      {section.fields.map(field => {
                        fieldNum += 1;
                        const n = fieldNum;
                        const pinned = appId && answers[field.id]?.trim();
                        return (
                          <div
                            key={field.id}
                            className="grid md:grid-cols-12 gap-4 py-6 border-b border-forest-900/10 last:border-b-0"
                          >
                            <div className="md:col-span-4 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-forest-900 text-cream-50 flex items-center justify-center font-mono text-[10px] num">
                                  {n}
                                </span>
                                {pinned && (
                                  <span className="text-[10px] font-mono tracking-wide uppercase text-forest-700 bg-forest-50 px-1.5 py-0.5 rounded">
                                    {isAr ? "من الطلب" : "From app"}
                                  </span>
                                )}
                              </div>
                              <Label htmlFor={field.id} className="font-display text-[15px] font-semibold text-forest-900 leading-snug">
                                {isAr ? field.labelAr : field.labelEn}
                              </Label>
                              <p className="text-[11.5px] text-ink-muted leading-snug">
                                {isAr ? field.hintAr : field.hintEn}
                              </p>
                            </div>
                            <div className="md:col-span-8 space-y-2">
                              <details className="text-xs">
                                <summary className="cursor-pointer text-jade-700 font-medium">
                                  ★ {t("format.showExample")}
                                </summary>
                                <p className="mt-2 p-2 rounded-md bg-jade-50 border border-dashed border-jade-300 whitespace-pre-wrap text-ink-soft">
                                  {isAr ? field.exampleAr : field.exampleEn}
                                </p>
                              </details>
                              <Textarea
                                id={field.id}
                                rows={Math.max(3, field.blankLines ?? 2)}
                                value={answers[field.id] ?? ""}
                                onChange={e => setField(field.id, e.target.value)}
                                placeholder={t("format.answerPlaceholder")}
                                dir={isAr ? "rtl" : "ltr"}
                                className="text-sm ring-forest-900/15 focus-visible:ring-forest-900"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-24 lg:self-start">
              <Card className="irb-card p-5">
                <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">
                  {t("format.generateTitle")}
                </div>
                <CardDescription className="text-[13px] mb-4">
                  {missingCount > 0
                    ? t("format.missingFields").replace("{n}", String(missingCount))
                    : t("format.readyToGenerate")}
                </CardDescription>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="bg-forest-900 hover:bg-forest-800 text-cream-50 gap-1.5"
                    disabled={!!generating}
                    onClick={() => generate("pdf")}
                  >
                    {generating === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    className="ring-forest-900/15 gap-1.5"
                    disabled={!!generating}
                    onClick={() => generate("docx")}
                  >
                    {generating === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    DOCX
                  </Button>
                </div>
                <Separator className="my-4" />
                <ul className="space-y-1.5 text-[12px] text-ink-soft">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-jade-600" />
                    {isAr ? "توقيع د. العيد المعتمد" : "Dr. Aleid authorized signature"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-jade-600" />
                    {isAr ? "لغة التصدير = لغة الواجهة" : "Export language = UI language"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-jade-600" />
                    IRB / NBCE
                  </li>
                </ul>
              </Card>

              <Card className="irb-card p-4 flex items-center gap-3">
                <div className="seal shrink-0">{isAr ? "العيد · مختوم" : "Aleid · stamped"}</div>
                <p className="text-[12px] text-ink-soft leading-snug">{t("format.stampNote")}</p>
              </Card>

              <div className="irb-card p-4 bg-cream-100/40 overflow-hidden">
                <div className="font-mono text-[10px] uppercase tracking-wider text-ink-muted mb-2">
                  {isAr ? "معاينة" : "Preview"}
                </div>
                <div className="bg-white rounded-md ring-1 ring-forest-900/10 p-4 aspect-[8.5/11] relative text-[8px] leading-snug">
                  <Logo size={16} />
                  <div className="font-display font-bold text-forest-900 mt-2 text-[10px] line-clamp-2">
                    {isAr ? meta.titleAr : meta.titleEn}
                  </div>
                  <div className="hair h-px my-2" />
                  <p className="text-ink-muted line-clamp-4">
                    {(answers[allFields[0]?.id ?? ""] || (isAr ? "…" : "…")).slice(0, 120)}
                  </p>
                  <div className="absolute bottom-2 end-2 text-[7px] text-ink-muted font-mono">Dr. A. Aleid</div>
                </div>
              </div>

              {appId && app && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-ink-soft"
                  onClick={() => {
                    const prefill = buildPrefillMap(
                      slug,
                      app,
                      (app.authors ?? []).map(a => ({
                        name: a.name,
                        email: a.email,
                        institution: a.institution,
                        department: a.department,
                        country: a.country,
                      })),
                    );
                    setAnswers(prefill);
                    toast.success(isAr ? "تمت إعادة التعبئة من الطلب" : "Reset from application");
                  }}
                >
                  {isAr ? "إعادة التعبئة من الطلب" : "Reset answers from application"}
                </Button>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
