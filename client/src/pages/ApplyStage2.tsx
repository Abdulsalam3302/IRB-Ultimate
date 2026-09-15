import { canEditApplication } from "@shared/applicationWorkflow";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Router, useLocation, useParams } from "wouter";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useAuth } from "@/_core/hooks/useAuth";
import { useT } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { readUploadBase64 } from "@/lib/files";
import { useStage2Draft } from "@/hooks/useStage2Draft";
import { registerStage2Editor } from "@/lib/stage2AgentBridge";
import {
  reviewView,
  storedReview,
  type ReviewView,
} from "@/lib/aiReviewPresentation";
import {
  STAGE2_FIELDS,
  STAGE2_GROUPS,
  STAGE2_KEYS,
  stage2Values,
  stage2FieldLabel,
  type Stage2Field,
  type Stage2Values,
} from "@shared/stage2Fields";
import { Stage2ReviewResult } from "@/components/Stage2ReviewResult";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle,
  FileDown,
  Loader2,
  Save,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

const RelatedLiterature = lazy(() => import("@/components/RelatedLiterature"));
const SampleSizeCalculator = lazy(
  () => import("@/components/Stage2SampleSizeCalculator")
);
type Application = inferRouterOutputs<AppRouter>["application"]["getById"];
type Suggestion = {
  field: Stage2Field;
  before: string;
  after: string;
  accept: boolean;
};


export default function ApplyStage2() {
  const { id } = useParams<{ id: string }>();
  const appId = /^\d+$/.test(id || "") ? Number(id) : 0;
  const { user, loading } = useAuth();
  const { lang } = useT();
  const isAr = lang === "ar";
  const query = trpc.application.getById.useQuery(
    { id: appId },
    {
      enabled: Boolean(user && Number.isSafeInteger(appId) && appId > 0),
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  if (loading || query.isLoading)
    return (
      <div
        role="status"
        className="min-h-screen flex items-center justify-center gap-2"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        {isAr ? "جارٍ تحميل المسودة…" : "Loading draft…"}
      </div>
    );
  if (!user || !query.data || query.data.applicantId !== user.id)
    return (
      <>
        <Navbar />
        <main className="container max-w-xl py-12 space-y-4">
          <h1 className="text-xl font-semibold">
            {isAr ? "تعذر فتح المسودة" : "This draft could not be opened"}
          </h1>
          <p>
            {isAr
              ? "تحقق من تسجيل الدخول وامتلاكك لهذا الطلب، ثم أعد المحاولة."
              : "Check that you are signed in to the account that owns this application, then retry."}
          </p>
          {user && (
            <Button onClick={() => void query.refetch()}>
              {isAr ? "إعادة المحاولة" : "Retry"}
            </Button>
          )}
          <a className="block underline" href="/dashboard">
            {isAr ? "لوحة التحكم" : "Dashboard"}
          </a>
        </main>
      </>
    );
  return (
    <Stage2Editor
      key={`${user.id}:${query.data.id}`}
      app={query.data}
      userId={user.id}
    />
  );
}

function Stage2Editor({ app, userId }: { app: Application; userId: number }) {
  const { lang } = useT();
  const isAr = lang === "ar";
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const editable = canEditApplication(app);
  const save = trpc.application.saveStage2.useMutation();
  const draft = useStage2Draft(
    userId,
    app.id,
    { fields: stage2Values(app), rejectionFileUrl: app.rejectionFileUrl || "" },
    async value => {
      await save.mutateAsync({
        id: app.id,
        ...value.fields,
        rejectionFileUrl: value.rejectionFileUrl || undefined,
      });
    }
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [result, setResult] = useState<ReviewView | null>(() =>
    storedReview(app.stage2AiFeedback, app.stage2AiScore, app.stage2Passed)
  );
  const [previousReview, setPreviousReview] = useState<ReviewView | null>(null);
  const [reviewSnapshot, setReviewSnapshot] = useState(
    JSON.stringify(stage2Values(app))
  );
  const [action, setAction] = useState<
    "review" | "suggest" | "proposal" | "upload" | null
  >(null);
  const busy = useRef(false);
  const submissionLock = useRef(false);
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [literatureOpen, setLiteratureOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [suggestTarget, setSuggestTarget] = useState<Stage2Field | "all">(
    "all"
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rating, setRating] = useState("3");
  const [comment, setComment] = useState("");
  const alive = useRef(true);
  const navigating = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const runReview = trpc.application.runStage2Review.useMutation();
  const autoComplete = trpc.application.aiAutoComplete.useMutation();
  const resolveField = trpc.application.aiResolveField.useMutation();
  const upload = trpc.application.uploadFile.useMutation();
  const feedback = trpc.application.submitAiFeedback.useMutation();
  const missing = STAGE2_FIELDS.filter(
    field => !draft.value.fields[field.key].trim()
  );
  const stale = Boolean(
    result?.status === "completed" &&
    reviewSnapshot !== JSON.stringify(draft.value.fields)
  );
  const focusField = (key: string) => {
    if (!STAGE2_KEYS.includes(key as Stage2Field)) return;
    const field = document.getElementById(key);
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  };
  const saveFailure = isAr
    ? "لم تُحفظ آخر التغييرات. بقيت في هذه الصفحة؛ أعد الحفظ قبل المغادرة."
    : "Your latest changes were not saved. They remain on this page; retry saving before leaving.";

  useEffect(() => {
    focusField(window.location.hash.slice(1));
  }, [app.id]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!action) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [action]);
  useEffect(() => {
    if (!editable) return;
    return registerStage2Editor({
      applicationId: app.id,
      userId,
      read: () => ({
        applicationId: app.id,
        fields: { ...draftRef.current.latest.current.fields },
        saveStatus: draftRef.current.statusRef.current,
      }),
      update: fields =>
        draftRef.current.update(current => ({
          ...current,
          fields: { ...current.fields, ...fields },
        })),
      save: () => draftRef.current.flush(),
      setSubmissionLocked: locked => {
        if (locked && (busy.current || navigating.current))
          throw new Error("EDITOR_ACTION_IN_PROGRESS");
        submissionLock.current = locked;
        if (alive.current) setSubmissionLocked(locked);
      },
    });
  }, [app.id, userId, editable]);

  const flush = async () => {
    try {
      await draft.flush();
      return true;
    } catch {
      if (alive.current) setNotice(saveFailure);
      return false;
    }
  };
  const leave = async (navigate?: () => void) => {
    if (navigating.current || submissionLock.current) return false;
    navigating.current = true;
    setLeaving(true);
    try {
      if (!(await flush())) return false;
      if (alive.current) navigate?.();
      return true;
    } finally {
      navigating.current = false;
      if (alive.current) setLeaving(false);
    }
  };
  const saveNow = async () => {
    setNotice(null);
    if (await flush()) toast.success(isAr ? "حُفظت المسودة" : "Draft saved");
  };
  const setField = (key: Stage2Field, value: string) =>
    !submissionLock.current &&
    draft.update(current => ({
      ...current,
      fields: { ...current.fields, [key]: value },
    }));
  const start = (kind: NonNullable<typeof action>) => {
    if (!editable || busy.current || submissionLock.current) return false;
    busy.current = true;
    setAction(kind);
    setNotice(null);
    return true;
  };
  const finish = () => {
    busy.current = false;
    if (alive.current) setAction(null);
  };

  const review = async () => {
    if (!start("review")) return;
    try {
      if (!(await flush())) return;
      const snapshot = JSON.stringify(draft.latest.current.fields);
      const response = await runReview.mutateAsync({ id: app.id });
      if (!alive.current) return;
      const next = reviewView(response);
      if (next.status !== "completed" && result?.status === "completed")
        setPreviousReview(result);
      if (next.status === "completed") {
        setPreviousReview(null);
        setReviewSnapshot(snapshot);
      }
      setResult(next);
      // Keep edited field values local. Refresh only metadata used by the next screen.
      void utils.application.getById.invalidate({ id: app.id });
    } catch (error) {
      if (!alive.current) return;
      const code = (error as { data?: { code?: string } })?.data?.code;
      setNotice(
        code === "CONFLICT"
          ? isAr
            ? "تغيّرت المسودة أثناء المراجعة. حُفظت تعديلاتك؛ أعد المراجعة عند الانتهاء."
            : "The draft changed during review. Your edits are retained; run review again when ready."
          : isAr
            ? "تعذر إكمال المراجعة الآلية. يمكنك مواصلة التحرير أو التحقق من جاهزية التقديم للمراجعة البشرية."
            : "AI review could not be completed. Continue editing or check readiness for human review."
      );
    } finally {
      finish();
    }
  };
  const suggest = async () => {
    if (!start("suggest")) return;
    const before = { ...draft.latest.current.fields };
    try {
      const response =
        suggestTarget === "all"
          ? await autoComplete.mutateAsync({
              id: app.id,
              existingFields: before,
              stage: "stage2",
            })
          : {
              [suggestTarget]: (
                await resolveField.mutateAsync({
                  id: app.id,
                  fieldName: suggestTarget,
                  currentValue: before[suggestTarget],
                  feedback:
                    result?.fieldSuggestions[suggestTarget] ||
                    "Suggest a clearer description using supplied facts only. Do not invent study details.",
                  context: {
                    researchTitle: app.researchTitle || "",
                    researchType: app.researchType || "",
                    piInstitution: app.piInstitution || "",
                  },
                })
              ).enhancedValue,
            };
      if (!alive.current) return;
      if (
        typeof (response as Record<string, unknown>).__ai_unavailable ===
        "string"
      ) {
        setNotice(
          isAr
            ? "اقتراحات الذكاء الاصطناعي غير متاحة حالياً. لم تتغير حقولك."
            : "AI suggestions are unavailable. Your fields have not changed."
        );
        return;
      }
      const pairs = STAGE2_KEYS.flatMap(field => {
        const after = (response as Record<string, unknown>)[field];
        return typeof after === "string" &&
          after.trim() &&
          after.length <= 20_000 &&
          after !== before[field]
          ? [{ field, before: before[field], after, accept: false }]
          : [];
      });
      if (pairs.length) setSuggestions(pairs);
      else
        setNotice(
          isAr
            ? "لم تُقدّم تغييرات مقترحة. بقيت حقولك كما هي."
            : "No changes were suggested. Your fields are unchanged."
        );
    } catch {
      if (alive.current)
        setNotice(
          isAr
            ? "تعذر إنشاء اقتراحات. بقيت جميع مدخلاتك كما هي."
            : "Suggestions could not be generated. All your entries are unchanged."
        );
    } finally {
      finish();
    }
  };
  const applySuggestions = () => {
    if (submissionLock.current) return;
    let skipped = 0;
    draft.update(current => {
      const fields = { ...current.fields };
      for (const suggestion of suggestions.filter(row => row.accept)) {
        if (fields[suggestion.field] !== suggestion.before) {
          skipped++;
          continue;
        }
        fields[suggestion.field] = suggestion.after;
      }
      return { ...current, fields };
    });
    setSuggestions([]);
    setNotice(
      skipped
        ? isAr
          ? "لم تُستبدل الحقول التي عدّلتها بعد طلب الاقتراحات. راجع بقية التغييرات المقبولة."
          : "Fields edited since requesting suggestions were not overwritten. Review the other accepted changes."
        : isAr
          ? "طُبّقت الاقتراحات المحددة. تحقق من دقتها ومناسبتها لدراستك."
          : "Selected suggestions were applied. Verify that they are accurate for your study."
    );
  };
  const uploadRejection = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !start("upload")) return;
    try {
      const data = await readUploadBase64(file);
      const result = await upload.mutateAsync({
        fileName: file.name,
        fileData: data,
        contentType: file.type,
        applicationId: app.id,
        category: "rejection_file",
      });
      if (alive.current) {
        draft.update(current => ({ ...current, rejectionFileUrl: result.url }));
        await flush();
      }
    } catch {
      if (alive.current)
        setNotice(
          isAr
            ? "تعذر رفع الملف أو حفظ مرجعه. أعد المحاولة؛ بقيت تفاصيل البحث محفوظة في النموذج."
            : "The file or its reference could not be saved. Retry; your research details remain in the form."
        );
    } finally {
      finish();
    }
  };
  const proposal = async () => {
    if (!start("proposal")) return;
    try {
      if (!(await flush())) return;
      const response = await fetch(`/api/export/proposal/${app.id}.docx`, {
        credentials: "include",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error("EXPORT_FAILED");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `IRB-Research-Proposal-${app.id}.docx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (alive.current)
        setNotice(
          isAr
            ? "تعذر إنشاء المستند. حُفظت مسودتك إذا اكتمل الحفظ؛ تحقق من حالة الحفظ وحاول مجدداً."
            : "The document could not be generated. Check the save status and retry; your draft remains available."
        );
    } finally {
      finish();
    }
  };

  return (
    <Router
      aroundNav={(navigate, to, options) => {
        void leave(() => navigate(to, options));
      }}
    >
      <div className="min-h-screen bg-background">
        <Navbar beforeLeave={() => leave()} />
        <main
          className="container max-w-4xl py-6 sm:py-8 space-y-6"
          id="stage2-editor"
        >
          {submissionLocked && (
            <p role="status" className="rounded-lg border p-3 text-sm">
              {isAr
                ? "جارٍ حفظ وتقديم النسخة الحالية. يتوقف التحرير مؤقتاً حتى تأكيد النتيجة."
                : "Saving and submitting the current version. Editing is paused until the result is confirmed."}
            </p>
          )}
          <header className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isAr ? "المرحلة 2 · تفاصيل البحث" : "Stage 2 · Research details"}
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold">
              {isAr ? "أكمل تفاصيل دراستك" : "Complete your study details"}
            </h1>
            <p className="text-sm text-muted-foreground break-words">
              {app.researchTitle}
            </p>
            <p className="text-sm">
              {isAr
                ? "الحقول الاثنا عشر مطلوبة. إن لم ينطبق أحدها، وضّح السبب. أدوات المساعدة والمرفقات أدناه اختيارية."
                : "All 12 fields are required. If a field does not apply, explain why. The tools and attachments below are optional."}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span>
                {isAr
                  ? `أُجيب عن ${12 - missing.length} من 12 حقلاً`
                  : `${12 - missing.length} of 12 fields have answers`}
              </span>
              <span
                role="status"
                aria-live="polite"
                id="draft-save-status"
                className={
                  draft.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {draft.status === "saving"
                  ? isAr
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : draft.status === "unsaved"
                    ? isAr
                      ? "تغييرات بانتظار الحفظ"
                      : "Changes waiting to save"
                    : draft.status === "error"
                      ? isAr
                        ? "لم تُحفظ آخر التغييرات"
                        : "Latest changes not saved"
                      : isAr
                        ? "كل التغييرات محفوظة"
                        : "All changes saved"}
              </span>
            </div>
            {draft.status === "error" && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 p-3 text-sm"
              >
                <p>{saveFailure}</p>
                <Button
                  type="button"
                  variant="link"
                  className="px-0"
                  onClick={() => void saveNow()}
                >
                  {isAr ? "إعادة الحفظ" : "Retry save"}
                </Button>
              </div>
            )}
            {!editable && (
              <p role="status" className="rounded-lg border p-3 text-sm">
                {isAr
                  ? "هذه المرحلة مقفلة للتحرير بعد انتقال الطلب. يمكنك مراجعة التفاصيل ومتابعة حالة الطلب."
                  : "This stage is locked after the application moved forward. You can review its details and continue to the application status."}
              </p>
            )}
          </header>
          <form
            id="stage2-form"
            aria-label={
              isAr
                ? "تفاصيل البحث في المرحلة الثانية"
                : "Stage 2 research details"
            }
            noValidate
            onSubmit={event => {
              event.preventDefault();
              void saveNow();
            }}
            className="space-y-6"
          >
            {STAGE2_GROUPS.map(group => (
              <fieldset
                key={group.key}
                disabled={submissionLocked || !editable}
                className="rounded-xl border bg-card p-4 sm:p-5"
                id={`stage2-${group.key}`}
              >
                <legend className="px-2 font-semibold">
                  {isAr ? group.ar : group.en}
                </legend>
                <div className="grid sm:grid-cols-2 gap-5">
                  {STAGE2_FIELDS.filter(field => field.group === group.key).map(
                    field => (
                      <div
                        key={field.key}
                        className={`space-y-2 min-w-0 ${field.key === "methodology" ? "sm:col-span-2" : ""}`}
                      >
                        <Label htmlFor={field.key}>
                          {isAr ? field.ar : field.en}
                        </Label>
                        {field.key === "sampleSize" ? (
                          <Input
                            dir="auto"
                            id={field.key}
                            name={field.key}
                            value={draft.value.fields[field.key]}
                            onChange={event =>
                              setField(field.key, event.target.value)
                            }
                            maxLength={20_000}
                            required
                            aria-describedby={`${field.key}-help`}
                            autoComplete="off"
                          />
                        ) : (
                          <Textarea
                            dir="auto"
                            id={field.key}
                            name={field.key}
                            value={draft.value.fields[field.key]}
                            onChange={event =>
                              setField(field.key, event.target.value)
                            }
                            rows={field.key === "methodology" ? 4 : 3}
                            maxLength={20_000}
                            required
                            aria-describedby={`${field.key}-help`}
                            autoComplete="off"
                            className="resize-y"
                          />
                        )}
                        <p
                          id={`${field.key}-help`}
                          className="text-xs text-muted-foreground leading-relaxed"
                        >
                          {isAr ? field.helpAr : field.helpEn}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                variant="outline"
                disabled={
                  submissionLocked ||
                  !editable ||
                  leaving ||
                  draft.status === "saving"
                }
              >
                <Save className="h-4 w-4" />
                {isAr ? "حفظ المسودة" : "Save draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void review()}
                disabled={
                  submissionLocked || !editable || Boolean(action) || leaving
                }
              >
                <Brain className="h-4 w-4" />
                {action === "review"
                  ? isAr
                    ? "جارٍ طلب المراجعة…"
                    : "Requesting review…"
                  : isAr
                    ? "مراجعة بالذكاء الاصطناعي (اختيارية)"
                    : "AI review (optional)"}
              </Button>
            </div>
          </form>
          {action && (
            <p role="status" className="text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isAr
                ? `جارٍ تنفيذ الطلب… ${elapsed} ثانية. يمكنك مواصلة الكتابة.`
                : `Request in progress… ${elapsed}s. You can continue typing.`}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-lg border p-3 text-sm"
              aria-live="polite"
            >
              {notice}
            </p>
          )}
          {result && (
            <Stage2ReviewResult
              result={result}
              isAr={isAr}
              stale={stale}
              onField={focusField}
            />
          )}
          {previousReview && (
            <details>
              <summary className="text-sm cursor-pointer">
                {isAr
                  ? "عرض المراجعة السابقة؛ ليست نتيجة المحاولة الأخيرة"
                  : "View earlier assessment; not the result of this attempt"}
              </summary>
              <div className="mt-3">
                <Stage2ReviewResult
                  idPrefix="stage2-previous"
                  result={previousReview}
                  isAr={isAr}
                  stale
                  onField={focusField}
                />
              </div>
            </details>
          )}
          <details
            className="rounded-xl border p-4 sm:p-5"
            onToggle={event => setToolsOpen(event.currentTarget.open)}
          >
            <summary className="font-medium cursor-pointer">
              {isAr
                ? "أدوات ومرفقات اختيارية"
                : "Optional tools and attachments"}
            </summary>
            {toolsOpen && (
              <div className="space-y-5 pt-4">
                <div className="space-y-3">
                  <h2 className="font-medium text-sm">
                    {isAr ? "اقتراح صياغة" : "Suggest wording"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "راجع اقتراحات الذكاء الاصطناعي قبل قبولها. لا تُستبدل حقولك تلقائياً ولا تُنشأ حقائق بحثية معتمدة."
                      : "Review AI suggestions before accepting them. Fields are never replaced automatically; suggestions do not establish study facts."}
                  </p>
                  <Label htmlFor="suggest-target">
                    {isAr ? "الحقل" : "Field"}
                  </Label>
                  <select
                    id="suggest-target"
                    disabled={submissionLocked || !editable || Boolean(action)}
                    className="w-full border rounded-md p-2 bg-background"
                    value={suggestTarget}
                    onChange={event =>
                      setSuggestTarget(
                        event.target.value as Stage2Field | "all"
                      )
                    }
                  >
                    <option value="all">
                      {isAr ? "جميع الحقول" : "All fields"}
                    </option>
                    {STAGE2_FIELDS.map(field => (
                      <option key={field.key} value={field.key}>
                        {isAr ? field.ar : field.en}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submissionLocked || !editable || Boolean(action)}
                    onClick={() => void suggest()}
                  >
                    <Wand2 className="h-4 w-4" />
                    {isAr ? "طلب اقتراحات" : "Request suggestions"}
                  </Button>
                </div>
                <details
                  onToggle={event => setCalcOpen(event.currentTarget.open)}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {isAr ? "حاسبة حجم العينة" : "Sample size calculator"}
                  </summary>
                  {calcOpen && (
                    <div className="pt-3">
                      <Suspense
                        fallback={
                          <p role="status">
                            {isAr ? "جارٍ التحميل…" : "Loading…"}
                          </p>
                        }
                      >
                        <SampleSizeCalculator
                          isAr={isAr}
                          onApply={value => {
                            if (editable && !submissionLock.current)
                              setField("sampleSize", value);
                          }}
                        />
                      </Suspense>
                    </div>
                  )}
                </details>
                <details
                  onToggle={event =>
                    setLiteratureOpen(event.currentTarget.open)
                  }
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {isAr ? "الأدبيات ذات الصلة" : "Related literature"}
                  </summary>
                  {literatureOpen && (
                    <Suspense
                      fallback={
                        <p role="status">
                          {isAr ? "جارٍ التحميل…" : "Loading…"}
                        </p>
                      }
                    >
                      <RelatedLiterature applicationId={app.id} />
                    </Suspense>
                  )}
                </details>
                <div className="space-y-2">
                  <Label htmlFor="rejection-file">
                    {isAr
                      ? "وثيقة رفض سابقة (اختيارية)"
                      : "Previous rejection document (optional)"}
                  </Label>
                  <Input
                    id="rejection-file"
                    name="rejectionFile"
                    type="file"
                    accept=".pdf,.docx,.png,.jpg,.jpeg"
                    disabled={submissionLocked || !editable || Boolean(action)}
                    onChange={event => void uploadRejection(event)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "حد أقصى 15 ميجابايت. الرفع خاضع للفحص وصلاحيات الوصول."
                      : "Maximum 15 MB. Uploads remain subject to scanning and access controls."}
                  </p>
                  {draft.value.rejectionFileUrl && (
                    <a
                      href={draft.value.rejectionFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block underline text-sm"
                    >
                      {isAr ? "عرض الملف المرفوع" : "View uploaded file"}
                    </a>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void proposal()}
                  disabled={
                    submissionLocked ||
                    !editable ||
                    Boolean(action) ||
                    missing.length > 0
                  }
                >
                  <FileDown className="h-4 w-4" />
                  {isAr
                    ? "تنزيل مسودة المقترح (DOCX)"
                    : "Download draft proposal (DOCX)"}
                </Button>
                {result?.status === "completed" && (
                  <details
                    onToggle={event =>
                      setFeedbackOpen(event.currentTarget.open)
                    }
                  >
                    <summary className="cursor-pointer text-sm">
                      {isAr
                        ? "إرسال ملاحظة عن المراجعة"
                        : "Give feedback on the review"}
                    </summary>
                    {feedbackOpen && (
                      <form
                        className="space-y-3 pt-3"
                        onSubmit={async event => {
                          event.preventDefault();
                          if (feedback.isPending) return;
                          try {
                            await feedback.mutateAsync({
                              applicationId: app.id,
                              stage: 2,
                              rating: Number(rating),
                              comment: comment.trim() || undefined,
                            });
                            setComment("");
                            toast.success(
                              isAr
                                ? "شكرًا لملاحظاتك"
                                : "Thank you for your feedback"
                            );
                          } catch {
                            toast.error(
                              isAr
                                ? "تعذر إرسال الملاحظة"
                                : "Feedback could not be sent"
                            );
                          }
                        }}
                      >
                        <Label htmlFor="review-rating">
                          {isAr ? "التقييم" : "Rating"}
                        </Label>
                        <select
                          id="review-rating"
                          className="border p-2 rounded-md bg-background"
                          value={rating}
                          onChange={event => setRating(event.target.value)}
                        >
                          {[1, 2, 3, 4, 5].map(value => (
                            <option key={value} value={value}>
                              {value}/5
                            </option>
                          ))}
                        </select>
                        <Label htmlFor="review-comment">
                          {isAr ? "تعليق (اختياري)" : "Comment (optional)"}
                        </Label>
                        <Textarea
                          id="review-comment"
                          value={comment}
                          onChange={event => setComment(event.target.value)}
                          maxLength={2000}
                        />
                        <Button
                          type="submit"
                          disabled={submissionLocked || feedback.isPending}
                        >
                          {isAr ? "إرسال الملاحظة" : "Send feedback"}
                        </Button>
                      </form>
                    )}
                  </details>
                )}
              </div>
            )}
          </details>
          <section className="border-t pt-5 space-y-3">
            <h2 className="font-semibold">
              {isAr ? "الخطوة التالية" : "Next step"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "احفظ التفاصيل وانتقل للتحقق من جاهزية التقديم. سيُعرض ما ينقص قبل الإرسال النهائي إلى المراجعين البشريين."
                : "Save your details and check submission readiness. You will see anything missing before the final submission to human reviewers."}
            </p>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void leave(() => setLocation(`/apply/${app.id}/stage1`))
                }
                disabled={submissionLocked || leaving}
              >
                <ArrowLeft className="h-4 w-4" />
                {isAr ? "المرحلة 1" : "Stage 1"}
              </Button>
              <Button
                type="button"
                disabled={submissionLocked || leaving || action === "upload"}
                onClick={() =>
                  void leave(() => setLocation(`/apply/${app.id}/submit`))
                }
              >
                {leaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {isAr ? "متابعة إلى التقديم" : "Continue to submission"}
              </Button>
            </div>
          </section>
        </main>
        <Dialog
          open={suggestions.length > 0}
          onOpenChange={open => {
            if (!open) setSuggestions([]);
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {isAr ? "راجع الاقتراحات" : "Review suggestions"}
              </DialogTitle>
              <DialogDescription>
                {isAr
                  ? "اختر التغييرات الدقيقة لدراستك. النصوص المؤقتة تحتاج استكمالاً، والتغييرات التي كتبتها أثناء الانتظار لن تُستبدل."
                  : "Select changes that are accurate for your study. Placeholders need completion; edits made while waiting will not be overwritten."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {suggestions.map((row, index) => (
                <div
                  key={row.field}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <label className="flex items-start gap-2 font-medium text-sm">
                    <input
                      type="checkbox"
                      checked={row.accept}
                      onChange={event =>
                        setSuggestions(previous =>
                          previous.map((value, i) =>
                            i === index
                              ? { ...value, accept: event.target.checked }
                              : value
                          )
                        )
                      }
                    />
                    <span>{stage2FieldLabel(row.field, isAr)}</span>
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {isAr ? "نصك عند الطلب" : "Your text when requested"}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {row.before || (isAr ? "فارغ" : "Empty")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {isAr ? "الاقتراح" : "Suggestion"}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {row.after}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSuggestions([])}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                disabled={
                  submissionLocked || !suggestions.some(row => row.accept)
                }
                onClick={applySuggestions}
              >
                <CheckCircle className="h-4 w-4" />
                {isAr ? "تطبيق المحدد" : "Apply selected"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Router>
  );
}
