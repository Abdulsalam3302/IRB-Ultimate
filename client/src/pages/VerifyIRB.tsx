import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Navbar } from "@/components/Navbar";
import { useT } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import {
  Shield, Search, CheckCircle, XCircle, Download,
  Loader2, Calendar, Building, User, FileText, Award, Users, Ban, AlertTriangle
} from "lucide-react";
import { RESEARCH_TYPE_LABELS } from "@shared/types";
import type { ResearchType } from "@shared/types";
import { SiteFooter } from "@/components/design/SiteFooter";

export default function VerifyIRB() {
  const { t } = useT();
  const [searchValue, setSearchValue] = useState("");
  const [searchTriggered, setSearchTriggered] = useState(false);

  // Honour deep links: /verify?n=IRB-2026-001 (Registry, emails) AND
  // /verify/IRB-SA-2026-00123 (the QR code printed on certificates).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pathMatch = window.location.pathname.match(/^\/verify\/([^/]+)$/);
    const prefill =
      params.get("n") || params.get("irb") ||
      (pathMatch ? decodeURIComponent(pathMatch[1]) : "");
    const cleaned = prefill.trim().toUpperCase();
    if (cleaned && cleaned.length >= 3) {
      setSearchValue(cleaned);
      setSearchTriggered(true);
    }
  }, []);

  const { data: result, isLoading, refetch } = trpc.verify.verifyIrb.useQuery(
    { irbNumber: searchValue },
    { enabled: searchTriggered && searchValue.length >= 3 }
  );

  const certDownload = trpc.verify.certificateDownload.useMutation({
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    },
  });

  const handleSearch = () => {
    if (searchValue.trim().length < 3) return;
    setSearchTriggered(true);
    refetch();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo="/" backLabel={t("common.backHome")} />

      <div className="container py-12 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Award className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t("verify.title")}</h1>
          <p className="text-muted-foreground">{t("verify.desc")}</p>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Input
                placeholder={t("verify.placeholder")}
                value={searchValue}
                onChange={(e) => { setSearchValue(e.target.value); setSearchTriggered(false); }}
                onKeyDown={handleKeyDown}
                className="text-base h-12 font-mono"
                dir="ltr"
              />
              <Button size="lg" className="h-12 px-6" onClick={handleSearch} disabled={isLoading || searchValue.trim().length < 3}>
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5 me-1" />}
                {isLoading ? t("verify.searching") : t("verify.button")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {searchTriggered && !isLoading && result && (
          <>
            {result.found && result.retracted ? (
              /* ─── RETRACTED APPLICATION ─── */
              <Card className="border-2 border-red-300">
                <CardHeader className="bg-red-50/80">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                      <Ban className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <CardTitle className="text-red-700">{t("retract.title")}</CardTitle>
                      <CardDescription className="text-red-600">{t("retract.notice")}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-5">
                  <div className="flex items-center justify-center">
                    <Badge variant="outline" className="text-lg font-mono px-4 py-2 border-red-400 text-red-700 line-through">
                      {result.irbNumber}
                    </Badge>
                  </div>

                  <div className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <span className="font-semibold text-red-700">{t("retract.reason")}</span>
                    </div>
                    <p className="text-sm text-red-800">{result.retractionReason}</p>
                    <div className="flex items-center gap-2 text-xs text-red-600">
                      <Calendar className="h-3 w-3" />
                      <span>{t("retract.date")}: {result.retractedAt ? new Date(result.retractedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("form.researchTitle")}</span>
                      <p className="font-semibold">{result.researchTitle}</p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("form.pi")}</span>
                        <p className="text-sm font-medium">{result.principalInvestigator}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("form.institution")}</span>
                        <p className="text-sm font-medium">{result.piInstitution}</p>
                      </div>
                    </div>
                    {result.approvedAt && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("verify.approvedDate")} (Original)</span>
                        <p className="text-sm font-medium">{new Date(result.approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                      </div>
                    )}
                  </div>

                  {result.hasRetractionCertificate && (
                    <>
                      <Separator />
                      <div className="text-center">
                        <Button
                          size="lg"
                          variant="destructive"
                          disabled={certDownload.isPending}
                          onClick={() =>
                            certDownload.mutate({
                              irbNumber: result.irbNumber!,
                              kind: "retraction",
                            })
                          }
                        >
                          {certDownload.isPending ? (
                            <Loader2 className="h-5 w-5 me-2 animate-spin" />
                          ) : (
                            <Download className="h-5 w-5 me-2" />
                          )}
                          {t("retract.downloadCert")}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : result.found ? (
              /* ─── APPROVED APPLICATION ─── */
              <Card className="border-2 border-emerald-200">
                <CardHeader className="bg-emerald-50/50">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-emerald-700">{t("verify.found")}</CardTitle>
                      <CardDescription className="text-emerald-600">
                        {t("verify.foundDesc")}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-5">
                  <div className="flex items-center justify-center">
                    <Badge variant="outline" className="text-lg font-mono px-4 py-2 border-primary text-primary">
                      {result.irbNumber}
                    </Badge>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("form.researchTitle")}</span>
                      </div>
                      <p className="font-semibold">{result.researchTitle}</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("form.pi")}</span>
                        </div>
                        <p className="text-sm font-medium">{result.principalInvestigator}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("form.institution")}</span>
                        </div>
                        <p className="text-sm font-medium">{result.piInstitution}</p>
                      </div>
                    </div>

                    {/* SA-11: department, AI scores, and author roster are no
                        longer returned over the public verify endpoint —
                        institution-level facts only on the unauthenticated
                        path. Authenticated viewers (applicant, admin,
                        assigned reviewers) see the full record via the
                        dashboard. */}
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("form.researchType")}</span>
                      <p className="text-sm font-medium">{RESEARCH_TYPE_LABELS[result.researchType as ResearchType] || result.researchType}</p>
                    </div>

                    <Separator />

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("verify.approvedDate")}</span>
                      </div>
                      <p className="text-sm font-medium text-primary">
                        {result.approvedAt ? new Date(result.approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
                      </p>
                    </div>
                  </div>

                  {result.hasCertificate && (
                    <>
                      <Separator />
                      <div className="text-center">
                        <Button
                          size="lg"
                          disabled={certDownload.isPending}
                          onClick={() =>
                            certDownload.mutate({
                              irbNumber: result.irbNumber!,
                              kind: "certificate",
                            })
                          }
                        >
                          {certDownload.isPending ? (
                            <Loader2 className="h-5 w-5 me-2 animate-spin" />
                          ) : (
                            <Download className="h-5 w-5 me-2" />
                          )}
                          {t("verify.download")}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 border-red-200">
                <CardContent className="py-12 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                    <XCircle className="h-8 w-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-red-700 mb-2">{t("verify.notFound")}</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">{t("verify.notFoundDesc")}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
