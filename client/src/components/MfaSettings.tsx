import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useT } from "@/contexts/LanguageContext";
import { getSupabase, isSupabaseAuthEnabled } from "@/lib/supabase";
import { mfaQrImage, requireMatchingSupabaseSession, verifyTotpAndBridge } from "@/lib/mfa";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";

type Enrollment = { id: string; qr: string; secret: string };
type Factor = { id: string; name: string; status: "verified" | "unverified" };

export function MfaSettings() {
  const { user } = useAuth();
  const { lang } = useT();
  const isAr = lang === "ar";
  const utils = trpc.useUtils();
  const [state, setState] = useState<"loading" | "ready" | "signin" | "error">("loading");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [selected, setSelected] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const requestBusy = useRef(false);
  const openId = user?.openId || "";
  const verified = user?.authLevel === "aal2";
  const identity = useRef(openId);
  identity.current = openId;

  const explainError = (failure: unknown) => {
    const reason = failure instanceof Error ? failure.message : "";
    return reason === "SESSION_BRIDGE_FAILED"
      ? (isAr ? "تم التحقق لدى مزود الهوية، لكن تعذر تحديث جلسة المنصة. أعد التحقق قبل استخدام صلاحيات الموظفين." : "The identity provider verified the code, but the platform session could not be updated. Verify again before using staff access.")
      : (isAr ? "تعذر إتمام التحقق. استخدم الرمز الحالي من تطبيق المصادقة، وتأكد من ضبط ساعة جهازك، ثم حاول مجدداً. إذا استمرت المشكلة فتواصل مع المسؤول المؤسسي." : "Verification could not be completed. Use the current authenticator code, check your device clock, and retry. Contact your institutional administrator if the issue continues.");
  };

  const load = useCallback(async () => {
    if (!isSupabaseAuthEnabled || !openId.startsWith("sb:")) { setState("signin"); return; }
    try {
      const client = getSupabase();
      await requireMatchingSupabaseSession(client, openId);
      const result = await client.auth.mfa.listFactors();
      if (result.error) throw result.error;
      if (!active.current || identity.current !== openId) return;
      const next = result.data.all.filter(factor => factor.factor_type === "totp").map(factor => ({ id: factor.id, name: factor.friendly_name || "Authenticator", status: factor.status }));
      setFactors(next);
      setSelected(previous => next.some(factor => factor.id === previous) ? previous : next[0]?.id || "");
      setState("ready");
    } catch (failure) {
      if (!active.current || identity.current !== openId) return;
      setState(failure instanceof Error && failure.message.startsWith("INSTITUTIONAL_") ? "signin" : "error");
    }
  }, [openId]);

  useEffect(() => {
    active.current = true;
    setEnrollment(null); setCode(""); setShowSecret(false);
    void load();
    return () => { active.current = false; };
  }, [load]);

  const enroll = async () => {
    if (requestBusy.current) return;
    requestBusy.current = true; setBusy(true); setError(null);
    try {
      const client = getSupabase();
      await requireMatchingSupabaseSession(client, openId);
      const result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `IRB authenticator ${Date.now()}` });
      if (result.error) throw result.error;
      if (active.current && identity.current === openId) {
        setEnrollment({ id: result.data.id, qr: mfaQrImage(result.data.totp.qr_code), secret: result.data.totp.secret });
        setCode(""); setShowSecret(false);
      }
    } catch (failure) { if (active.current && identity.current === openId) setError(explainError(failure)); }
    finally { requestBusy.current = false; if (active.current) setBusy(false); }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requestBusy.current || !/^\d{6}$/.test(code)) return;
    requestBusy.current = true; setBusy(true); setError(null);
    try {
      await verifyTotpAndBridge(getSupabase(), openId, enrollment?.id || selected, code);
      // Do not infer platform AAL from the provider response; read the new signed-cookie session.
      const session = await utils.auth.me.fetch();
      if (session?.openId !== openId || session.authLevel !== "aal2") throw new Error("SESSION_BRIDGE_FAILED");
      utils.auth.me.setData(undefined, session);
      if (active.current && identity.current === openId) { setEnrollment(null); setCode(""); setShowSecret(false); await load(); }
    } catch (failure) { if (active.current && identity.current === openId) { setCode(""); setError(explainError(failure)); } }
    finally { requestBusy.current = false; if (active.current) setBusy(false); }
  };

  const cancelEnrollment = async () => {
    const factorId = enrollment?.id || factors.find(factor => factor.id === selected && factor.status === "unverified")?.id;
    if (!factorId || requestBusy.current) return;
    requestBusy.current = true; setBusy(true); setError(null);
    try {
      const client = getSupabase();
      await requireMatchingSupabaseSession(client, openId);
      const result = await client.auth.mfa.unenroll({ factorId });
      if (result.error) throw result.error;
      if (active.current && identity.current === openId) { setEnrollment(null); setCode(""); setShowSecret(false); await load(); }
    } catch (failure) { if (active.current && identity.current === openId) setError(explainError(failure)); }
    finally { requestBusy.current = false; if (active.current) setBusy(false); }
  };

  return <Card className="mb-8" id="account-security">
    <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{isAr ? "أمان الحساب والتحقق بخطوتين" : "Account security and two-step verification"}</CardTitle><CardDescription>{isAr ? "تتطلب صلاحيات المراجعة والإدارة جلسة موثقة بعاملين عند تفعيل الضابط المؤسسي. لا يمنح التحقق صفة المراجع أو صلاحية القرار وحده." : "Reviewer and administrator authority requires a two-factor session when the institutional control is enabled. Verification alone does not confer reviewer appointment or decision authority."}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {verified && <p role="status" className="text-emerald-700 dark:text-emerald-400">{isAr ? "أكدت المنصة التحقق بعاملين لهذه الجلسة." : "The platform has confirmed two-factor verification for this session."}</p>}
      {!isSupabaseAuthEnabled ? <p>{isAr ? "التحقق المؤسسي غير مضبوط في هذا النشر. تواصل مع مشغل المنصة لإعداد مزود الهوية قبل استخدام صلاحيات الموظفين. لم يتم تفعيل التحقق بخطوتين هنا." : "Institutional authentication is not configured for this deployment. Contact the operator to configure the identity provider before using staff authority. Two-step verification has not been enabled here."}</p>
      : state === "loading" ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{isAr ? "جارٍ التحقق من إعدادات الأمان" : "Checking security settings"}</p>
      : state === "signin" ? <div className="space-y-3"><p>{isAr ? "سجّل الدخول بحساب الهوية المؤسسي المرتبط بهذا الحساب أولاً. تسجيل الدخول المحلي بالبريد وكلمة المرور لا يثبت التحقق بخطوتين. يجب تعيين الحساب المؤسسي للمراجعة أو الإدارة بشكل مستقل؛ لا تنتقل الصلاحيات تلقائياً." : "Sign in with the institutional identity linked to this account first. Local email/password login does not establish two-factor verification. The institutional account must be appointed separately for reviewer or administrator duties; roles do not transfer automatically."}</p><Button asChild variant="outline"><a href="/auth?next=%2Fprofile">{isAr ? "فتح تسجيل الدخول المؤسسي" : "Open institutional sign-in"}</a></Button></div>
      : state === "error" ? <div role="alert" className="space-y-3"><p>{isAr ? "تعذر تأكيد إعدادات التحقق. لم يتم تغيير أي عامل مصادقة." : "Security settings could not be confirmed. No authentication factor was changed."}</p><Button variant="outline" onClick={() => { setState("loading"); void load(); }}>{isAr ? "إعادة المحاولة" : "Retry"}</Button></div>
      : <>
        {!enrollment && !verified && factors.length === 0 && <Button onClick={enroll} disabled={busy}>{isAr ? "إعداد تطبيق المصادقة" : "Set up an authenticator app"}</Button>}
        {enrollment && <div className="space-y-3 rounded-lg border p-4"><p>{isAr ? "امسح الرمز بتطبيق المصادقة على جهازك. احتفظ برمز الإعداد سرياً؛ لا ترسله في المحادثة أو تذاكر الدعم." : "Scan this QR code in your authenticator app. Keep the setup secret private; never put it in chat or support tickets."}</p><img src={enrollment.qr} width={220} height={220} alt={isAr ? "رمز إعداد تطبيق المصادقة السري" : "Private authenticator setup QR code"} className="max-w-full bg-white p-2 rounded" /><Button variant="outline" size="sm" onClick={() => setShowSecret(value => !value)}>{isAr ? "إظهار أو إخفاء مفتاح الإعداد اليدوي" : "Show or hide manual setup key"}</Button>{showSecret && <p className="break-all select-all font-mono" dir="ltr">{enrollment.secret}</p>}<Button variant="ghost" disabled={busy} onClick={cancelEnrollment}>{isAr ? "إلغاء هذا الإعداد" : "Cancel this setup"}</Button></div>}
        {!verified && (enrollment || factors.length > 0) && <form onSubmit={verify} className="space-y-3 max-w-sm">
          {!enrollment && factors.length > 1 && <div className="space-y-2"><Label htmlFor="mfa-factor">{isAr ? "تطبيق المصادقة" : "Authenticator"}</Label><Select value={selected} onValueChange={setSelected}><SelectTrigger id="mfa-factor"><SelectValue /></SelectTrigger><SelectContent>{factors.map(factor => <SelectItem key={factor.id} value={factor.id}>{factor.name}{factor.status === "unverified" ? (isAr ? " — إعداد غير مكتمل" : " — unfinished setup") : ""}</SelectItem>)}</SelectContent></Select></div>}
          {!enrollment && factors.find(factor => factor.id === selected)?.status === "unverified" && <div className="space-y-2 rounded-lg border p-3"><p className="text-sm">{isAr ? "لديك إعداد سابق لم يُستكمل. إذا أضفت مفتاحه إلى تطبيق المصادقة، أدخل الرمز أدناه. وإلا فاحذف هذا الإعداد ثم ابدأ إعداداً جديداً." : "An earlier setup is unfinished. If you saved its key in your authenticator, enter its code below. Otherwise, remove this unfinished setup and start again."}</p><Button type="button" variant="outline" disabled={busy} onClick={cancelEnrollment}>{isAr ? "حذف الإعداد غير المكتمل" : "Remove unfinished setup"}</Button></div>}
          <Label htmlFor="mfa-code">{isAr ? "الرمز المكون من ستة أرقام" : "Six-digit authenticator code"}</Label><Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} dir="ltr" value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} disabled={busy} required />
          <Button type="submit" disabled={busy || !/^\d{6}$/.test(code)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isAr ? "تحقق وحدّث جلسة المنصة" : "Verify and update platform session"}</Button>
        </form>}
      </>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
