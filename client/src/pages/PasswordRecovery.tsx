import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/design/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/contexts/LanguageContext";
import { Loader2 } from "lucide-react";

export default function PasswordRecovery() {
  const [location, setLocation] = useLocation();
  const reset = location === "/reset-password";
  return <RecoveryForm key={location} reset={reset} navigate={setLocation} />;
}
function RecoveryForm({
  reset,
  navigate,
}: {
  reset: boolean;
  navigate: (path: string) => void;
}) {
  const { lang } = useT();
  const isAr = lang === "ar";
  // Capture once, remove from history, and never persist or include this value in links.
  const token = useRef(
    reset
      ? new URLSearchParams(window.location.hash.slice(1)).get("token") ||
          new URLSearchParams(window.location.search).get("token") ||
          ""
      : ""
  );
  useLayoutEffect(() => {
    if (reset)
      window.history.replaceState(window.history.state, "", "/reset-password");
    // The component-scoped ref is collected on unmount. Do not erase it in
    // effect cleanup: React StrictMode replays that cleanup while still mounted.
  }, [reset]);
  const [availability, setAvailability] = useState<
    "loading" | "available" | "unavailable"
  >(reset ? "available" : "loading");
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  useEffect(() => {
    if (reset) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    setAvailability("loading");
    void fetch("/api/auth/recovery-status", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async response => (response.ok ? await response.json() : null))
      .then(body => {
        if (active)
          setAvailability(
            body?.available === true ? "available" : "unavailable"
          );
      })
      .catch(() => {
        if (active) setAvailability("unavailable");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [reset, availabilityAttempt]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestBusy = useRef(false);
  const [validToken] = useState(
    () => !reset || /^[a-f0-9]{64}$/.test(token.current)
  );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      requestBusy.current ||
      done ||
      !validToken ||
      (!reset && availability !== "available")
    )
      return;
    if (
      reset &&
      (password.length < 12 ||
        password.length > 200 ||
        password !== confirmation)
    ) {
      setError(
        isAr
          ? "استخدم كلمة مرور من 12 إلى 200 حرفاً وتأكد من تطابق الكلمتين."
          : "Use a password of 12–200 characters and make sure both entries match."
      );
      return;
    }
    requestBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        reset ? "/api/auth/reset-password" : "/api/auth/forgot-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify(
            reset ? { token: token.current, password } : { email: email.trim() }
          ),
        }
      );
      if (!response.ok) {
        setError(
          response.status === 429
            ? isAr
              ? "محاولات كثيرة. انتظر قليلاً قبل إعادة المحاولة."
              : "Too many attempts. Wait before trying again."
            : reset && response.status === 400
              ? isAr
                ? "الرابط غير صالح أو انتهت صلاحيته أو استُخدم. اطلب رابطاً جديداً."
                : "This link is invalid, expired or already used. Request a new link."
              : isAr
                ? "الخدمة غير متاحة حالياً. أعد المحاولة لاحقاً."
                : "The service is currently unavailable. Please retry later."
        );
        return;
      }
      const body = await response.json().catch(() => null);
      if (body?.ok !== true) throw new Error("RECOVERY_UNCONFIRMED");
      if (reset) token.current = "";
      setDone(true);
      setEmail("");
    } catch {
      setError(
        isAr
          ? "تعذر تأكيد إكمال الطلب. تحقق من اتصالك ثم أعد المحاولة."
          : "The request could not be confirmed. Check your connection and try again."
      );
    } finally {
      setPassword("");
      setConfirmation("");
      requestBusy.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <header className="border-b border-forest-900/10 px-6 py-4 flex items-center justify-between">
        <Logo />
        <LanguageToggle />
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <h1 className="font-display text-2xl font-bold text-forest-950">
            {reset
              ? isAr
                ? "تعيين كلمة مرور جديدة"
                : "Set a new password"
              : isAr
                ? "نسيت كلمة المرور؟"
                : "Forgot your password?"}
          </h1>
          {done ? (
            <div
              role="status"
              className="rounded-xl border bg-white p-5 space-y-3"
            >
              <p>
                {reset
                  ? isAr
                    ? "تم تغيير كلمة المرور. سجّل الدخول باستخدام كلمتك الجديدة؛ انتهت صلاحية جلسات المنصة السابقة."
                    : "Your password was changed. Sign in with your new password; previous platform sessions have been invalidated."
                  : isAr
                    ? "إذا كان البريد مرتبطاً بحساب يمكن استعادته، فستصلك رسالة تتضمن الخطوة التالية. تحقق من البريد الوارد والرسائل غير المرغوب فيها. لا يؤكد هذا الرد وجود حساب."
                    : "If the address belongs to an account eligible for recovery, you will receive an email with the next step. Check your inbox and spam folder. This response does not confirm that an account exists."}
              </p>
            </div>
          ) : reset && !validToken ? (
            <p role="alert" className="rounded-xl border bg-white p-5">
              {isAr
                ? "افتح رابط الاستعادة الكامل من بريدك. إذا استُخدم الرابط أو انتهت صلاحيته، فاطلب رابطاً جديداً."
                : "Open the complete recovery link from your email. If it was used or expired, request a new link."}
            </p>
          ) : (
            <>
              {!reset && availability !== "available" && (
                <div
                  role="status"
                  className="rounded-xl border bg-white p-4 text-sm space-y-3"
                >
                  <p>
                    {availability === "loading"
                      ? isAr
                        ? "جارٍ التحقق من توفر خدمة الاستعادة…"
                        : "Checking recovery service availability…"
                      : isAr
                        ? "استعادة كلمة المرور بالبريد غير متاحة حالياً. لم يُرسل طلب استعادة. تواصل مع الدعم أو أعد التحقق لاحقاً."
                        : "Email password recovery is currently unavailable. No recovery request has been sent. Contact support or check again later."}
                  </p>
                  {availability === "unavailable" && (
                    <>
                      <a className="underline" href="/support">
                        {isAr ? "التواصل مع الدعم" : "Contact support"}
                      </a>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 ms-4"
                        onClick={() =>
                          setAvailabilityAttempt(value => value + 1)
                        }
                      >
                        {isAr ? "إعادة التحقق" : "Check again"}
                      </Button>
                    </>
                  )}
                </div>
              )}
              <p className="text-sm text-ink-soft">
                {reset
                  ? isAr
                    ? "اختر كلمة مرور فريدة من 12 إلى 200 حرفاً."
                    : "Choose a unique password of 12–200 characters."
                  : isAr
                    ? "أدخل بريد حساب المنصة. إذا كنت تستخدم تسجيل دخول مرتبطاً بخدمة أخرى، فاستعد كلمة المرور لدى تلك الخدمة."
                    : "Enter your platform account email. If you use a connected sign-in service, recover your password with that service."}
              </p>
              <form
                onSubmit={event => void submit(event)}
                aria-busy={busy}
                className="space-y-4 rounded-2xl border border-forest-900/10 bg-white p-6 shadow-sm"
              >
                {reset ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">
                        {isAr ? "كلمة المرور الجديدة" : "New password"}
                      </Label>
                      <Input
                        id="new-password"
                        name="new-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={200}
                        required
                        disabled={busy}
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">
                        {isAr ? "تأكيد كلمة المرور" : "Confirm password"}
                      </Label>
                      <Input
                        id="confirm-password"
                        name="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={200}
                        required
                        disabled={busy}
                        value={confirmation}
                        onChange={event => setConfirmation(event.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="recovery-email">
                      {isAr ? "البريد الإلكتروني" : "Email address"}
                    </Label>
                    <Input
                      id="recovery-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      maxLength={320}
                      required
                      disabled={busy}
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                    />
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-sm text-red-800">
                    {error}
                  </p>
                )}
                <Button
                  className="w-full"
                  type="submit"
                  disabled={busy || (!reset && availability !== "available")}
                >
                  {busy && (
                    <Loader2
                      className="h-4 w-4 me-2 animate-spin"
                      aria-hidden
                    />
                  )}
                  {reset
                    ? isAr
                      ? "حفظ كلمة المرور الجديدة"
                      : "Save new password"
                    : isAr
                      ? "طلب رابط الاستعادة"
                      : "Request recovery link"}
                </Button>
              </form>
            </>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <Button
              variant="link"
              className="p-0 h-auto"
              disabled={busy}
              onClick={() => navigate("/auth")}
            >
              {isAr ? "العودة لتسجيل الدخول" : "Back to sign-in"}
            </Button>
            {reset && !done && (
              <Button
                variant="link"
                className="p-0 h-auto"
                disabled={busy}
                onClick={() => navigate("/forgot-password")}
              >
                {isAr ? "طلب رابط جديد" : "Request a new link"}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
