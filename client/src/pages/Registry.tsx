import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Award, Building2, Calendar, ArrowRight, ArrowLeft,
  ExternalLink, Download, Loader2, Filter, BookOpen,
} from "lucide-react";
import { Link } from "wouter";

const RESEARCH_TYPES = [
  "clinical_trial", "observational", "retrospective", "survey_questionnaire",
  "case_study", "laboratory", "educational", "social_behavioral", "other",
];

export default function Registry() {
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const [query, setQuery] = useState("");
  const [researchType, setResearchType] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { data: stats } = trpc.publicStats.registryStats.useQuery();
  const { data, isLoading } = trpc.publicStats.registrySearch.useQuery(
    {
      query: query || undefined,
      researchType: researchType || undefined,
      year: year ? parseInt(year, 10) : undefined,
      page,
      pageSize,
    },
    { staleTime: 60_000 }
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };
  const clearAll = () => {
    setQuery(""); setResearchType(""); setYear(""); setPage(1);
  };

  const yearOptions = (stats?.byYear ?? [])
    .map((r: any) => Number(r.year))
    .filter((y: number) => Number.isFinite(y))
    .sort((a: number, b: number) => b - a);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-10 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Link href="/"><a className="hover:text-primary inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> {t("nav.home")}</a></Link>
            <span>·</span>
            <span>{isAr ? "السجل العام" : "Public Registry"}</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Award className="h-7 w-7 text-primary" />
            {isAr ? "سجل IRB المعتمدة" : "Approved IRB Registry"}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl leading-relaxed">
            {isAr
              ? "استعرض الأبحاث التي تم اعتمادها أخلاقيًا من قبل المنصة. متاح للجميع، قابل للبحث، قابل للاستشهاد."
              : "Browse research protocols ethically approved through this platform. Open, searchable, and citable."}
          </p>
        </div>

        {/* Aggregate header — feel of "infrastructure" */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Card><CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-primary">{total.toLocaleString(isAr ? "ar-SA" : "en-US")}</div>
            <div className="text-xs text-muted-foreground">{isAr ? "إجمالي السجل" : "Total in registry"}</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{(stats?.byInstitution ?? []).length}</div>
            <div className="text-xs text-muted-foreground">{isAr ? "مؤسسات" : "Institutions"}</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{(stats?.byType ?? []).length}</div>
            <div className="text-xs text-muted-foreground">{isAr ? "أنواع البحث" : "Research types"}</div>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{yearOptions[0] ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{isAr ? "أحدث عام" : "Latest year"}</div>
          </CardContent></Card>
        </div>

        {/* Search + filters */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <form className="grid sm:grid-cols-[1fr_180px_140px_auto] gap-3" onSubmit={submitSearch}>
              <div className="relative">
                <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={isAr ? "ابحث بالعنوان، المحقق، المؤسسة، IRB#..." : "Search by title, PI, institution, IRB number..."}
                  className="ps-9"
                  aria-label={isAr ? "بحث" : "Search"}
                />
              </div>
              <Select value={researchType || "_all"} onValueChange={v => { setResearchType(v === "_all" ? "" : v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder={isAr ? "نوع البحث" : "Research type"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{isAr ? "كل الأنواع" : "All types"}</SelectItem>
                  {RESEARCH_TYPES.map(rt => (
                    <SelectItem key={rt} value={rt}>{rt.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={year || "_all"} onValueChange={v => { setYear(v === "_all" ? "" : v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder={isAr ? "السنة" : "Year"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{isAr ? "كل السنوات" : "All years"}</SelectItem>
                  {yearOptions.map((y: number) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button type="submit"><Filter className="h-4 w-4 me-1" />{isAr ? "بحث" : "Search"}</Button>
                {(query || researchType || year) && (
                  <Button type="button" variant="ghost" onClick={clearAll}>{isAr ? "مسح" : "Clear"}</Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">{isAr ? "لا توجد نتائج" : "No results"}</h3>
              <p className="text-sm text-muted-foreground">{isAr ? "جرب بحثًا مختلفًا أو امسح الفلتر." : "Try a different search or clear the filters."}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((it: any) => (
              <Card key={it.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="font-mono text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                      {it.irbNumber || "—"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {it.approvedAt ? new Date(it.approvedAt).toLocaleDateString(isAr ? "ar-SA" : "en-US") : ""}
                    </span>
                  </div>
                  <CardTitle className="text-base leading-snug mt-2">
                    {it.researchTitle || `Application #${it.id}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5 text-xs text-muted-foreground">
                  {it.principalInvestigator && (
                    <div className="flex items-center gap-1.5"><Award className="h-3 w-3 shrink-0" /><span className="truncate">{it.principalInvestigator}</span></div>
                  )}
                  {it.piInstitution && (
                    <div className="flex items-center gap-1.5"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{it.piInstitution}{it.piDepartment ? ` · ${it.piDepartment}` : ""}</span></div>
                  )}
                  {it.researchType && (
                    <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3 shrink-0" /><span className="capitalize">{String(it.researchType).replace(/_/g, " ")}</span></div>
                  )}
                  <div className="flex items-center gap-2 pt-2">
                    {it.irbNumber && (
                      <Link href={`/verify?n=${encodeURIComponent(it.irbNumber)}`}>
                        <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          {isAr ? "التحقق" : "Verify"} <ExternalLink className="h-3 w-3" />
                        </a>
                      </Link>
                    )}
                    {it.certificateUrl && (
                      <a href={it.certificateUrl} target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:underline">
                        <Download className="h-3 w-3" /> {isAr ? "الشهادة" : "Certificate"}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ArrowLeft className="h-3.5 w-3.5 me-1" /> {isAr ? "السابق" : "Prev"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {isAr ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>
              {isAr ? "التالي" : "Next"} <ArrowRight className="h-3.5 w-3.5 ms-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
