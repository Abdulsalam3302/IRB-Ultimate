import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useT } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { AlertTriangle, FileEdit, Loader2, Plus } from "lucide-react";

const AE_SEVERITIES = ["mild", "moderate", "serious", "life_threatening", "fatal"] as const;
const AE_RELATIONS = ["unrelated", "possibly", "probably", "definitely", "unknown"] as const;
const AE_OUTCOMES = ["recovered", "recovering", "ongoing", "permanent_disability", "death", "unknown"] as const;
const AMENDMENT_TYPES = ["minor", "moderate", "major"] as const;

const SEVERITY_COLORS: Record<string, string> = {
  mild: "bg-emerald-100 text-emerald-700",
  moderate: "bg-yellow-100 text-yellow-700",
  serious: "bg-orange-100 text-orange-700",
  life_threatening: "bg-red-100 text-red-700",
  fatal: "bg-red-200 text-red-900",
};

const STATUS_BADGE: Record<string, string> = {
  reported: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  acknowledged: "bg-emerald-100 text-emerald-700",
  escalated: "bg-red-100 text-red-700",
  closed: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

/**
 * NCBE post-approval lifecycle panel — adverse-event reporting and protocol
 * amendments. Backend endpoints existed since migration 0009; this is the
 * first UI over them. Shown to the applicant (and admins) once an
 * application has entered the review pipeline.
 */
export function StudyLifecycle({ applicationId, canReport }: { applicationId: number; canReport: boolean }) {
  const { lang } = useT();
  const isAr = lang === "ar";
  const utils = trpc.useUtils();

  const { data: adverseEvents } = trpc.adverseEvents.byApplication.useQuery({ applicationId });
  const { data: amendments } = trpc.amendments.byApplication.useQuery({ applicationId });

  // ── AE report form state ──
  const [aeOpen, setAeOpen] = useState(false);
  const [aeDate, setAeDate] = useState("");
  const [aeSeverity, setAeSeverity] = useState<string>("mild");
  const [aeRelation, setAeRelation] = useState<string>("unknown");
  const [aeOutcome, setAeOutcome] = useState<string>("unknown");
  const [aeDescription, setAeDescription] = useState("");
  const [aeAction, setAeAction] = useState("");

  const reportAe = trpc.adverseEvents.report.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.escalated
          ? (isAr ? "تم الإبلاغ وتصعيد الحدث للإدارة." : "Event reported and escalated to administrators.")
          : (isAr ? "تم الإبلاغ عن الحدث." : "Adverse event reported."),
      );
      setAeOpen(false);
      setAeDescription(""); setAeAction(""); setAeDate("");
      utils.adverseEvents.byApplication.invalidate({ applicationId });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Amendment form state ──
  const [amOpen, setAmOpen] = useState(false);
  const [amType, setAmType] = useState<string>("minor");
  const [amTitle, setAmTitle] = useState("");
  const [amRationale, setAmRationale] = useState("");

  const submitAmendment = trpc.amendments.submit.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم تقديم طلب التعديل." : "Amendment request submitted.");
      setAmOpen(false);
      setAmTitle(""); setAmRationale("");
      utils.amendments.byApplication.invalidate({ applicationId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* ── Adverse events ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              {isAr ? "الأحداث السلبية" : "Adverse Events"}
            </CardTitle>
            <CardDescription className="mt-1">
              {isAr
                ? "الإبلاغ عن الأحداث السلبية إلزامي وفق لوائح اللجنة الوطنية لأخلاقيات البحوث."
                : "Reporting adverse events is mandatory under NCBE regulations for active studies."}
            </CardDescription>
          </div>
          {canReport && (
            <Dialog open={aeOpen} onOpenChange={setAeOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-3.5 w-3.5 me-1" /> {isAr ? "إبلاغ" : "Report"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{isAr ? "الإبلاغ عن حدث سلبي" : "Report an Adverse Event"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{isAr ? "تاريخ الحدوث" : "Occurred on"}</Label>
                      <Input type="datetime-local" value={aeDate} onChange={(e) => setAeDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{isAr ? "الخطورة" : "Severity"}</Label>
                      <Select value={aeSeverity} onValueChange={setAeSeverity}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AE_SEVERITIES.map(s => (
                            <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{isAr ? "العلاقة بالدراسة" : "Related to study"}</Label>
                      <Select value={aeRelation} onValueChange={setAeRelation}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AE_RELATIONS.map(s => (
                            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{isAr ? "النتيجة" : "Outcome"}</Label>
                      <Select value={aeOutcome} onValueChange={setAeOutcome}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AE_OUTCOMES.map(s => (
                            <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isAr ? "الوصف (٢٠ حرفاً على الأقل)" : "Description (min 20 characters)"}</Label>
                    <Textarea rows={4} value={aeDescription} onChange={(e) => setAeDescription(e.target.value)}
                      placeholder={isAr ? "ماذا حدث، لمن، ومتى..." : "What happened, to whom, and when…"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isAr ? "الإجراء المتخذ (اختياري)" : "Action taken (optional)"}</Label>
                    <Textarea rows={2} value={aeAction} onChange={(e) => setAeAction(e.target.value)} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={reportAe.isPending || aeDescription.trim().length < 20 || !aeDate}
                    onClick={() => reportAe.mutate({
                      applicationId,
                      occurredAt: new Date(aeDate).toISOString(),
                      severity: aeSeverity as any,
                      relatedToStudy: aeRelation as any,
                      outcome: aeOutcome as any,
                      description: aeDescription.trim(),
                      actionTaken: aeAction.trim() || undefined,
                    })}
                  >
                    {reportAe.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                    {isAr ? "إرسال البلاغ" : "Submit Report"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {!adverseEvents || adverseEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isAr ? "لا توجد أحداث سلبية مسجلة." : "No adverse events reported."}</p>
          ) : (
            <div className="space-y-3">
              {adverseEvents.map((ae: any) => (
                <div key={ae.id} className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`text-xs capitalize ${SEVERITY_COLORS[ae.severity] || ""}`}>{String(ae.severity).replace(/_/g, " ")}</Badge>
                    <Badge className={`text-xs capitalize ${STATUS_BADGE[ae.status] || ""}`}>{String(ae.status).replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {isAr ? "حدث في" : "Occurred"}: {ae.occurredAt ? new Date(ae.occurredAt).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <p className="text-sm">{ae.description}</p>
                  {ae.actionTaken && <p className="text-xs text-muted-foreground">{isAr ? "الإجراء:" : "Action:"} {ae.actionTaken}</p>}
                  {ae.adminNotes && <p className="text-xs text-blue-700">{isAr ? "ملاحظات الإدارة:" : "Admin notes:"} {ae.adminNotes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Amendments ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-blue-500" />
              {isAr ? "تعديلات البروتوكول" : "Protocol Amendments"}
            </CardTitle>
            <CardDescription className="mt-1">
              {isAr
                ? "أي تغيير على الدراسة المعتمدة يتطلب طلب تعديل وموافقة الإدارة قبل التنفيذ."
                : "Any change to an approved study requires an amendment request and admin approval before implementation."}
            </CardDescription>
          </div>
          {canReport && (
            <Dialog open={amOpen} onOpenChange={setAmOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-3.5 w-3.5 me-1" /> {isAr ? "طلب تعديل" : "Request"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{isAr ? "طلب تعديل البروتوكول" : "Request a Protocol Amendment"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>{isAr ? "نوع التعديل" : "Amendment type"}</Label>
                    <Select value={amType} onValueChange={setAmType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AMENDMENT_TYPES.map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isAr ? "عنوان التعديل" : "Title"}</Label>
                    <Input value={amTitle} onChange={(e) => setAmTitle(e.target.value)}
                      placeholder={isAr ? "مثال: زيادة حجم العينة إلى ٣٠٠" : "e.g. Increase sample size to 300"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isAr ? "المبررات (١٠ أحرف على الأقل)" : "Rationale (min 10 characters)"}</Label>
                    <Textarea rows={4} value={amRationale} onChange={(e) => setAmRationale(e.target.value)}
                      placeholder={isAr ? "لماذا هذا التغيير ضروري وما أثره على المشاركين..." : "Why this change is needed and its impact on participants…"} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={submitAmendment.isPending || amTitle.trim().length < 3 || amRationale.trim().length < 10}
                    onClick={() => submitAmendment.mutate({
                      applicationId,
                      type: amType as any,
                      title: amTitle.trim(),
                      rationale: amRationale.trim(),
                    })}
                  >
                    {submitAmendment.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                    {isAr ? "تقديم الطلب" : "Submit Amendment"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {!amendments || amendments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isAr ? "لا توجد تعديلات." : "No amendments requested."}</p>
          ) : (
            <div className="space-y-3">
              {amendments.map((am: any) => (
                <div key={am.id} className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{am.type}</Badge>
                    <Badge className={`text-xs capitalize ${STATUS_BADGE[am.status] || ""}`}>{String(am.status).replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(am.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-medium">{am.title}</p>
                  <p className="text-xs text-muted-foreground">{am.rationale}</p>
                  {am.adminNotes && <p className="text-xs text-blue-700">{isAr ? "ملاحظات الإدارة:" : "Admin notes:"} {am.adminNotes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
