import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useState, useMemo } from "react";
import { useT } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Navbar } from "@/components/Navbar";
import {
  ArrowLeft, History, GitCompare, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Loader2, FileText
} from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  researchType: "Research Type",
  irbCategory: "IRB Category",
  researchTitle: "Research Title",
  principalInvestigator: "Principal Investigator",
  piEmail: "PI Email",
  piInstitution: "Institution",
  piDepartment: "Department",
  fundingSource: "Funding Source",
  estimatedDuration: "Estimated Duration",
  researchObjectives: "Research Objectives",
  methodology: "Methodology",
  sampleSize: "Sample Size",
  targetPopulation: "Target Population",
  inclusionCriteria: "Inclusion Criteria",
  exclusionCriteria: "Exclusion Criteria",
  dataCollectionMethods: "Data Collection Methods",
  informedConsentProcess: "Informed Consent Process",
  riskAssessment: "Risk Assessment",
  benefitAssessment: "Benefit Assessment",
  confidentialityMeasures: "Confidentiality Measures",
  conflictOfInterest: "Conflict of Interest",
};

function DiffView({ oldText, newText, fieldName }: { oldText: string; newText: string; fieldName: string }) {
  const [expanded, setExpanded] = useState(false);
  const isChanged = oldText !== newText;

  if (!isChanged) {
    return (
      <div className="p-3 rounded-lg bg-muted/20 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-medium">{FIELD_LABELS[fieldName] || fieldName}</span>
          <Badge variant="outline" className="text-xs">Unchanged</Badge>
        </div>
        {expanded && (
          <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{newText || "—"}</p>
        )}
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary mt-1 hover:underline">
          {expanded ? "Hide" : "Show content"}
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/50 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <GitCompare className="h-3.5 w-3.5 text-amber-600" />
        <span className="font-medium">{FIELD_LABELS[fieldName] || fieldName}</span>
        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Changed</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-destructive/70 mb-1">Previous:</p>
          <div className="text-xs bg-red-50 dark:bg-red-950/20 p-2 rounded border border-red-200/30 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {oldText || <span className="italic text-muted-foreground">(empty)</span>}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-emerald-700/70 mb-1">Current:</p>
          <div className="text-xs bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded border border-emerald-200/30 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {newText || <span className="italic text-muted-foreground">(empty)</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VersionHistory() {
  const params = useParams<{ id: string }>();
  const appId = Number(params.id);
  const [, setLocation] = useLocation();
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const [compareIdx, setCompareIdx] = useState<[number, number] | null>(null);

  const { data: versions, isLoading } = trpc.application.getVersions.useQuery(
    { applicationId: appId },
    { enabled: !!appId }
  );

  const sortedVersions = useMemo(() => {
    if (!versions) return [];
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  const comparison = useMemo(() => {
    if (!compareIdx || !sortedVersions.length) return null;
    const [newIdx, oldIdx] = compareIdx;
    const newV = sortedVersions[newIdx];
    const oldV = sortedVersions[oldIdx];
    if (!newV || !oldV) return null;
    const newSnap = JSON.parse(newV.snapshot);
    const oldSnap = JSON.parse(oldV.snapshot);
    const allFields = Array.from(new Set([...Object.keys(newSnap), ...Object.keys(oldSnap)]));
    return {
      newVersion: newV,
      oldVersion: oldV,
      fields: allFields.map(f => ({
        field: f,
        oldValue: oldSnap[f] || "",
        newValue: newSnap[f] || "",
        changed: oldSnap[f] !== newSnap[f],
      })),
    };
  }, [compareIdx, sortedVersions]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/application/${appId}`)}>
            <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "العودة" : "Back"}
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6 text-primary" />
              {isAr ? "سجل الإصدارات" : "Version History"}
            </h1>
            <p className="text-sm text-muted-foreground">{isAr ? "طلب" : "Application"} #{appId}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : !sortedVersions.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{isAr ? "لا يوجد سجل إصدارات" : "No Version History"}</h3>
              <p className="text-muted-foreground">{isAr ? "سيتم حفظ الإصدارات عند تقديم الطلب." : "Versions are saved each time the application is submitted."}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Version List */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">
                {isAr ? "الإصدارات" : "Versions"} ({sortedVersions.length})
              </h3>
              {sortedVersions.map((v: any, idx: number) => {
                const changedFields = v.changedFields ? JSON.parse(v.changedFields) : [];
                const isSelected = compareIdx && (compareIdx[0] === idx || compareIdx[1] === idx);
                return (
                  <Card
                    key={v.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""}`}
                    onClick={() => {
                      if (idx < sortedVersions.length - 1) {
                        setCompareIdx([idx, idx + 1]);
                      } else if (sortedVersions.length > 1) {
                        setCompareIdx([0, idx]);
                      }
                    }}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={idx === 0 ? "default" : "secondary"} className="text-xs">
                          v{v.version} {idx === 0 ? (isAr ? "(أحدث)" : "(Latest)") : ""}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.submittedAt || v.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {v.stage1AiScore != null && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> S1: {v.stage1AiScore}/100
                          </span>
                        )}
                        {v.stage2AiScore != null && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" /> S2: {v.stage2AiScore}/100
                          </span>
                        )}
                      </div>
                      {changedFields.length > 0 && (
                        <p className="text-xs text-amber-600 mt-2">
                          {changedFields.length} {isAr ? "حقول تم تغييرها" : "fields changed"}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Diff View */}
            <div className="lg:col-span-2">
              {comparison ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <GitCompare className="h-5 w-5 text-primary" />
                      {isAr ? "مقارنة الإصدارات" : "Comparing Versions"}
                    </CardTitle>
                    <CardDescription>
                      v{comparison.oldVersion.version} → v{comparison.newVersion.version}
                      {" · "}
                      {comparison.fields.filter(f => f.changed).length} {isAr ? "تغييرات" : "changes"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Show changed fields first */}
                    {comparison.fields
                      .sort((a, b) => (a.changed === b.changed ? 0 : a.changed ? -1 : 1))
                      .map((f) => (
                        <DiffView
                          key={f.field}
                          fieldName={f.field}
                          oldText={f.oldValue}
                          newText={f.newValue}
                        />
                      ))}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-16 text-center">
                    <GitCompare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{isAr ? "اختر إصدارًا للمقارنة" : "Select a Version to Compare"}</h3>
                    <p className="text-muted-foreground text-sm">
                      {isAr
                        ? "انقر على أي إصدار من القائمة لعرض التغييرات مقارنة بالإصدار السابق."
                        : "Click any version from the list to see changes compared to the previous version."}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
