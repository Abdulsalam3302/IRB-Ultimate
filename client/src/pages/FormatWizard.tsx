import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { getTemplateSections, isFormattableSlug } from "@shared/templateFields";
import { buildPrefillMap } from "@shared/resourcePrefill";
import { SLUG_META } from "@shared/formatMeta";
import { Loader2, Sparkles, FileDown, ChevronLeft, ChevronRight } from "lucide-react";
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

  const missingCount = sections.flatMap(s => s.fields).filter(f => !answers[f.id]?.trim()).length;

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
      toast.success(isAr ? "تم إنشاء الملف بنجاح" : "Document generated successfully");
    } catch (err) {
      toast.error(isAr ? "فشل إنشاء الملف" : "Failed to generate document", {
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo={backTo} />

      <div className="container py-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-3">
            <Sparkles className="h-3 w-3 me-1" />
            {t("format.wizardBadge")}
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            {isAr ? meta.titleAr : meta.titleEn}
          </h1>
          <p className="text-muted-foreground">{isAr ? meta.descAr : meta.descEn}</p>
          {appId && (
            <p className="text-xs text-muted-foreground mt-2">
              {t("format.prefilledHint")}
            </p>
          )}
        </div>

        {appId && appLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section, si) => (
              <Card key={si}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    {isAr ? section.headingAr : section.headingEn}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {section.fields.map(field => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id} className="text-sm font-semibold text-primary">
                        {isAr ? field.labelAr : field.labelEn}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">↳ {t("format.enterHint")}</span>{" "}
                        {isAr ? field.hintAr : field.hintEn}
                      </p>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-emerald-700 dark:text-emerald-400 font-medium">
                          ★ {t("format.showExample")}
                        </summary>
                        <p className="mt-2 p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-dashed border-emerald-300 whitespace-pre-wrap">
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
                        className="text-sm"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            <Separator />

            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileDown className="h-5 w-5" />
                  {t("format.generateTitle")}
                </CardTitle>
                <CardDescription>
                  {missingCount > 0
                    ? t("format.missingFields").replace("{n}", String(missingCount))
                    : t("format.readyToGenerate")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  size="lg"
                  className="gap-2"
                  disabled={!!generating}
                  onClick={() => generate("pdf")}
                >
                  {generating === "pdf" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {t("format.generatePdf")}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  disabled={!!generating}
                  onClick={() => generate("docx")}
                >
                  {generating === "docx" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {t("format.generateDocx")}
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => setLocation(backTo)}
                >
                  <BackIcon className="h-4 w-4 me-1" />
                  {t("common.back")}
                </Button>
              </CardContent>
            </Card>

            <p className="text-xs text-center text-muted-foreground pb-8">
              {t("format.stampNote")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
