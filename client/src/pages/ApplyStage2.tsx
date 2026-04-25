import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { ArrowLeft, ArrowRight, Brain, CheckCircle, XCircle, Loader2, Upload, Wand2, Calculator, Save, Star, MessageSquare, Lightbulb } from "lucide-react";

export default function ApplyStage2() {
  const { id } = useParams<{ id: string }>();
  const appId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { t, lang } = useT();
  const isAr = lang === "ar";

  const { data: app, isLoading } = trpc.application.getById.useQuery(
    { id: appId }, { enabled: isAuthenticated && appId > 0 }
  );

  const [form, setForm] = useState({
    researchObjectives: "", methodology: "", sampleSize: "", targetPopulation: "",
    inclusionCriteria: "", exclusionCriteria: "", dataCollectionMethods: "",
    informedConsentProcess: "", riskAssessment: "", benefitAssessment: "",
    confidentialityMeasures: "", conflictOfInterest: "",
  });
  const [rejectionFileUrl, setRejectionFileUrl] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);
  const [showAiResult, setShowAiResult] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [showProceedDespiteModal, setShowProceedDespiteModal] = useState(false);
  const [proceedDespiteReason, setProceedDespiteReason] = useState("");
  const [fixingAll, setFixingAll] = useState(false);
  const proceedDespite = trpc.application.proceedDespiteStage2.useMutation();
  const fixAllComments = trpc.application.fixAllComments.useMutation();

  // Sample size calculator state
  const [calcForm, setCalcForm] = useState({
    studyType: "cross_sectional", confidenceLevel: 95, marginOfError: 5,
    populationSize: 0, expectedProportion: 50,
  });
  const [calcResult, setCalcResult] = useState<any>(null);

  // Auto-save timer
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const saveDraft = trpc.application.saveDraft.useMutation();

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        setAutoSaving(true);
        await saveDraft.mutateAsync({ id: appId, ...form, rejectionFileUrl: rejectionFileUrl || undefined });
        setLastSaved(new Date());
        setAutoSaving(false);
      } catch (e) {
        setAutoSaving(false);
      }
    }, 3000);
  }, [form, appId, rejectionFileUrl]);

  useEffect(() => {
    if (app && appId > 0) triggerAutoSave();
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [form]);

  useEffect(() => {
    if (app) {
      setForm({
        researchObjectives: app.researchObjectives || "", methodology: app.methodology || "",
        sampleSize: app.sampleSize || "", targetPopulation: app.targetPopulation || "",
        inclusionCriteria: app.inclusionCriteria || "", exclusionCriteria: app.exclusionCriteria || "",
        dataCollectionMethods: app.dataCollectionMethods || "", informedConsentProcess: app.informedConsentProcess || "",
        riskAssessment: app.riskAssessment || "", benefitAssessment: app.benefitAssessment || "",
        confidentialityMeasures: app.confidentialityMeasures || "", conflictOfInterest: app.conflictOfInterest || "",
      });
      setRejectionFileUrl(app.rejectionFileUrl || "");
      if (app.stage2AiFeedback) {
        try {
          const parsed = JSON.parse(app.stage2AiFeedback);
          setAiResult({ score: app.stage2AiScore, passed: app.stage2Passed, ...parsed });
          setShowAiResult(true);
        } catch (e) {}
      }
    }
  }, [app]);

  const saveStage2 = trpc.application.saveStage2.useMutation();
  const runAiReview = trpc.application.runStage2Review.useMutation();
  const uploadFile = trpc.application.uploadFile.useMutation();
  const aiAutoComplete = trpc.application.aiAutoComplete.useMutation();
  const aiResolveField = trpc.application.aiResolveField.useMutation();
  const [resolvingField, setResolvingField] = useState<string | null>(null);

  const handleResolveField = async (fieldKey: string) => {
    setResolvingField(fieldKey);
    try {
      const result = await aiResolveField.mutateAsync({
        id: appId,
        fieldName: fieldKey,
        currentValue: (form as any)[fieldKey] || "",
        feedback: aiResult?.fieldSuggestions?.[fieldKey] || "Please improve this field to meet IRB standards.",
        context: { researchTitle: app?.researchTitle || "", researchType: app?.researchType || "", piInstitution: app?.piInstitution || "" },
      });
      setForm(prev => ({ ...prev, [fieldKey]: result.enhancedValue }));
      toast.success(isAr ? "تم تحسين الحقل بنجاح" : "Field resolved by AI");
    } catch (error: any) {
      toast.error(error.message || (isAr ? "فشل التحسين" : "Resolve failed"));
    } finally {
      setResolvingField(null);
    }
  };
  const sampleSizeCalc = trpc.application.calculateSampleSize.useMutation();
  const submitFeedback = trpc.application.submitAiFeedback.useMutation();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error(isAr ? "حجم الملف يجب أن يكون أقل من 10 ميجابايت" : "File size must be under 10MB"); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const result = await uploadFile.mutateAsync({ fileName: file.name, fileData: base64, contentType: file.type });
        setRejectionFileUrl(result.url);
        toast.success(isAr ? "تم رفع الملف بنجاح" : "File uploaded successfully");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) { toast.error(isAr ? "فشل الرفع" : "Upload failed"); setUploading(false); }
  };

  const handleAiAutoComplete = async () => {
    try {
      toast.info(isAr ? "جاري تحسين الحقول بالذكاء الاصطناعي..." : "AI is enhancing your fields...");
      const result = await aiAutoComplete.mutateAsync({ id: appId, existingFields: form });
      setForm(prev => {
        const updated = { ...prev };
        for (const [key, value] of Object.entries(result)) {
          if (key in updated && value) (updated as any)[key] = value;
        }
        return updated;
      });
      toast.success(isAr ? "تم تحسين الحقول بنجاح!" : "Fields enhanced successfully!");
    } catch (error: any) {
      toast.error(error.message || (isAr ? "فشل التحسين" : "Enhancement failed"));
    }
  };

  const handleCalculateSampleSize = async () => {
    try {
      const result = await sampleSizeCalc.mutateAsync(calcForm);
      setCalcResult(result);
    } catch (error: any) {
      toast.error(error.message || "Calculation failed");
    }
  };

  const handleApplyCalcResult = () => {
    if (calcResult) {
      setForm(prev => ({ ...prev, sampleSize: `${calcResult.recommendedSize} participants (${calcResult.explanation})` }));
      setShowCalc(false);
      toast.success(isAr ? "تم تطبيق حجم العينة" : "Sample size applied");
    }
  };

  const handleSaveAndReview = async () => {
    const requiredFields = ["researchObjectives", "methodology", "sampleSize", "targetPopulation", "inclusionCriteria", "exclusionCriteria", "dataCollectionMethods", "informedConsentProcess", "riskAssessment", "benefitAssessment", "confidentialityMeasures", "conflictOfInterest"];
    const missing = requiredFields.filter((f) => !(form as any)[f]?.trim());
    if (missing.length > 0) { toast.error(isAr ? "يرجى ملء جميع الحقول المطلوبة" : "Please fill in all required fields"); return; }
    try {
      await saveStage2.mutateAsync({ id: appId, ...form, rejectionFileUrl: rejectionFileUrl || undefined });
      toast.success(isAr ? "تم حفظ المرحلة الثانية. جاري مراجعة الأخلاقيات..." : "Stage 2 saved. Running AI ethics review...");
      const result = await runAiReview.mutateAsync({ id: appId });
      setAiResult(result); setShowAiResult(true);
      if (result.passed) {
        toast.success(isAr ? `تم اجتياز المراجعة! الدرجة: ${result.score}/100` : `AI Ethics Review Passed! Score: ${result.score}/100`);
      } else {
        toast.error(isAr ? `الدرجة ${result.score}/100. الحد الأدنى 70 مطلوب.` : `AI Ethics Review: Score ${result.score}/100. Minimum 70 required.`);
      }
    } catch (error: any) { toast.error(error.message || "Failed"); }
  };

  const handleManualSave = async () => {
    try {
      setAutoSaving(true);
      await saveDraft.mutateAsync({ id: appId, ...form, rejectionFileUrl: rejectionFileUrl || undefined });
      setLastSaved(new Date());
      setAutoSaving(false);
      toast.success(isAr ? "تم حفظ المسودة" : "Draft saved");
    } catch (e) {
      setAutoSaving(false);
      toast.error(isAr ? "فشل الحفظ" : "Save failed");
    }
  };

  const handleSubmitFeedback = async () => {
    if (feedbackRating === 0) { toast.error(isAr ? "يرجى تقييم المراجعة" : "Please rate the review"); return; }
    try {
      await submitFeedback.mutateAsync({ applicationId: appId, stage: 2, rating: feedbackRating, comment: feedbackComment || undefined });
      toast.success(isAr ? "شكراً لملاحظاتك!" : "Thank you for your feedback!");
      setShowFeedback(false);
    } catch (e) {
      toast.error(isAr ? "فشل الإرسال" : "Submission failed");
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const fieldGroups = [
    {
      title: isAr ? "تصميم البحث" : "Research Design",
      fields: [
        { key: "researchObjectives", label: isAr ? "أهداف البحث *" : "Research Objectives *", type: "textarea", placeholder: isAr ? "صف الأهداف الأساسية والثانوية لبحثك" : "Describe the primary and secondary objectives" },
        { key: "methodology", label: isAr ? "المنهجية *" : "Methodology *", type: "textarea", placeholder: isAr ? "صف تصميم البحث والأساليب والإجراءات" : "Describe the research design, methods, and procedures" },
        { key: "sampleSize", label: isAr ? "حجم العينة *" : "Sample Size *", type: "input", placeholder: isAr ? "مثال: 200 مشارك" : "e.g., 200 participants", hasCalc: true },
        { key: "targetPopulation", label: isAr ? "السكان المستهدفون *" : "Target Population *", type: "textarea", placeholder: isAr ? "صف السكان الذين تنوي دراستهم" : "Describe the population you intend to study" },
      ],
    },
    {
      title: isAr ? "معايير الاختيار" : "Selection Criteria",
      fields: [
        { key: "inclusionCriteria", label: isAr ? "معايير الإدراج *" : "Inclusion Criteria *", type: "textarea", placeholder: isAr ? "اذكر معايير إدراج المشاركين" : "List the criteria for including participants" },
        { key: "exclusionCriteria", label: isAr ? "معايير الاستبعاد *" : "Exclusion Criteria *", type: "textarea", placeholder: isAr ? "اذكر معايير استبعاد المشاركين" : "List the criteria for excluding participants" },
      ],
    },
    {
      title: isAr ? "البيانات والموافقة" : "Data & Consent",
      fields: [
        { key: "dataCollectionMethods", label: isAr ? "طرق جمع البيانات *" : "Data Collection Methods *", type: "textarea", placeholder: isAr ? "صف كيف سيتم جمع البيانات وتخزينها وتحليلها" : "Describe how data will be collected, stored, and analyzed" },
        { key: "informedConsentProcess", label: isAr ? "عملية الموافقة المستنيرة *" : "Informed Consent Process *", type: "textarea", placeholder: isAr ? "صف كيف سيتم الحصول على الموافقة المستنيرة" : "Describe how informed consent will be obtained" },
      ],
    },
    {
      title: isAr ? "الأخلاقيات وتقييم المخاطر" : "Ethics & Risk Assessment",
      fields: [
        { key: "riskAssessment", label: isAr ? "تقييم المخاطر *" : "Risk Assessment *", type: "textarea", placeholder: isAr ? "حدد ووصف المخاطر المحتملة على المشاركين" : "Identify and describe potential risks to participants" },
        { key: "benefitAssessment", label: isAr ? "تقييم الفوائد *" : "Benefit Assessment *", type: "textarea", placeholder: isAr ? "صف الفوائد المحتملة للبحث" : "Describe the potential benefits of the research" },
        { key: "confidentialityMeasures", label: isAr ? "إجراءات السرية *" : "Confidentiality Measures *", type: "textarea", placeholder: isAr ? "صف إجراءات حماية خصوصية المشاركين" : "Describe measures to protect participant privacy" },
        { key: "conflictOfInterest", label: isAr ? "إعلان تضارب المصالح *" : "Conflict of Interest Declaration *", type: "textarea", placeholder: isAr ? "أعلن عن أي تضارب في المصالح أو اذكر 'لا يوجد'" : "Declare any conflicts of interest or state 'None'" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary text-primary-foreground">{isAr ? "المرحلة 2 من 2" : "Stage 2 of 2"}</Badge>
              <span className="text-sm text-muted-foreground">{isAr ? "تفاصيل البحث والأخلاقيات" : "Research Details & Ethics"}</span>
            </div>
            <div className="flex items-center gap-2">
              {autoSaving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {isAr ? "حفظ تلقائي..." : "Auto-saving..."}</span>}
              {lastSaved && !autoSaving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Save className="h-3 w-3" /> {isAr ? "تم الحفظ" : "Saved"} {lastSaved.toLocaleTimeString()}</span>}
              <Button variant="ghost" size="sm" onClick={handleManualSave} disabled={saveDraft.isPending}>
                <Save className="h-4 w-4 me-1" /> {isAr ? "حفظ المسودة" : "Save Draft"}
              </Button>
            </div>
          </div>
          <Progress value={100} className="h-2" />
        </div>

        {/* App Summary */}
        {app && (
          <Card className="mb-6 bg-muted/30">
            <CardContent className="py-4">
              <div className="text-sm">
                <span className="font-medium">{app.researchTitle}</span>
                <span className="text-muted-foreground"> — {app.principalInvestigator} • {app.piInstitution}</span>
                {app.stage1AiScore !== null && (
                  <Badge variant="outline" className="ms-2 text-xs">{isAr ? "المرحلة 1" : "Stage 1"}: {app.stage1AiScore}/100</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resubmission Notice */}
        {app && app.submissionCount > 1 && (
          <Card className="mb-6 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm">
                <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">{isAr ? `إعادة تقديم #${app.submissionCount}` : `Resubmission #${app.submissionCount}`}</Badge>
                <span className="text-orange-700 dark:text-orange-300">{isAr ? "هذا إعادة تقديم. يمكنك رفع ملف الرفض السابق أدناه." : "This is a resubmission. You may upload the previous rejection file below."}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Auto-Complete Button */}
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wand2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{isAr ? "تحسين بالذكاء الاصطناعي" : "AI Auto-Complete & Enhance"}</p>
                  <p className="text-xs text-muted-foreground">{isAr ? "اترك الذكاء الاصطناعي يكمل ويحسن جميع الحقول تلقائياً" : "Let AI fill in empty fields and enhance existing content to meet IRB standards"}</p>
                </div>
              </div>
              <Button onClick={handleAiAutoComplete} disabled={aiAutoComplete.isPending} className="shrink-0">
                {aiAutoComplete.isPending ? (
                  <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {isAr ? "جاري التحسين..." : "Enhancing..."}</>
                ) : (
                  <><Wand2 className="h-4 w-4 me-2" /> {isAr ? "تحسين تلقائي" : "AI Auto-Fill"}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {fieldGroups.map((group, gi) => (
            <Card key={gi}>
              <CardHeader className="pb-4"><CardTitle className="text-lg">{group.title}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {group.fields.map((field: any) => (
                  <div key={field.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{field.label}</Label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs text-primary"
                          onClick={() => handleResolveField(field.key)}
                          disabled={resolvingField === field.key}
                        >
                          {resolvingField === field.key ? (
                            <><Loader2 className="h-3 w-3 me-1 animate-spin" /> {isAr ? "جاري..." : "Resolving..."}</>
                          ) : (
                            <><Wand2 className="h-3 w-3 me-1" /> {isAr ? "تحسين AI" : "AI Resolve"}</>
                          )}
                        </Button>
                        {field.hasCalc && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCalc(true)}>
                            <Calculator className="h-3 w-3 me-1" /> {isAr ? "حاسبة" : "Calculator"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Show field-specific AI suggestion if review failed */}
                    {aiResult && !aiResult.passed && aiResult.fieldSuggestions?.[field.key] && (
                      <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
                        <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium text-amber-700 dark:text-amber-300">{isAr ? "اقتراح:" : "Suggestion:"} </span>
                          <span className="text-amber-600 dark:text-amber-400">{aiResult.fieldSuggestions[field.key]}</span>
                        </div>
                      </div>
                    )}
                    {field.type === "textarea" ? (
                      <Textarea placeholder={field.placeholder} value={(form as any)[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} rows={4} className="resize-y" />
                    ) : (
                      <Input placeholder={field.placeholder} value={(form as any)[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Rejection File Upload */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{isAr ? "وثائق الرفض السابقة (اختياري)" : "Previous Rejection Documentation (Optional)"}</CardTitle>
              <CardDescription>{isAr ? "إذا كان هذا إعادة تقديم، ارفع ملف الرفض السابق للمقارنة." : "If this is a resubmission, upload the previous rejection file for comparison."}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm">{uploading ? (isAr ? "جاري الرفع..." : "Uploading...") : (isAr ? "اختر ملف" : "Choose File")}</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.png,.jpg" />
                </label>
                {rejectionFileUrl && (
                  <a href={rejectionFileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                    {isAr ? "عرض الملف المرفوع" : "View uploaded file"}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI Review Result */}
          {showAiResult && aiResult && (
            <Card className={`border-2 ${aiResult.passed ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"}`}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Brain className="h-5 w-5 text-primary" />
                    <span className="font-semibold">{isAr ? "مراجعة الأخلاقيات — المرحلة 2" : "AI Ethics & Protocol Review — Stage 2"}</span>
                    {aiResult.passed ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"><CheckCircle className="h-3 w-3 me-1" /> {isAr ? "ناجح" : "Passed"}</Badge>
                    ) : (
                      <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"><XCircle className="h-3 w-3 me-1" /> {isAr ? "يحتاج مراجعة" : "Needs Revision"}</Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowFeedback(true)}>
                    <MessageSquare className="h-4 w-4 me-1" /> {isAr ? "ملاحظات" : "Feedback"}
                  </Button>
                </div>
                {/* Enhanced Score Display with Ring */}
                <div className="flex items-center gap-6 mb-4 p-4 rounded-lg bg-background/50">
                  <div className="relative h-20 w-20 shrink-0">
                    <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                      <circle cx="50" cy="50" r="45" fill="none" strokeWidth="8" strokeLinecap="round"
                        className={`${aiResult.score >= 90 ? 'text-emerald-600' : aiResult.score >= 70 ? 'text-emerald-500' : aiResult.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}
                        strokeDasharray="283" strokeDashoffset={283 - (283 * aiResult.score / 100)} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold">{aiResult.score}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-lg mb-1">{aiResult.score >= 90 ? (isAr ? 'ممتاز' : 'Excellent') : aiResult.score >= 70 ? (isAr ? 'جيد' : 'Good') : aiResult.score >= 50 ? (isAr ? 'يحتاج تحسين' : 'Needs Improvement') : (isAr ? 'يحتاج مراجعة جذرية' : 'Needs Major Revision')}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{aiResult.feedback}</p>
                  </div>
                </div>
                {/* Color-coded field scores */}
                {aiResult.fieldScores?.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-medium">{isAr ? "تقييم الحقول:" : "Field Assessment:"}</p>
                    {aiResult.fieldScores.map((fs: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-background/50">
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${fs.color === 'red' ? 'bg-red-500' : fs.color === 'yellow' ? 'bg-amber-500' : fs.color === 'green' ? 'bg-emerald-500' : 'bg-emerald-700'}`} />
                        <span className="font-medium min-w-[140px] capitalize">{fs.field.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-muted-foreground flex-1 truncate">{fs.feedback}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{fs.score}/100</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {aiResult.recommendations?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1">{isAr ? "التوصيات:" : "Recommendations:"}</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {aiResult.recommendations.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span><span>{r}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Fix All Comments Button */}
                {!aiResult.passed && aiResult.fieldScores?.length > 0 && (
                  <div className="mt-4 flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/50"
                      disabled={fixingAll}
                      onClick={async () => {
                        setFixingAll(true);
                        try {
                          const result = await fixAllComments.mutateAsync({
                            id: appId,
                            fields: form,
                            fieldScores: aiResult.fieldScores,
                          });
                          setForm(prev => ({ ...prev, ...result }));
                          toast.success(isAr ? "تم إصلاح جميع الملاحظات بنجاح" : "All comments fixed by AI. Please review and re-run AI Review.");
                        } catch (e: any) {
                          toast.error(e.message || (isAr ? "فشل إصلاح الملاحظات" : "Failed to fix comments"));
                        } finally {
                          setFixingAll(false);
                        }
                      }}
                    >
                      {fixingAll ? (
                        <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {isAr ? "جاري إصلاح الملاحظات..." : "Fixing All Comments..."}</>
                      ) : (
                        <><Wand2 className="h-4 w-4 me-2" /> {isAr ? "إصلاح جميع الملاحظات بالذكاء الاصطناعي" : "Fix All Comments with AI"}</>
                      )}
                    </Button>
                  </div>
                )}
                {/* Field-specific suggestions */}
                {!aiResult.passed && aiResult.fieldSuggestions && Object.keys(aiResult.fieldSuggestions).length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" /> {isAr ? "اقتراحات لتحسين الحقول:" : "Field-Specific Improvement Suggestions:"}
                    </p>
                    <div className="space-y-2">
                      {Object.entries(aiResult.fieldSuggestions).map(([key, suggestion]) => (
                        <div key={key} className="text-xs">
                          <span className="font-medium text-amber-800 dark:text-amber-200 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}: </span>
                          <span className="text-amber-600 dark:text-amber-400">{suggestion as string}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={() => setLocation(`/apply/${appId}/stage1`)}>
              <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "العودة للمرحلة 1" : "Back to Stage 1"}
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleSaveAndReview} disabled={saveStage2.isPending || runAiReview.isPending}>
                {(saveStage2.isPending || runAiReview.isPending) ? (
                  <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {isAr ? "جاري المراجعة..." : "Reviewing..."}</>
                ) : (
                  <><Brain className="h-4 w-4 me-2" /> {isAr ? "حفظ ومراجعة AI" : "Save & AI Review"}</>
                )}
              </Button>
              {aiResult?.passed && (
                <Button className="btn-apple shadow-sm" onClick={() => setLocation(`/apply/${appId}/submit`)}>
                  {isAr ? "تقديم الطلب" : "Submit Application"} <ArrowRight className="h-4 w-4 ms-1" />
                </Button>
              )}
              {showAiResult && aiResult && !aiResult.passed && (
                <Button variant="destructive" className="btn-apple" onClick={() => setShowProceedDespiteModal(true)}>
                  <XCircle className="h-4 w-4 me-1" />
                  {isAr ? "المتابعة رغم النتيجة" : "Proceed Despite Score"}
                </Button>
              )}
            </div>
          </div>

          {/* Proceed Despite Score Modal */}
          {showProceedDespiteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <Card className="w-full max-w-lg apple-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <XCircle className="h-5 w-5" />
                    {isAr ? "المتابعة رغم نتيجة الذكاء الاصطناعي" : "Proceed Despite AI Score"}
                  </CardTitle>
                  <CardDescription>
                    {isAr
                      ? "سيتم وضع علامة حمراء على طلبك للمراجعة الدقيقة من قبل اللجنة. يرجى توضيح سبب المتابعة."
                      : "Your application will be RED FLAGGED for careful investigation by the committee. Please explain why you are proceeding despite the AI ethics review."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>{isAr ? "سبب المتابعة" : "Reason for Proceeding"} *</Label>
                    <Textarea
                      value={proceedDespiteReason}
                      onChange={(e) => setProceedDespiteReason(e.target.value)}
                      placeholder={isAr ? "اشرح لماذا تريد المتابعة رغم نتيجة مراجعة الذكاء الاصطناعي..." : "Explain why you want to proceed despite the AI ethics review score..."}
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
                      disabled={proceedDespiteReason.length < 10 || proceedDespite.isPending}
                      onClick={async () => {
                        try {
                          await proceedDespite.mutateAsync({ id: appId, reason: proceedDespiteReason });
                          toast.success(isAr ? "تم المتابعة — الطلب يحمل علامة حمراء" : "Proceeded — application is RED FLAGGED");
                          setShowProceedDespiteModal(false);
                          setLocation(`/apply/${appId}/submit`);
                        } catch (e: any) {
                          toast.error(e.message || "Failed");
                        }
                      }}
                    >
                      {proceedDespite.isPending ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <XCircle className="h-4 w-4 me-1" />}
                      {isAr ? "تأكيد المتابعة" : "Confirm & Proceed"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Sample Size Calculator Dialog */}
        <Dialog open={showCalc} onOpenChange={setShowCalc}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                {isAr ? "حاسبة حجم العينة" : "Sample Size Calculator"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{isAr ? "نوع الدراسة" : "Study Type"}</Label>
                <Select value={calcForm.studyType} onValueChange={(v) => setCalcForm({ ...calcForm, studyType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cross_sectional">{isAr ? "مقطعية" : "Cross-Sectional"}</SelectItem>
                    <SelectItem value="cohort">{isAr ? "أتراب" : "Cohort"}</SelectItem>
                    <SelectItem value="case_control">{isAr ? "حالات وشواهد" : "Case-Control"}</SelectItem>
                    <SelectItem value="rct">{isAr ? "تجربة عشوائية" : "Randomized Controlled Trial"}</SelectItem>
                    <SelectItem value="survey">{isAr ? "مسح" : "Survey"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{isAr ? "مستوى الثقة (%)" : "Confidence Level (%)"}</Label>
                  <Select value={String(calcForm.confidenceLevel)} onValueChange={(v) => setCalcForm({ ...calcForm, confidenceLevel: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="90">90%</SelectItem>
                      <SelectItem value="95">95%</SelectItem>
                      <SelectItem value="99">99%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isAr ? "هامش الخطأ (%)" : "Margin of Error (%)"}</Label>
                  <Input type="number" value={calcForm.marginOfError} onChange={(e) => setCalcForm({ ...calcForm, marginOfError: Number(e.target.value) })} min={1} max={20} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{isAr ? "حجم المجتمع (اختياري)" : "Population Size (optional)"}</Label>
                  <Input type="number" value={calcForm.populationSize || ""} onChange={(e) => setCalcForm({ ...calcForm, populationSize: Number(e.target.value) || 0 })} placeholder={isAr ? "اتركه فارغاً لمجتمع لانهائي" : "Leave empty for infinite"} />
                </div>
                <div className="space-y-2">
                  <Label>{isAr ? "النسبة المتوقعة (%)" : "Expected Proportion (%)"}</Label>
                  <Input type="number" value={calcForm.expectedProportion} onChange={(e) => setCalcForm({ ...calcForm, expectedProportion: Number(e.target.value) })} min={1} max={99} />
                </div>
              </div>
              <Button onClick={handleCalculateSampleSize} disabled={sampleSizeCalc.isPending} className="w-full">
                {sampleSizeCalc.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Calculator className="h-4 w-4 me-2" />}
                {isAr ? "احسب" : "Calculate"}
              </Button>
              {calcResult && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="py-4 space-y-2">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">{isAr ? "حجم العينة الموصى به" : "Recommended Sample Size"}</p>
                      <p className="text-3xl font-bold text-primary">{calcResult.recommendedSize}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{calcResult.explanation}</p>
                    <p className="text-xs font-mono text-muted-foreground bg-muted/50 p-2 rounded">{calcResult.formula}</p>
                    <Button size="sm" onClick={handleApplyCalcResult} className="w-full">
                      {isAr ? "تطبيق على حقل حجم العينة" : "Apply to Sample Size Field"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Feedback Dialog */}
        <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                {isAr ? "ملاحظات على مراجعة AI" : "AI Review Feedback"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{isAr ? "التقييم" : "Rating"}</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setFeedbackRating(star)} className="p-1 hover:scale-110 transition-transform">
                      <Star className={`h-6 w-6 ${star <= feedbackRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{isAr ? "تعليق (اختياري)" : "Comment (optional)"}</Label>
                <Textarea value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} placeholder={isAr ? "شاركنا ملاحظاتك..." : "Share your thoughts..."} rows={3} />
              </div>
              <Button onClick={handleSubmitFeedback} disabled={submitFeedback.isPending} className="w-full">
                {submitFeedback.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : null}
                {isAr ? "إرسال الملاحظات" : "Submit Feedback"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
