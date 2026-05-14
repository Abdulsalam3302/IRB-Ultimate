import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import {
  ArrowLeft, ArrowRight, Shield, FileCheck, Upload,
  Loader2, CheckCircle, AlertTriangle, BookOpen, FileUp, Trash2
} from "lucide-react";

export default function Declaration() {
  const { id } = useParams<{ id: string }>();
  const appId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { t, lang } = useT();
  const isAr = lang === "ar";

  const { data: app, isLoading } = trpc.application.getById.useQuery(
    { id: appId }, { enabled: isAuthenticated && appId > 0 }
  );

  const [honesty, setHonesty] = useState(false);
  const [nbce, setNbce] = useState(false);
  const [consent, setConsent] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [certUrl, setCertUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (app) {
      setHonesty(!!app.declarationHonesty);
      setNbce(!!app.declarationNbceCertification);
      setConsent(!!app.declarationConsentTruth);
      setPolicy(!!app.declarationAcceptPolicy);
      setCertUrl(app.nbceCertificateUrl || "");
    }
  }, [app]);

  const saveDeclaration = trpc.application.saveDeclaration.useMutation();
  const uploadFile = trpc.application.uploadFile.useMutation();

  const allChecked = honesty && nbce && consent && policy;

  const handleCertUpload = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => { resolve((reader.result as string).split(",")[1]); };
        reader.readAsDataURL(file);
      });
      const result = await uploadFile.mutateAsync({
        fileName: file.name,
        fileData: base64,
        contentType: file.type,
        applicationId: appId,
        category: "nbce_certificate",
      });
      setCertUrl(result.url);
      toast.success(isAr ? "تم رفع الشهادة بنجاح" : "Certificate uploaded successfully");
    } catch (error: any) {
      toast.error(isAr ? "فشل رفع الشهادة" : "Failed to upload certificate");
    } finally {
      setUploading(false);
    }
  };

  const handleProceed = async () => {
    if (!allChecked) {
      toast.error(t("decl.allRequired"));
      return;
    }
    try {
      await saveDeclaration.mutateAsync({
        id: appId,
        declarationHonesty: honesty,
        declarationNbceCertification: nbce,
        declarationConsentTruth: consent,
        declarationAcceptPolicy: policy,
        nbceCertificateUrl: certUrl || undefined,
      });
      toast.success(isAr ? "تم حفظ الإقرار بنجاح" : "Declaration saved successfully");
      setLocation(`/apply/${appId}/stage1`);
    } catch (error: any) {
      toast.error(error.message || "Failed to save declaration");
    }
  };

  // If declaration already completed and the app has moved on, redirect
  // to the right stage. The applicant should not be able to silently
  // re-accept the declaration and regress an in-flight app to Phase 0.
  useEffect(() => {
    if (!app) return;
    const inProgressStatuses = new Set([
      "stage1_pending", "stage1_failed", "stage2_pending", "stage2_failed",
      "submitted", "under_review", "pending_admin", "approved",
      "rejected", "resubmission_required", "permanently_rejected",
      "retracted", "hidden",
    ]);
    if (inProgressStatuses.has(String(app.status))) {
      setLocation(`/apply/${appId}/stage1`);
    }
  }, [app, appId, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 max-w-3xl mx-auto">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Badge className="bg-amber-100 text-amber-700">{t("decl.phase")}</Badge>
            <span className="text-sm text-muted-foreground">{t("decl.subtitle")}</span>
          </div>
          <Progress value={15} className="h-2" />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{t("decl.title")}</CardTitle>
                <CardDescription className="mt-1">{t("decl.desc")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Declaration 1: Honesty */}
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <Checkbox
                id="honesty"
                checked={honesty}
                onCheckedChange={(checked) => setHonesty(!!checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="honesty" className="text-sm leading-relaxed cursor-pointer font-normal">
                  {t("decl.honesty")}
                </Label>
              </div>
              {honesty && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
            </div>

            {/* Declaration 2: NBCE Certification */}
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <Checkbox
                id="nbce"
                checked={nbce}
                onCheckedChange={(checked) => setNbce(!!checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="nbce" className="text-sm leading-relaxed cursor-pointer font-normal">
                  {t("decl.nbce")}
                </Label>
              </div>
              {nbce && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
            </div>

            {/* Declaration 3: Consent */}
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(!!checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer font-normal">
                  {t("decl.consent")}
                </Label>
              </div>
              {consent && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
            </div>

            {/* Declaration 4: Policy */}
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <Checkbox
                id="policy"
                checked={policy}
                onCheckedChange={(checked) => setPolicy(!!checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="policy" className="text-sm leading-relaxed cursor-pointer font-normal">
                  {t("decl.policy")}
                  <button
                    onClick={(e) => { e.preventDefault(); setLocation("/policy"); }}
                    className="text-primary underline ms-1 hover:text-primary/80"
                  >
                    {isAr ? "(عرض السياسة)" : "(View Policy)"}
                  </button>
                </Label>
              </div>
              {policy && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />}
            </div>

            <Separator />

            {/* NBCE Certificate Upload (Optional) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium">{t("decl.uploadCert")}</Label>
              </div>
              <p className="text-xs text-muted-foreground">{t("decl.uploadCertDesc")}</p>
              
              {certUrl ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-emerald-700 truncate flex-1">
                    {isAr ? "تم رفع الشهادة" : "Certificate uploaded"}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setCertUrl("")}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <FileUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    {isAr ? "PDF أو صورة (اختياري)" : "PDF or image file (optional)"}
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    id="cert-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCertUpload(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => document.getElementById("cert-upload")?.click()}
                  >
                    {uploading ? (
                      <><Loader2 className="h-3 w-3 me-1 animate-spin" /> {isAr ? "جاري الرفع..." : "Uploading..."}</>
                    ) : (
                      <><Upload className="h-3 w-3 me-1" /> {isAr ? "اختر ملف" : "Choose File"}</>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Status Summary */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              {allChecked ? (
                <>
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">
                    {isAr ? "جميع الإقرارات مقبولة — يمكنك المتابعة" : "All declarations accepted — you may proceed"}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span className="text-sm text-amber-700">
                    {t("decl.allRequired")}
                  </span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setLocation("/dashboard")}>
                <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "رجوع" : "Back"}
              </Button>
              <Button
                onClick={handleProceed}
                disabled={!allChecked || saveDeclaration.isPending}
              >
                {saveDeclaration.isPending ? (
                  <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {isAr ? "جاري الحفظ..." : "Saving..."}</>
                ) : (
                  <>{t("decl.proceed")} <ArrowRight className="h-4 w-4 ms-1" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
