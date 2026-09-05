import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import {
  Bot, ShieldCheck, ShieldX, Loader2, Users, AlertTriangle,
  CheckCircle2, XCircle, Scale, Lock, FlaskConical,
} from "lucide-react";

/**
 * Owner-only AI Swarm Review console.
 *
 * Runs two advisory model panels with six actual domain analyses each — against a selected
 * application, then renders both verdicts side by side with the full
 * cluster-level evidence. Rendered only when `aiSwarm.amOwner` is true;
 * every endpoint behind it is owner-gated server-side as well.
 */

interface ClusterReport {
  cluster: string;
  agentCount: number;
  score: number;
  votesApprove: number;
  votesRevise: number;
  votesReject: number;
  keyFindings: string[];
  redFlags: string[];
  requiredChanges: string[];
  dissentingOpinions: string[];
}

interface PanelReport {
  panel: number;
  panelName: string;
  totalAgents: number;
  score: number;
  verdict: "pass" | "fail";
  verdictBasis: string[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  requiredChanges: string[];
  redFlags: string[];
  clusters: ClusterReport[];
  votes: { approve: number; revise: number; reject: number };
}

function parseReport(raw: string | null): PanelReport | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
    const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
    if (!r || typeof r !== "object" || !finite(r.score) || !finite(r.totalAgents) || typeof r.panelName !== "string" || typeof r.summary !== "string" || !["pass", "fail"].includes(r.verdict)) return null;
    if (![r.verdictBasis, r.strengths, r.weaknesses, r.requiredChanges, r.redFlags].every(strings)) return null;
    if (!r.votes || ![r.votes.approve, r.votes.revise, r.votes.reject].every(finite) || !Array.isArray(r.clusters)) return null;
    if (!r.clusters.every((c: ClusterReport) => c && typeof c.cluster === "string" && [c.score, c.agentCount, c.votesApprove, c.votesRevise, c.votesReject].every(finite) && [c.keyFindings, c.redFlags, c.requiredChanges, c.dissentingOpinions].every(strings))) return null;
    return r as PanelReport;
  } catch {
    return null;
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function VoteBar({ approve, revise, reject, total }: { approve: number; revise: number; reject: number; total: number }) {
  if (total <= 0) return null;
  const pct = (n: number) => Math.max(0, Math.min(100, Math.round((n / total) * 100)));
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img"
        aria-label={`Approve ${approve}, revise ${revise}, reject ${reject} of ${total}`}>
        <div className="bg-emerald-500" style={{ width: `${pct(approve)}%` }} />
        <div className="bg-amber-500" style={{ width: `${pct(revise)}%` }} />
        <div className="bg-red-500" style={{ width: `${pct(reject)}%` }} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span><span className="font-medium text-emerald-600 dark:text-emerald-400">{approve}</span> approve</span>
        <span><span className="font-medium text-amber-600 dark:text-amber-400">{revise}</span> revise</span>
        <span><span className="font-medium text-red-600 dark:text-red-400">{reject}</span> reject</span>
        <span>· {total} AI recommendations, not human votes</span>
      </div>
    </div>
  );
}

function BulletList({ items, tone }: { items: string[]; tone?: "good" | "bad" | "warn" }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">None reported.</p>;
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? XCircle : AlertTriangle;
  const color = tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-red-500" : "text-amber-500";
  return (
    <ul className="space-y-1.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

function PanelCard({ report }: { report: PanelReport }) {
  const passed = report.verdict === "pass";
  return (
    <Card className={passed ? "border-emerald-500/40" : "border-red-500/40"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" /> {report.panelName}
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {report.clusters.length} reported domain analyses · {report.clusters.length} specialty clusters
            </CardDescription>
          </div>
          <div className="text-end">
            <div className={`text-3xl font-bold ${scoreColor(report.score)}`}>{report.score}</div>
            <Badge variant={passed ? "default" : "destructive"} className={passed ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
              {passed ? <ShieldCheck className="h-3.5 w-3.5 me-1" /> : <ShieldX className="h-3.5 w-3.5 me-1" />}
              {passed ? "PASS" : "FAIL"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.totalAgents === report.clusters.length ? <VoteBar {...report.votes} total={report.totalAgents} /> : <p className="text-sm text-amber-700">Legacy simulated vote totals are omitted. This record contains AI findings, not human committee votes.</p>}

        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Scale className="me-1 inline h-3.5 w-3.5" /> Verdict basis (server-enforced)
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-sm">
            {report.verdictBasis.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>

        <p className="text-sm leading-relaxed">{report.summary}</p>

        <Accordion type="multiple" className="w-full">
          {report.redFlags.length > 0 && (
            <AccordionItem value="redflags">
              <AccordionTrigger className="text-sm font-medium text-red-600 dark:text-red-400">
                Red flags ({report.redFlags.length})
              </AccordionTrigger>
              <AccordionContent><BulletList items={report.redFlags} tone="bad" /></AccordionContent>
            </AccordionItem>
          )}
          <AccordionItem value="strengths">
            <AccordionTrigger className="text-sm font-medium">Strengths ({report.strengths.length})</AccordionTrigger>
            <AccordionContent><BulletList items={report.strengths} tone="good" /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="weaknesses">
            <AccordionTrigger className="text-sm font-medium">Weaknesses ({report.weaknesses.length})</AccordionTrigger>
            <AccordionContent><BulletList items={report.weaknesses} tone="warn" /></AccordionContent>
          </AccordionItem>
          <AccordionItem value="changes">
            <AccordionTrigger className="text-sm font-medium">Required changes ({report.requiredChanges.length})</AccordionTrigger>
            <AccordionContent>
              {report.requiredChanges.length ? (
                <ol className="list-inside list-decimal space-y-1.5 text-sm">
                  {report.requiredChanges.map((c, i) => <li key={i}>{c}</li>)}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">None — application meets the panel's bar.</p>
              )}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="clusters">
            <AccordionTrigger className="text-sm font-medium">Specialty cluster reports ({report.clusters.length})</AccordionTrigger>
            <AccordionContent className="space-y-4">
              {report.clusters.map(c => (
                <div key={c.cluster} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{c.cluster}</p>
                    <span className={`text-sm font-bold ${scoreColor(c.score)}`}>{c.score}/100</span>
                  </div>
                  {c.agentCount === 1 && <VoteBar approve={c.votesApprove} revise={c.votesRevise} reject={c.votesReject} total={c.agentCount} />}
                  {c.keyFindings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Findings</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                        {c.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  {c.redFlags.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Red flags</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                        {c.redFlags.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  {c.dissentingOpinions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dissenting opinions</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm italic">
                        {c.dissentingOpinions.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

export function AiSwarmConsole() {
  const { lang } = useT();
  const isAr = lang === "ar";
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const appId = selectedAppId ? Number(selectedAppId) : null;

  const utils = trpc.useUtils();
  const { data: applications } = trpc.admin.allApplications.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.aiSwarm.byApplication.useQuery(
    { applicationId: appId! },
    {
      enabled: appId != null,
      refetchInterval: query =>
        (query.state.data ?? []).some(r => r.status === "running") ? 4000 : false,
    },
  );
  const { data: budget } = trpc.application.aiBudget.useQuery();
  const anyRunning = (history ?? []).some(r => r.status === "running");

  useEffect(() => {
    if (anyRunning) return;
    void utils.admin.allApplications.invalidate();
  }, [anyRunning, utils.admin.allApplications]);

  const runSwarm = trpc.aiSwarm.run.useMutation({
    onSuccess: () => {
      toast.success(
        isAr
          ? "بدأ تدقيق السرب — اللجنتان تتداولان الآن. تظهر النتائج هنا خلال دقيقة أو دقيقتين."
          : "Swarm audit started — both panels are deliberating. Results appear here within a minute or two.",
      );
      if (appId != null) utils.aiSwarm.byApplication.invalidate({ applicationId: appId });
      utils.application.aiBudget.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Eligible: anything past the gateway stage with a title.
  const eligibleApps = useMemo(
    () =>
      (applications ?? []).filter(
        a => a.researchTitle && !["draft", "declaration_pending"].includes(a.status),
      ),
    [applications],
  );

  // Group history rows by runGroup so panel 1 + 2 of one invocation render together.
  const runs = useMemo(() => {
    const byGroup = new Map<string, NonNullable<typeof history>>();
    for (const row of history ?? []) {
      const list = byGroup.get(row.runGroup) ?? [];
      list.push(row);
      byGroup.set(row.runGroup, list);
    }
    return Array.from(byGroup.entries()).map(([group, rows]) => ({
      group,
      createdAt: rows[0]?.createdAt,
      rows: [...rows].sort((a, b) => a.panel - b.panel),
    }));
  }, [history]);

  return (
    <div className="space-y-6">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            {isAr ? "سرب الذكاء الاصطناعي" : "AI Swarm Review"}
            <Badge variant="outline" className="ms-2"><Lock className="h-3 w-3 me-1" /> {isAr ? "للمالك فقط" : "Owner only"}</Badge>
            <Badge className="bg-emerald-600 hover:bg-emerald-600">{isAr ? "تقييم استشاري" : "Advisory assessment"}</Badge>
          </CardTitle>
          <CardDescription>
            {isAr
              ? "تجري نماذج الذكاء الاصطناعي تحليلات للمجالات الأخلاقية وتجمع الملاحظات والنواقص للمراجعة البشرية. اجتياز التقييم لا يمنح موافقة أخلاقية ولا يصدر شهادة."
              : "AI models analyze ethics domains and consolidate findings and gaps for human review. Passing the assessment does not grant ethics approval or issue a certificate."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={selectedAppId} onValueChange={setSelectedAppId}>
              <SelectTrigger className="sm:max-w-md">
                <SelectValue placeholder={isAr ? "اختر طلباً للتدقيق…" : "Select an application to audit…"} />
              </SelectTrigger>
              <SelectContent>
                {eligibleApps.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    #{a.id} [{a.status}] — {(a.researchTitle || "Untitled").slice(0, 70)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={!appId || runSwarm.isPending || anyRunning}>
                  {runSwarm.isPending || anyRunning
                    ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {isAr ? "السرب يتداول…" : "Swarm deliberating…"}</>
                    : <><Bot className="h-4 w-4 me-2" /> {isAr ? "تشغيل تدقيق السرب" : "Run Swarm Audit"}</>}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{isAr ? "تشغيل تدقيق السرب المزدوج؟" : "Run the dual-panel swarm audit?"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isAr
                      ? "سيُشغّل مساران لتحليل مجالات أخلاقيات البحث بمساعدة الذكاء الاصطناعي. تُعرض النتائج الاستشارية على المراجعين البشريين ولا تصدر موافقة أو شهادة تلقائية."
                      : "This runs two panels of AI domain analyses. Advisory findings support human reviewers and do not issue an automatic approval or certificate."}
                    {budget && (
                      <span className="mt-2 block text-xs">
                        {isAr ? "المتبقي اليوم:" : "Remaining today:"} {Math.max(0, budget.userLimit - budget.userUsed)} {isAr ? "استدعاء" : "calls"}
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => appId && runSwarm.mutate({ applicationId: appId })}>
                    {isAr ? "تشغيل" : "Run audit"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {(runSwarm.isPending || anyRunning) && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
              <p className="text-sm font-medium">
                {isAr ? "اللجنتان تتداولان بشكل مستقل…" : "Both panels are deliberating independently…"}
              </p>
              <Progress value={undefined as unknown as number} className="animate-pulse" />
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "٦ تخصصات × ٨٥ مراجعاً لكل لجنة، ثم يجمع رئيس كل لجنة الحكم النهائي."
                  : "6 specialty clusters × 85 reviewers per panel, then each panel chair synthesises the final verdict."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {appId != null && (
        <div className="space-y-6">
          {historyLoading && (
            <p className="text-sm text-muted-foreground"><Loader2 className="me-2 inline h-4 w-4 animate-spin" />{isAr ? "جارٍ تحميل السجل…" : "Loading audit history…"}</p>
          )}
          {!historyLoading && runs.length === 0 && !runSwarm.isPending && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد تدقيقات سابقة لهذا الطلب." : "No swarm audits have been run for this application yet."}
            </CardContent></Card>
          )}
          {runs.map(run => (
            <div key={run.group} className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                <span className="font-mono text-xs">{run.group}</span>
                <span>·</span>
                <span>{run.createdAt ? new Date(run.createdAt).toLocaleString(isAr ? "ar-SA" : "en-GB") : ""}</span>
                {run.rows.length === 2 && run.rows.every(r => r.status === "completed") && (
                  run.rows[0].verdict === run.rows[1].verdict
                    ? <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">{isAr ? "اللجنتان متفقتان" : "Panels agree"}</Badge>
                    : <Badge variant="outline" className="text-amber-600 dark:text-amber-400">{isAr ? "اللجنتان مختلفتان — يلزم حكم بشري" : "Panels disagree — human judgement required"}</Badge>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {run.rows.map(row => {
                  if (row.status === "failed") {
                    return (
                      <Card key={row.id} className="border-amber-500/40">
                        <CardContent className="py-6 text-sm">
                          <AlertTriangle className="me-2 inline h-4 w-4 text-amber-500" />
                          {isAr ? `اللجنة ${row.panel}: تعذر الإكمال — ` : `Panel ${row.panel}: could not complete — `}
                          {row.errorMessage?.replace("[AI_UNAVAILABLE] ", "") || (isAr ? "خطأ غير معروف" : "unknown error")}
                        </CardContent>
                      </Card>
                    );
                  }
                  if (row.status === "running") {
                    return (
                      <Card key={row.id}><CardContent className="py-6 text-sm text-muted-foreground">
                        <Loader2 className="me-2 inline h-4 w-4 animate-spin" />
                        {isAr ? `اللجنة ${row.panel} قيد التداول…` : `Panel ${row.panel} is deliberating…`}
                      </CardContent></Card>
                    );
                  }
                  const report = parseReport(row.report);
                  return report
                    ? <PanelCard key={row.id} report={report} />
                    : (
                      <Card key={row.id}><CardContent className="py-6 text-sm text-muted-foreground">
                        {isAr ? "تعذر عرض التقرير." : "Report could not be rendered."}
                      </CardContent></Card>
                    );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
