import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useT } from "@/contexts/LanguageContext";
import { Loader2, ExternalLink, BookOpen, FlaskConical, GraduationCap, BookText, Sparkles } from "lucide-react";

const SOURCE_META = {
  pubmed: { label: "PubMed", icon: BookOpen, color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900" },
  clinicaltrials: { label: "ClinicalTrials.gov", icon: FlaskConical, color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  semanticscholar: { label: "Semantic Scholar", icon: GraduationCap, color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900" },
  openalex: { label: "OpenAlex", icon: BookText, color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  elicit: { label: "Elicit", icon: Sparkles, color: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-900" },
} as const;

interface Props {
  applicationId: number;
}

export default function RelatedLiterature({ applicationId }: Props) {
  const { lang } = useT();
  const isAr = lang === "ar";

  const { data, isLoading, isError } = trpc.literature.searchByApplication.useQuery(
    { applicationId },
    {
      enabled: applicationId > 0,
      staleTime: 60 * 60 * 1000, // 1h — server caches for the same window
    }
  );

  const heading = isAr ? "الأدبيات والدراسات ذات الصلة" : "Related literature & prior art";
  const sub = isAr
    ? "بحث متوازي عبر PubMed وClinicalTrials.gov وSemantic Scholar وOpenAlex."
    : "Parallel search across PubMed, ClinicalTrials.gov, Semantic Scholar, and OpenAlex.";

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {heading}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {isAr ? "جاري البحث في قواعد البيانات…" : "Searching scholarly databases…"}
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return null;
  }

  const items = data.items ?? [];
  const totals: Record<string, number> = data.totals ?? {};
  const errors: Record<string, string> = data.errors ?? {};

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {heading}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {data.errors?.input ||
            (isAr
              ? "أضف عنوانًا وأهدافًا للبحث عن الأدبيات ذات الصلة."
              : "Add a title and objectives to search for related literature.")}
        </CardContent>
      </Card>
    );
  }

  // Group items by source
  const bySource: Record<string, typeof items> = {};
  for (const it of items) {
    (bySource[it.source] ||= []).push(it);
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> {heading}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{sub}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(totals).map(([src, n]) => {
            const meta = SOURCE_META[src as keyof typeof SOURCE_META];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <Badge key={src} variant="outline" className={`text-xs ${meta.color}`}>
                <Icon className="h-3 w-3 mr-1" />
                {meta.label} · {n.toLocaleString()}
              </Badge>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(Object.keys(SOURCE_META) as Array<keyof typeof SOURCE_META>)
          .filter(src => bySource[src]?.length)
          .map(src => {
            const meta = SOURCE_META[src];
            const Icon = meta.icon;
            return (
              <div key={src}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {meta.label}
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {bySource[src].map(it => (
                    <li key={`${it.source}-${it.id}`} className="text-sm">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline inline-flex items-baseline gap-1"
                      >
                        <span>{it.title}</span>
                        <ExternalLink className="h-3 w-3 opacity-60 self-center" />
                      </a>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
                        {it.authors && it.authors.length > 0 && (
                          <span>
                            {it.authors.slice(0, 2).join(", ")}
                            {it.authors.length > 2 ? " et al." : ""}
                          </span>
                        )}
                        {it.year && <span>· {it.year}</span>}
                        {it.venue && <span>· {it.venue}</span>}
                        {it.trialStatus && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            {it.trialStatus}
                            {it.trialPhase ? ` · ${it.trialPhase}` : ""}
                          </Badge>
                        )}
                        {typeof it.citationCount === "number" && (
                          <span>· {it.citationCount.toLocaleString()} cites</span>
                        )}
                      </div>
                      {it.abstract && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {it.abstract}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        {Object.keys(errors).length > 0 && Object.keys(errors)[0] !== "input" && (
          <p className="text-[11px] text-muted-foreground">
            {isAr ? "مصادر غير متاحة:" : "Unavailable sources:"} {Object.keys(errors).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
