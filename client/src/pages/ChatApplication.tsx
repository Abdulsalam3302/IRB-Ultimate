import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useLocation, useSearch } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";
import { getLoginUrl } from "@/const";
import { friendlyChatSendError, sendChatApplicationTurn } from "@/lib/chatSend";

const CHAT_HISTORY_CAP = 16;

function introMessage(isAr: boolean): Message {
  return {
    role: "assistant",
    content: isAr
      ? "مرحباً. أنا مساعد طلبات لجنة أخلاقيات البحث (IRB) في المملكة العربية السعودية. سأعمل معك لإكمال طلبك عبر المحادثة بدل تعبئة النموذج الطويل، وسأرتّب إجاباتك حتى يصبح الطلب جاهزاً للتقديم. لنبدأ: ما عنوان دراستك البحثية؟"
      : "Hello. I am the IRB Saudi Arabia application assistant. I will work with you to complete your IRB application through conversation rather than a long form, and I will refine your answers until the application is ready to submit. Let's start: what is the title of your research study?",
  };
}

const FIELD_LABELS: Record<string, { en: string; ar: string }> = {
  researchTitle: { en: "Research title", ar: "عنوان البحث" },
  researchType: { en: "Study type", ar: "نوع الدراسة" },
  irbCategory: { en: "IRB category", ar: "فئة IRB" },
  principalInvestigator: { en: "Principal investigator", ar: "الباحث الرئيسي" },
  piEmail: { en: "PI email", ar: "بريد الباحث" },
  piInstitution: { en: "Institution", ar: "المؤسسة" },
  piDepartment: { en: "Department", ar: "القسم" },
  researchObjectives: { en: "Objectives", ar: "الأهداف" },
  methodology: { en: "Methodology", ar: "المنهجية" },
  sampleSize: { en: "Sample size", ar: "حجم العينة" },
  targetPopulation: { en: "Target population", ar: "المجتمع المستهدف" },
  inclusionCriteria: { en: "Inclusion criteria", ar: "معايير التضمين" },
  exclusionCriteria: { en: "Exclusion criteria", ar: "معايير الاستبعاد" },
  dataCollectionMethods: { en: "Data collection", ar: "جمع البيانات" },
  informedConsentProcess: { en: "Informed consent", ar: "الموافقة المستنيرة" },
  riskAssessment: { en: "Risks", ar: "المخاطر" },
  benefitAssessment: { en: "Benefits", ar: "المنافع" },
  confidentialityMeasures: { en: "Confidentiality", ar: "السرية" },
  conflictOfInterest: { en: "Conflicts of interest", ar: "تعارض المصالح" },
  declaration_honesty: { en: "Honesty declaration", ar: "إقرار الأمانة" },
  stage1_ai_review_pass: { en: "Stage 1 AI review", ar: "مراجعة AI المرحلة 1" },
  stage2_ai_review_pass: { en: "Stage 2 AI review", ar: "مراجعة AI المرحلة 2" },
};

function labelFor(key: string, isAr: boolean): string {
  const row = FIELD_LABELS[key];
  if (!row) return key.replace(/_/g, " ");
  return isAr ? row.ar : row.en;
}

export default function ChatApplication() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const rawAppId = Number(params.get("id") || 0);
  const appId = Number.isSafeInteger(rawAppId) && rawAppId > 0 ? rawAppId : 0;
  const { lang } = useT();
  const isAr = lang === "ar";
  const started = useRef(false);
  const invalidAppId = params.has("id") && !appId;

  const [messages, setMessages] = useState<Message[]>(() => [
    introMessage(isAr),
  ]);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pendingUserText = useRef<string | null>(null);
  const hydrated = useRef(false);
  const inFlight = useRef(false);
  const activeAppId = useRef(appId);
  activeAppId.current = appId;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (appId) started.current = false;
    hydrated.current = false;
    pendingUserText.current = null;
    setMessages([introMessage(isAr)]);
    setMissing(null);
    setLastError(null);
  }, [appId]);

  const history = trpc.chatApplication.history.useQuery(
    { applicationId: appId },
    { enabled: isAuthenticated && appId > 0 },
  );

  useEffect(() => {
    if (hydrated.current || !history.data) return;
    if (history.data.messages.length > 0) {
      setMessages(history.data.messages);
    }
    setMissing(history.data.missing);
    hydrated.current = true;
  }, [history.data]);

  const createApp = trpc.application.create.useMutation({
    onSuccess: data => {
      setLocation(`/chat-apply?id=${data.id}`);
    },
    onError: e => {
      started.current = false;
      setLastError(e.message);
      toast.error(e.message);
    },
  });

  useEffect(() => {
    if (loading || !isAuthenticated || appId || invalidAppId || started.current) return;
    started.current = true;
    createApp.mutate({ intakeChannel: "chatbot" });
  }, [loading, isAuthenticated, appId, invalidAppId, createApp]);

  const chat = trpc.chatApplication.sendMessage.useMutation();

  const applyReply = (data: { reply: string; missing: string[]; updatesApplied: string[] }) => {
    setLastError(null);
    pendingUserText.current = null;
    setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    setMissing(data.missing);
    if (data.updatesApplied.length > 0) {
      toast.success(
        isAr
          ? `تم تحديث: ${data.updatesApplied.map(k => labelFor(k, true)).join("، ")}`
          : `Updated: ${data.updatesApplied.map(k => labelFor(k, false)).join(", ")}`,
      );
    }
  };

  const dispatchTurn = async (payload: {
    applicationId: number;
    messages: { role: "user" | "assistant"; content: string }[];
    lang: "ar" | "en";
  }) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setLastError(null);
    try {
      const data = await sendChatApplicationTurn(payload, () => chat.mutateAsync(payload));
      if (!mounted.current || activeAppId.current !== payload.applicationId) return;
      applyReply(data);
    } catch {
      if (!mounted.current || activeAppId.current !== payload.applicationId) return;
      const friendly = friendlyChatSendError(isAr);
      setLastError(friendly);
      toast.error(friendly);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSending(false);
    }
  };

  const send = (content: string) => {
    if (inFlight.current || !appId || !hydrated.current || history.isError || !content.trim() || content.length > 4000) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    pendingUserText.current = content;
    const payload = next
      .filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          m.role === "user" || m.role === "assistant"
      )
      .slice(-CHAT_HISTORY_CAP);
    void dispatchTurn({
      applicationId: appId,
      messages: payload,
      lang: isAr ? "ar" : "en",
    });
  };

  const retry = () => {
    const text = pendingUserText.current;
    if (!text) return;
    const payload = messages
      .filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          m.role === "user" || m.role === "assistant"
      )
      .slice(-CHAT_HISTORY_CAP);
    void dispatchTurn({
      applicationId: appId,
      messages: payload,
      lang: isAr ? "ar" : "en",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== "undefined") window.location.href = getLoginUrl();
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>{isAr ? "يرجى تسجيل الدخول" : "Please sign in"}</p>
      </div>
    );
  }

  if (invalidAppId) return <div className="min-h-screen"><Navbar showBack backTo="/dashboard" /><p role="alert" className="container py-12">{isAr ? "رقم الطلب غير صالح. افتح الطلب من لوحة التحكم." : "Invalid application reference. Open the application from your dashboard."}</p></div>;

  if (!appId) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar showBack backTo="/dashboard" />
        <div className="container py-20 flex flex-col items-center gap-4">
          {createApp.isError || lastError ? (
            <>
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-muted-foreground text-center max-w-md">
                {lastError ||
                  (isAr
                    ? "تعذر فتح محادثة الطلب. حاول مرة أخرى."
                    : "Could not open the chatbot application. Please try again.")}
              </p>
              <Button
                onClick={() => {
                  started.current = true;
                  setLastError(null);
                  createApp.mutate({ intakeChannel: "chatbot" });
                }}
              >
                <RefreshCw className="h-4 w-4 me-2" />
                {isAr ? "إعادة المحاولة" : "Retry"}
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">
                {isAr
                  ? "جاري فتح محادثة طلب IRB..."
                  : "Opening your chatbot IRB application..."}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const remaining = missing?.length;
  const progress =
    remaining == null ? 0 : remaining === 0 ? 100 : Math.max(8, Math.min(95, 100 - remaining * 4));

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo="/dashboard" />
      <div className="container py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {isAr ? "طلب IRB عبر المحادثة" : "Chatbot AI Application"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? `طلب #${appId} — بديل عن النموذج التقليدي`
                : `Application #${appId} — alternative to the traditional form`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/apply/${appId}/declaration`)}
          >
            {isAr ? "المسار التقليدي" : "Traditional form"}
          </Button>
        </div>

        <Card className="mb-4">
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {isAr ? "تقدم الطلب" : "Application progress"}
              </span>
              <span className="text-muted-foreground">
                {remaining == null
                  ? (isAr ? "جارٍ التحقق من المتطلبات" : "Checking requirements")
                  : remaining === 0
                  ? isAr
                    ? "جاهز للمتابعة في النموذج التقليدي لإكمال الإقرار والمراجعة"
                    : "Ready — finish declaration & AI review in the traditional form"
                  : isAr
                    ? `${remaining} متطلبات متبقية`
                    : `${remaining} items remaining`}
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
            {missing && missing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">
                  {isAr ? "التالي:" : "Next:"}
                </span>{" "}
                {missing.slice(0, 6).map(k => labelFor(k, isAr)).join(isAr ? "، " : ", ")}
              </p>
            )}
          </CardContent>
        </Card>

        {lastError && (
          <Card className="mb-4 border-destructive/40 bg-destructive/5">
            <CardContent className="py-3 flex items-center justify-between gap-3 text-sm">
              <span>
                {isAr
                  ? "تعذر إرسال الرسالة. تحقق من الاتصال وحاول مرة أخرى."
                  : "Could not send that message. Check your connection and try again."}
              </span>
              <Button size="sm" variant="outline" onClick={retry} disabled={sending}>
                <RefreshCw className="h-3.5 w-3.5 me-1" />
                {isAr ? "إعادة" : "Retry"}
              </Button>
            </CardContent>
          </Card>
        )}

        {sending && (
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            {isAr ? "المساعد يراجع إجابتك..." : "Assistant is reviewing your answer..."}
          </p>
        )}

        <p className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm">
          {isAr ? "استخدم معلومات البروتوكول فقط. لا تُدخل أسماء المرضى أو أرقام هوياتهم أو سجلاتهم الطبية أو كلمات المرور أو مفاتيح API. قد تُعالج الرسائل لدى مزود الذكاء الاصطناعي المضبوط للمنصة. راجع الحقول التي يعدلها المساعد قبل التقديم؛ لا يصدر المساعد موافقة أخلاقية." : "Use protocol-level information only. Do not enter patient names, identifiers, medical records, passwords, or API keys. Messages may be processed by the platform’s configured AI provider. Review fields changed by the assistant before submission; the assistant does not issue ethics approval."}
        </p>
        {history.isError && <div role="alert" className="mb-4 rounded-lg border p-3"><p>{isAr ? "تعذر تحميل سجل الطلب. أعد المحاولة قبل إرسال معلومات جديدة." : "The application history could not be loaded. Retry before sending more information."}</p><Button variant="outline" onClick={() => history.refetch()}>{isAr ? "إعادة التحميل" : "Reload history"}</Button></div>}
        <AIChatBox
          messages={messages}
          isLoading={sending || history.isLoading || history.isError || !hydrated.current}
          onSendMessage={send}
          placeholder={
            isAr ? "اكتب إجابتك هنا..." : "Type your answer here..."
          }
          suggestedPrompts={
            messages.length <= 1
              ? isAr
                ? ["دراسة سريرية على مرضى السكري", "استبيان عن جودة الحياة"]
                : [
                    "Clinical trial on diabetes patients",
                    "Survey on quality of life",
                  ]
              : undefined
          }
          height={520}
        />
      </div>
    </div>
  );
}
