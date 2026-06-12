import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import {
  ArrowLeft, ArrowRight, Brain, CheckCircle, XCircle,
  Loader2, Upload, Plus, Trash2, UserPlus, Users, FileUp, AlertCircle, Info,
  ChevronDown, Sparkles
} from "lucide-react";
import ReviewFeedback from "@/components/ReviewFeedback";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RESEARCH_TYPE_LABELS, RESEARCH_TYPE_REQUIREMENTS, AI_PASS_THRESHOLD } from "@shared/types";
import type { ResearchType } from "@shared/types";

interface AuthorForm {
  name: string; email: string; phone: string;
  institution: string; department: string; country: string;
}
const emptyAuthor: AuthorForm = { name: "", email: "", phone: "", institution: "", department: "", country: "Saudi Arabia" };

export default function ApplyStage1() {
  const { id } = useParams<{ id: string }>();
  const appId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { t, lang } = useT();
  const isAr = lang === "ar";

  const { data: app, isLoading } = trpc.application.getById.useQuery(
    { id: appId },
    {
      enabled: isAuthenticated && appId > 0,
      // Background refetches were resetting the form mid-edit. Freshness
      // comes from explicit invalidation after save, not background polling.
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const { data: existingAuthors } = trpc.authors.getByApplication.useQuery(
    { applicationId: appId }, { enabled: isAuthenticated && appId > 0 }
  );

  const [form, setForm] = useState({
    researchType: "", irbCategory: "full_board", researchTitle: "",
    principalInvestigator: "", piEmail: "", piInstitution: "", piDepartment: "",
    fundingSource: "", estimatedDuration: "",
    questionnaireFileUrl: "", retrospectiveDataSource: "",
    clinicalTrialDetails: "", supplementaryFilesJson: "",
    labHeadApproval: false, labHeadName: "", labHeadEmail: "", labHeadPhone: "",
  });
  const [aiResult, setAiResult] = useState<any>(null);
  const [showAiResult, setShowAiResult] = useState(false);
  const [newAuthor, setNewAuthor] = useState<AuthorForm>({ ...emptyAuthor });
  const [showAuthorForm, setShowAuthorForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showProceedDespiteModal, setShowProceedDespiteModal] = useState(false);
  const [proceedDespiteReason, setProceedDespiteReason] = useState("");
  const proceedDespite = trpc.application.proceedDespiteStage1.useMutation();

  // One-shot hydration guard: re-running on every refetch destroys
  // in-flight typing. Only hydrate once per appId.
  const initialisedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!app) return;
    if (initialisedFor.current === app.id) return;
    setForm({
      researchType: app.researchType || "", irbCategory: app.irbCategory || "full_board",
      researchTitle: app.researchTitle || "", principalInvestigator: app.principalInvestigator || "",
      piEmail: app.piEmail || "", piInstitution: app.piInstitution || "",
      piDepartment: app.piDepartment || "", fundingSource: app.fundingSource || "",
      estimatedDuration: app.estimatedDuration || "", questionnaireFileUrl: app.questionnaireFileUrl || "",
      retrospectiveDataSource: app.retrospectiveDataSource || "",
      clinicalTrialDetails: app.clinicalTrialDetails || "",
      supplementaryFilesJson: app.supplementaryFilesJson || "",
      labHeadApproval: app.labHeadApproval || false, labHeadName: app.labHeadName || "",
      labHeadEmail: app.labHeadEmail || "", labHeadPhone: app.labHeadPhone || "",
    });
    if (app.stage1AiFeedback) {
      try {
        const parsed = JSON.parse(app.stage1AiFeedback);
        setAiResult({ score: app.stage1AiScore, passed: app.stage1Passed, ...parsed });
        setShowAiResult(true);
      } catch (e) {}
    }
    initialisedFor.current = app.id;
  }, [app]);

  const saveStage1 = trpc.application.saveStage1.useMutation();
  const runAiReview = trpc.application.runStage1Review.useMutation();
  const uploadFile = trpc.application.uploadFile.useMutation();
  const addAuthor = trpc.authors.add.useMutation();
  const removeAuthor = trpc.authors.remove.useMutation();
  const aiEnhanceStage1 = trpc.application.aiEnhanceStage1.useMutation();
  const utils = trpc.useUtils();

  // AI Enhance & Re-review state.
  const [enhanceProgress, setEnhanceProgress] = useState<string | null>(null);
  const [enhanceAlert, setEnhanceAlert] = useState(false); // yellow review banner
  const [aiEditedFields, setAiEditedFields] = useState<Set<string>>(new Set());
  const preEnhanceSnapshot = useRef<typeof form | null>(null);
  const [undoExpiresAt, setUndoExpiresAt] = useState<number | null>(null);

  const handleAiEnhance = async () => {
    // Snapshot pre-enhance state for the 60s undo pill.
    preEnhanceSnapshot.current = { ...form };
    try {
      setEnhanceProgress(isAr ? "تحسين الحقول..." : "Enhancing fields…");
      const before = { ...form };
      const result = await aiEnhanceStage1.mutateAsync({ id: appId });
      // Apply enhanced fields to local state — only the gateway fields the
      // server function actually targets.
      const enhanced = result.fields as Record<string, string>;
      const edited = new Set<string>();
      const next = { ...form };
      for (const k of Object.keys(enhanced)) {
        if (k in next && enhanced[k] && enhanced[k] !== (before as any)[k]) {
          (next as any)[k] = enhanced[k];
          edited.add(k);
        }
      }
      setEnhanceProgress(isAr ? "إعادة تشغيل المراجعة..." : "Re-running AI review…");
      setForm(next);
      setAiEditedFields(edited);
      setEnhanceAlert(true);
      setUndoExpiresAt(Date.now() + 60_000);
      // Update the AI result card with the new review.
      if (result.review) {
        setAiResult({ ...result.review });
        setShowAiResult(true);
      }
      // Refresh getById so the persisted version shows on next mount.
      utils.application.getById.invalidate({ id: appId });
      toast.success(isAr ? "تم التحسين والمراجعة" : "Enhanced & re-reviewed");
    } catch (e: any) {
      toast.error(e?.message || (isAr ? "فشل التحسين" : "Enhance failed"));
    } finally {
      setEnhanceProgress(null);
    }
  };

  const handleUndoEnhance = () => {
    if (!preEnhanceSnapshot.current) return;
    setForm(preEnhanceSnapshot.current);
    setAiEditedFields(new Set());
    setEnhanceAlert(false);
    setUndoExpiresAt(null);
    toast.success(isAr ? "تم التراجع" : "Reverted to your original values");
  };

  // Clear "AI-edited" badge for any field the user manually edits.
  const clearAiBadge = (field: string) => {
    if (!aiEditedFields.has(field)) return;
    setAiEditedFields(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  // Auto-expire the undo pill at 60s.
  useEffect(() => {
    if (!undoExpiresAt) return;
    const t = setTimeout(() => setUndoExpiresAt(null), undoExpiresAt - Date.now());
    return () => clearTimeout(t);
  }, [undoExpiresAt]);

  const safeParseSupplementary = (raw: string | null | undefined): { name: string; url: string }[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleFileUpload = async (file: File, field: "questionnaireFileUrl" | "supplementaryFilesJson") => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => { resolve((reader.result as string).split(",")[1]); };
        reader.onerror = () => reject(reader.error || new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const result = await uploadFile.mutateAsync({ fileName: file.name, fileData: base64, contentType: file.type, applicationId: appId, category: field === "supplementaryFilesJson" ? "supplementary" : "questionnaire" });
      if (field === "supplementaryFilesJson") {
        // Functional update — when the user multi-selects N files, all N
        // handlers race; each must see the latest list, not the stale
        // closure captured at handler creation, otherwise files 2..N are
        // dropped on the floor.
        setForm(prev => {
          const existing = safeParseSupplementary(prev.supplementaryFilesJson);
          existing.push({ name: file.name, url: result.url });
          return { ...prev, supplementaryFilesJson: JSON.stringify(existing) };
        });
      } else {
        setForm(prev => ({ ...prev, [field]: result.url }));
      }
      toast.success(isAr ? `تم رفع الملف "${file.name}" بنجاح` : `File "${file.name}" uploaded successfully`);
    } catch (error: any) {
      toast.error(isAr ? "فشل رفع الملف" : "Failed to upload file: " + (error.message || ""));
    } finally { setUploading(false); }
  };

  const handleAddAuthor = async () => {
    if (!newAuthor.name || !newAuthor.email) {
      toast.error(isAr ? "اسم المؤلف والبريد الإلكتروني مطلوبان" : "Author name and email are required");
      return;
    }
    try {
      await addAuthor.mutateAsync({
        applicationId: appId, name: newAuthor.name, email: newAuthor.email,
        phone: newAuthor.phone || undefined, institution: newAuthor.institution || undefined,
        department: newAuthor.department || undefined, country: newAuthor.country || undefined,
      });
      setNewAuthor({ ...emptyAuthor }); setShowAuthorForm(false);
      utils.authors.getByApplication.invalidate({ applicationId: appId });
      toast.success(isAr ? "تم إضافة المؤلف بنجاح" : "Author added successfully");
    } catch (error: any) { toast.error(error.message || "Failed"); }
  };

  const handleRemoveAuthor = async (authorId: number) => {
    try {
      await removeAuthor.mutateAsync({ id: authorId, applicationId: appId });
      utils.authors.getByApplication.invalidate({ applicationId: appId });
      toast.success(isAr ? "تم حذف المؤلف" : "Author removed");
    } catch (error: any) { toast.error(error.message || "Failed"); }
  };

  const handleSaveAndReview = async () => {
    if (!form.researchType || !form.researchTitle || !form.principalInvestigator || !form.piEmail || !form.piInstitution || !form.piDepartment) {
      toast.error(isAr ? "يرجى ملء جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }
    if (form.researchType === "survey_questionnaire" && !form.questionnaireFileUrl) {
      toast.error(isAr ? "ملف الاستبيان مطلوب" : "Questionnaire file is required for Survey/Questionnaire research type");
      return;
    }
    if (form.researchType === "retrospective" && !form.retrospectiveDataSource) {
      toast.error(isAr ? "مصدر البيانات مطلوب" : "Data source is required for Retrospective Study research type");
      return;
    }
    try {
      await saveStage1.mutateAsync({ id: appId, ...form, labHeadApproval: form.labHeadApproval || undefined });
      toast.success(isAr ? "تم حفظ المرحلة الأولى. جاري مراجعة الذكاء الاصطناعي..." : "Stage 1 saved. Running AI review...");
      const result = await runAiReview.mutateAsync({ id: appId });
      setAiResult(result); setShowAiResult(true);
      if (result.passed) {
        toast.success(isAr ? `تم اجتياز المراجعة! الدرجة: ${result.score}/100` : `AI Review Passed! Score: ${result.score}/100`);
      } else {
        toast.error(isAr ? `الدرجة ${result.score}/100. الحد الأدنى ${AI_PASS_THRESHOLD} مطلوب.` : `AI Review: Score ${result.score}/100. Minimum ${AI_PASS_THRESHOLD} required.`);
      }
    } catch (error: any) { toast.error(error.message || "Failed"); }
  };

  const researchType = form.researchType as ResearchType;
  const requirements = researchType ? RESEARCH_TYPE_REQUIREMENTS[researchType] : null;
  const supplementaryFiles = safeParseSupplementary(form.supplementaryFilesJson);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Badge className="bg-primary text-primary-foreground">{isAr ? "المرحلة 1 من 2" : "Stage 1 of 2"}</Badge>
            <span className="text-sm text-muted-foreground">{isAr ? "تصنيف البحث" : "Research Classification"}</span>
          </div>
          <Progress value={50} className="h-2" />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{isAr ? "نوع البحث والمعلومات الأساسية" : "Research Type & Basic Information"}</CardTitle>
            <CardDescription>
              {isAr ? "يستخدم الذكاء الاصطناعي هذه الإجابات لتوجيه ملفك وللفحص المسبق وفق فئات NCBE." : "The AI uses these answers to route your file and pre-screen against NCBE categories."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isAr ? "نوع البحث *" : "Research Type *"}</Label>
                <Select value={form.researchType} onValueChange={(v) => setForm({ ...form, researchType: v })}>
                  <SelectTrigger><SelectValue placeholder={isAr ? "اختر النوع" : "Select type"} /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESEARCH_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isAr ? "فئة مراجعة IRB *" : "IRB Review Category *"}</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50 text-sm">
                  {isAr ? "مراجعة اللجنة الكاملة" : "Full Board Review"}
                </div>
                <p className="text-xs text-muted-foreground">{isAr ? "جميع الطلبات تتطلب مراجعة اللجنة الكاملة" : "All applications require Full Board Review"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isAr ? "عنوان البحث *" : "Research Title *"}</Label>
              <Input placeholder={isAr ? "أدخل العنوان الكامل لبحثك" : "Enter the full title of your research"} value={form.researchTitle} onChange={(e) => setForm({ ...form, researchTitle: e.target.value })} />
            </div>

            <div id="investigator" className="space-y-4 scroll-mt-28 pt-4 border-t border-forest-900/10">
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted">
                {isAr ? "القسم 2 · الباحث الرئيسي" : "Section 2 · Principal investigator"}
              </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isAr ? "الباحث الرئيسي *" : "Principal Investigator *"}</Label>
                <Input placeholder={isAr ? "الاسم الكامل" : "Full name"} value={form.principalInvestigator} onChange={(e) => setForm({ ...form, principalInvestigator: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{isAr ? "البريد الإلكتروني للباحث *" : "PI Email *"}</Label>
                <Input type="email" placeholder="email@institution.edu.sa" value={form.piEmail} onChange={(e) => setForm({ ...form, piEmail: e.target.value })} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isAr ? "المؤسسة *" : "Institution *"}</Label>
                <Input placeholder={isAr ? "اسم الجامعة أو المستشفى" : "University or hospital name"} value={form.piInstitution} onChange={(e) => setForm({ ...form, piInstitution: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{isAr ? "القسم *" : "Department *"}</Label>
                <Input placeholder={isAr ? "القسم أو الشعبة" : "Department or division"} value={form.piDepartment} onChange={(e) => setForm({ ...form, piDepartment: e.target.value })} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isAr ? "مصدر التمويل" : "Funding Source"}</Label>
                <Input placeholder={isAr ? "مثال: تمويل ذاتي" : "e.g., Self-funded, KACST"} value={form.fundingSource} onChange={(e) => setForm({ ...form, fundingSource: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{isAr ? "المدة المتوقعة" : "Estimated Duration"}</Label>
                <Input placeholder={isAr ? "مثال: 12 شهر" : "e.g., 12 months"} value={form.estimatedDuration} onChange={(e) => setForm({ ...form, estimatedDuration: e.target.value })} />
              </div>
            </div>
            </div>

            {/* Research-Type-Specific Fields */}
            {researchType && requirements && (requirements.mandatory.length > 0 || requirements.optional.length > 0) && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm">
                      {isAr ? `متطلبات إضافية لـ ${RESEARCH_TYPE_LABELS[researchType]}` : `Additional Requirements for ${RESEARCH_TYPE_LABELS[researchType]}`}
                    </h4>
                  </div>
                  {requirements.description && <p className="text-sm text-muted-foreground mb-4">{requirements.description}</p>}

                  {researchType === "survey_questionnaire" && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        {isAr ? "ملف الاستبيان *" : "Questionnaire File *"} <AlertCircle className="h-3 w-3 text-red-500" />
                      </Label>
                      {form.questionnaireFileUrl ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm text-emerald-700 truncate flex-1">{isAr ? "تم رفع الملف" : "File uploaded"}</span>
                          <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, questionnaireFileUrl: "" })}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed rounded-lg p-6 text-center">
                          <FileUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground mb-2">{isAr ? "ارفع أداة الاستبيان/المسح" : "Upload your questionnaire/survey instrument"}</p>
                          <input type="file" accept=".pdf,.doc,.docx,.xlsx,.xls" className="hidden" id="questionnaire-upload" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, "questionnaireFileUrl"); }} />
                          <Button variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById("questionnaire-upload")?.click()}>
                            {uploading ? <><Loader2 className="h-3 w-3 me-1 animate-spin" /> {isAr ? "جاري الرفع..." : "Uploading..."}</> : <><Upload className="h-3 w-3 me-1" /> {isAr ? "اختر ملف" : "Choose File"}</>}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {researchType === "retrospective" && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        {isAr ? "مصدر البيانات *" : "Data Source *"} <AlertCircle className="h-3 w-3 text-red-500" />
                      </Label>
                      <Textarea placeholder={isAr ? "صف من أين سيتم الحصول على المعلومات" : "Describe where the information will be obtained from"} value={form.retrospectiveDataSource} onChange={(e) => setForm({ ...form, retrospectiveDataSource: e.target.value })} rows={3} />
                    </div>
                  )}

                  {researchType === "clinical_trial" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{isAr ? "تفاصيل التجربة السريرية (اختياري)" : "Clinical Trial Details (Optional)"}</Label>
                        <Textarea placeholder={isAr ? "قدم تفاصيل إضافية عن التجربة السريرية" : "Provide additional details about the clinical trial"} value={form.clinicalTrialDetails} onChange={(e) => setForm({ ...form, clinicalTrialDetails: e.target.value })} rows={3} />
                      </div>
                      <div className="space-y-2">
                        <Label>{isAr ? "مستندات تكميلية (اختياري)" : "Supplementary Documents (Optional)"}</Label>
                        <p className="text-xs text-muted-foreground">{isAr ? "ارفع أي مستندات داعمة" : "Upload any supporting documents"}</p>
                        {supplementaryFiles.length > 0 && (
                          <div className="space-y-1">
                            {supplementaryFiles.map((f: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm">
                                <CheckCircle className="h-3 w-3 text-emerald-600" />
                                <span className="truncate flex-1">{f.name}</span>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                                  setForm(prev => {
                                    const current = safeParseSupplementary(prev.supplementaryFilesJson);
                                    const updated = current.filter((_, idx) => idx !== i);
                                    return { ...prev, supplementaryFilesJson: JSON.stringify(updated) };
                                  });
                                }}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <input type="file" multiple className="hidden" id="supplementary-upload" onChange={(e) => { const files = e.target.files; if (files) Array.from(files).forEach(file => handleFileUpload(file, "supplementaryFilesJson")); }} />
                        <Button variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById("supplementary-upload")?.click()}>
                          {uploading ? <><Loader2 className="h-3 w-3 me-1 animate-spin" /> {isAr ? "جاري الرفع..." : "Uploading..."}</> : <><Plus className="h-3 w-3 me-1" /> {isAr ? "إضافة ملفات" : "Add Files"}</>}
                        </Button>
                      </div>
                    </div>
                  )}

                  {researchType === "laboratory" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Checkbox id="labHeadApproval" checked={form.labHeadApproval} onCheckedChange={(checked) => setForm({ ...form, labHeadApproval: !!checked })} />
                        <Label htmlFor="labHeadApproval" className="text-sm">{isAr ? "لقد حصلت على موافقة رئيس المختبر" : "I have obtained approval from the Head of Laboratory"}</Label>
                      </div>
                      {form.labHeadApproval && (
                        <div className="grid sm:grid-cols-2 gap-4 ps-6 border-s-2 border-primary/20">
                          <div className="space-y-2">
                            <Label>{isAr ? "اسم رئيس المختبر" : "Lab Head Name"}</Label>
                            <Input placeholder={isAr ? "الاسم الكامل" : "Full name"} value={form.labHeadName} onChange={(e) => setForm({ ...form, labHeadName: e.target.value })} />
                          </div>
                          <div className="space-y-2">
                            <Label>{isAr ? "بريد رئيس المختبر" : "Lab Head Email"}</Label>
                            <Input type="email" placeholder="email@institution.edu.sa" value={form.labHeadEmail} onChange={(e) => setForm({ ...form, labHeadEmail: e.target.value })} />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label>{isAr ? "هاتف رئيس المختبر" : "Lab Head Phone"}</Label>
                            <Input placeholder="+966 5X XXX XXXX" value={form.labHeadPhone} onChange={(e) => setForm({ ...form, labHeadPhone: e.target.value })} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Warning Box: Proceed despite AI */}
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-700 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-1">
                    {isAr ? "تنبيه مهم" : "Important Notice"}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                    {isAr
                      ? "يمكنك المتابعة وتقديم الطلب على الرغم من نتيجة مراجعة الذكاء الاصطناعي. ومع ذلك، إذا اكتشف المراجعون البشريون مخالفات رغم تنبيه الذكاء الاصطناعي، فسيتم إيقاف الحساب والإبلاغ عنه."
                      : "You may proceed and submit your application despite the AI review score. However, if human reviewers discover violations that the AI flagged, your account will be suspended and reported to the relevant authorities."}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Review Result */}
            {showAiResult && aiResult && (
              <Card className={`border-2 ${aiResult.passed ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/30"}`}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Brain className="h-5 w-5 text-primary" />
                    <span className="font-semibold">{isAr ? "مراجعة الذكاء الاصطناعي — المرحلة 1" : "AI Compliance Review — Stage 1"}</span>
                    {aiResult.passed ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"><CheckCircle className="h-3 w-3 me-1" /> {isAr ? "ناجح" : "Passed"}</Badge>
                    ) : (
                      <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"><XCircle className="h-3 w-3 me-1" /> {isAr ? "يحتاج مراجعة" : "Needs Revision"}</Badge>
                    )}
                  </div>
                  {/* Score display with color-coded ring */}
                  <div className="flex items-center gap-6 mb-4 p-4 rounded-lg bg-background/50">
                    <div className="relative h-20 w-20 shrink-0">
                      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                        <circle cx="50" cy="50" r="45" fill="none" strokeWidth="8" strokeLinecap="round"
                          className={`animate-score-fill ${aiResult.score >= 90 ? 'text-emerald-600' : aiResult.score >= 70 ? 'text-emerald-500' : aiResult.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}
                          strokeDasharray="283" strokeDashoffset={283 - (283 * aiResult.score / 100)} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold">{aiResult.score}</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-lg mb-1">{aiResult.score >= 90 ? (isAr ? 'ممتاز' : 'Excellent') : aiResult.score >= 70 ? (isAr ? 'جيد' : 'Good') : aiResult.score >= 50 ? (isAr ? 'يحتاج تحسين' : 'Needs Improvement') : (isAr ? 'يحتاج مراجعة جذرية' : 'Needs Major Revision')}</p>
                      <ReviewFeedback text={aiResult.feedback} isAr={isAr} />
                    </div>
                  </div>
                  {/* Field-level scores with color badges + expandable teaching feedback */}
                  {aiResult.fieldScores?.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <p className="text-sm font-medium">{isAr ? "تقييم الحقول (انقر للتفاصيل):" : "Field assessment (click any row for details):"}</p>
                      {aiResult.fieldScores.map((fs: any, i: number) => {
                        const fieldKey = String(fs.field || "");
                        const isInForm = fieldKey in form;
                        return (
                          <Collapsible key={i}>
                            <CollapsibleTrigger className="w-full text-start group">
                              <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-background/50 hover:bg-background transition-colors">
                                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${fs.color === 'red' ? 'bg-red-500' : fs.color === 'yellow' ? 'bg-amber-500' : fs.color === 'green' ? 'bg-emerald-500' : 'bg-emerald-700'}`} />
                                <span className="font-medium min-w-[120px]">{fs.field}</span>
                                <span className="text-muted-foreground flex-1 truncate">{(fs.feedback || "").split("\n")[0]}</span>
                                <Badge variant="outline" className="text-xs shrink-0">{fs.score}/100</Badge>
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-3 py-3 ms-4 border-l-2 border-muted-foreground/20">
                              <ReviewFeedback
                                text={fs.feedback}
                                isAr={isAr}
                                fieldKey={isInForm ? fieldKey : undefined}
                                onApplyExample={isInForm ? (k, v) => setForm(prev => ({ ...prev, [k]: v })) : undefined}
                              />
                              {fs.suggestion && fs.suggestion !== fs.feedback && (
                                <div className="mt-2 pt-2 border-t border-muted-foreground/10">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                                    {isAr ? "بديل كامل (100/100)" : "Drop-in replacement (100/100)"}
                                  </p>
                                  <p className="text-sm font-mono whitespace-pre-line bg-background/60 p-2 rounded">{fs.suggestion}</p>
                                  {isInForm && (
                                    <Button
                                      type="button" size="sm" variant="outline"
                                      className="mt-2 h-7 text-xs"
                                      onClick={() => { setForm(prev => ({ ...prev, [fieldKey]: fs.suggestion })); toast.success(isAr ? "تم التطبيق" : "Replaced field"); }}
                                    >{isAr ? "استبدل الحقل" : "Replace field"}</Button>
                                  )}
                                </div>
                              )}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  )}
                  {aiResult.recommendations?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-1">{isAr ? "التوصيات:" : "Recommendations:"}</p>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside marker:text-primary">
                        {aiResult.recommendations.map((r: string, i: number) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI Enhance review-required banner */}
            {enhanceAlert && (
              <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
                <CardContent className="py-3 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-amber-900 dark:text-amber-200 mb-0.5">
                      {isAr ? "أعد المراجعة قبل التقديم" : "Please review before submitting"}
                    </p>
                    <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                      {isAr
                        ? "أعاد الذكاء الاصطناعي صياغة حقولك لتلبية معايير IRB. راجع كل حقل وعدّل أي شيء لا يطابق دراستك الفعلية. أنت مسؤول عن صحة جميع المحتويات."
                        : "AI rewrote your fields to better match IRB standards. Review every field and edit anything that doesn't match your actual study. You remain responsible for the truthfulness of all content."}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="border-amber-400" onClick={() => setEnhanceAlert(false)}>
                    {isAr ? "تمت المراجعة" : "I've reviewed"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* 60-second undo pill */}
            {undoExpiresAt && undoExpiresAt > Date.now() && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleUndoEnhance}
                  className="text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 rounded-full px-3 py-1 hover:bg-amber-200 dark:hover:bg-amber-900"
                >
                  {isAr ? "تراجع عن التحسين" : "Undo AI enhance"}
                </button>
              </div>
            )}

            {/* Proceed Despite Score Modal */}
            {showProceedDespiteModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <Card className="w-full max-w-lg apple-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      {isAr ? "المتابعة رغم نتيجة الذكاء الاصطناعي" : "Proceed Despite AI Score"}
                    </CardTitle>
                    <CardDescription>
                      {isAr
                        ? "سيتم وضع علامة حمراء على طلبك للمراجعة الدقيقة. يرجى توضيح سبب المتابعة."
                        : "Your application will be RED FLAGGED for careful investigation. Please explain why you are proceeding despite the AI review."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>{isAr ? "سبب المتابعة" : "Reason for Proceeding"} *</Label>
                      <Textarea
                        value={proceedDespiteReason}
                        onChange={(e) => setProceedDespiteReason(e.target.value)}
                        placeholder={isAr ? "اشرح لماذا تريد المتابعة رغم نتيجة مراجعة الذكاء الاصطناعي..." : "Explain why you want to proceed despite the AI review score..."}
                        rows={4}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-3 justify-end">
                      <Button variant="outline" onClick={() => { setShowProceedDespiteModal(false); setProceedDespiteReason(""); }}>
                        {isAr ? "إلغاء" : "Cancel"}
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={proceedDespiteReason.trim().length === 0 || proceedDespite.isPending}
                        onClick={async () => {
                          try {
                            await proceedDespite.mutateAsync({ id: appId, reason: proceedDespiteReason });
                            toast.success(isAr ? "تم المتابعة — الطلب يحمل علامة حمراء" : "Proceeded — application is RED FLAGGED");
                            setShowProceedDespiteModal(false);
                            setLocation(`/apply/${appId}/stage2`);
                          } catch (e: any) {
                            toast.error(e.message || "Failed");
                          }
                        }}
                      >
                        {proceedDespite.isPending ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <AlertCircle className="h-4 w-4 me-1" />}
                        {isAr ? "تأكيد المتابعة" : "Confirm & Proceed"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setLocation("/dashboard")}>
                <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "رجوع" : "Back"}
              </Button>
              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={handleSaveAndReview} disabled={saveStage1.isPending || runAiReview.isPending || aiEnhanceStage1.isPending}>
                  {(saveStage1.isPending || runAiReview.isPending) ? (
                    <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {isAr ? "جاري المراجعة..." : "Reviewing..."}</>
                  ) : (
                    <><Brain className="h-4 w-4 me-2" /> {isAr ? "حفظ ومراجعة AI" : "Save & AI Review"}</>
                  )}
                </Button>
                {showAiResult && aiResult && typeof aiResult.score === "number" && aiResult.score < 90 && (
                  <Button variant="default" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleAiEnhance} disabled={aiEnhanceStage1.isPending}>
                    {aiEnhanceStage1.isPending ? (
                      <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {enhanceProgress || (isAr ? "جاري التحسين..." : "Enhancing…")}</>
                    ) : (
                      <><Sparkles className="h-4 w-4 me-1" /> {isAr ? "تحسين AI" : "AI Enhance"}</>
                    )}
                  </Button>
                )}
                {showAiResult && aiResult && typeof aiResult.score === "number" && aiResult.score >= 65 && (
                  <Button className="btn-apple shadow-sm" onClick={() => setLocation(`/apply/${appId}/stage2`)}>
                    {isAr ? "المرحلة الثانية" : "Proceed to Stage 2"} <ArrowRight className="h-4 w-4 ms-1" />
                  </Button>
                )}
                {showAiResult && aiResult && typeof aiResult.score === "number" && aiResult.score < 65 && (
                  <Button variant="destructive" className="btn-apple" onClick={() => setShowProceedDespiteModal(true)}>
                    <AlertCircle className="h-4 w-4 me-1" />
                    {isAr ? "المتابعة رغم النتيجة" : "Proceed Despite Score"}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Authors Section */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {isAr ? "مؤلفو البحث" : "Research Authors"}
                </CardTitle>
                <CardDescription>{isAr ? "أضف جميع المؤلفين المشاركين والمتعاونين" : "Add all co-authors and collaborators for this research"}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowAuthorForm(!showAuthorForm)}>
                <UserPlus className="h-4 w-4 me-1" /> {isAr ? "إضافة مؤلف" : "Add Author"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {existingAuthors && existingAuthors.length > 0 ? (
              <div className="space-y-3 mb-4">
                {existingAuthors.map((author) => (
                  <div key={author.id} className="flex items-start justify-between p-3 rounded-lg border bg-card">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{author.name}</p>
                      <p className="text-xs text-muted-foreground">{author.email}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {author.institution && <span>{author.institution}</span>}
                        {author.department && <span>• {author.department}</span>}
                        {author.country && <span>• {author.country}</span>}
                      </div>
                      {author.phone && <p className="text-xs text-muted-foreground mt-0.5">{author.phone}</p>}
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 shrink-0" onClick={() => handleRemoveAuthor(author.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              !showAuthorForm && <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لم يتم إضافة مؤلفين بعد." : "No authors added yet. Click \"Add Author\" to add research collaborators."}</p>
            )}

            {showAuthorForm && (
              <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                <h4 className="font-medium text-sm">{isAr ? "مؤلف جديد" : "New Author"}</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "الاسم *" : "Name *"}</Label>
                    <Input placeholder={isAr ? "الاسم الكامل" : "Full name"} value={newAuthor.name} onChange={(e) => setNewAuthor({ ...newAuthor, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "البريد الإلكتروني *" : "Email *"}</Label>
                    <Input type="email" placeholder="email@institution.edu" value={newAuthor.email} onChange={(e) => setNewAuthor({ ...newAuthor, email: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "الهاتف" : "Phone"}</Label>
                    <Input placeholder="+966 5X XXX XXXX" value={newAuthor.phone} onChange={(e) => setNewAuthor({ ...newAuthor, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "المؤسسة" : "Institution"}</Label>
                    <Input placeholder={isAr ? "جامعة أو مستشفى" : "University or hospital"} value={newAuthor.institution} onChange={(e) => setNewAuthor({ ...newAuthor, institution: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "القسم" : "Department"}</Label>
                    <Input placeholder={isAr ? "القسم" : "Department"} value={newAuthor.department} onChange={(e) => setNewAuthor({ ...newAuthor, department: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "الدولة" : "Country"}</Label>
                    <Input placeholder={isAr ? "الدولة" : "Country"} value={newAuthor.country} onChange={(e) => setNewAuthor({ ...newAuthor, country: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowAuthorForm(false); setNewAuthor({ ...emptyAuthor }); }}>{isAr ? "إلغاء" : "Cancel"}</Button>
                  <Button size="sm" onClick={handleAddAuthor} disabled={addAuthor.isPending}>
                    {addAuthor.isPending ? <Loader2 className="h-3 w-3 me-1 animate-spin" /> : <Plus className="h-3 w-3 me-1" />}
                    {isAr ? "إضافة مؤلف" : "Add Author"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
