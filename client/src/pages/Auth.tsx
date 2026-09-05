import { safeNextPath } from "@/lib/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/design/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/contexts/LanguageContext";
import { getSupabase, isSupabaseAuthEnabled } from "@/lib/supabase";
import {
  getInstitutionalAuthCapabilities,
  signInInstitutional,
  type InstitutionalAuthCapabilities,
} from "@/lib/institutionalAuth";
import { Loader2, Mail } from "lucide-react";

type Mode = "signin" | "signup";
type AccountMethod = "applicant" | "institutional";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V9.94H5.67v8.4h2.67zM7 8.78a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9.56v-4.6c0-2.46-1.31-3.6-3.06-3.6-1.41 0-2.04.78-2.4 1.32v-1.13h-2.66c.04.75 0 8.4 0 8.4h2.66v-4.69c0-.24.02-.48.09-.65.19-.48.63-.97 1.36-.97.96 0 1.35.73 1.35 1.81v4.5h2.66z" />
    </svg>
  );
}

export default function Auth() {
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const rawNext = params.get("next") || "/dashboard";
  // Only allow same-origin path redirects — blocks open-redirect via ?next=//evil.com
  const next = safeNextPath(rawNext);
  const [mode, setMode] = useState<Mode>("signin");
  const [method, setMethod] = useState<AccountMethod>("applicant");
  const institutional = method === "institutional";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const requestBusy = useRef(false);
  const [capabilities, setCapabilities] =
    useState<InstitutionalAuthCapabilities | null>(null);
  const [capabilityAttempt, setCapabilityAttempt] = useState(0);
  const socialProviders = capabilities?.socialProviders || [];
  const socialAvailable = institutional && socialProviders.length > 0;
  const emailAvailable = !institutional || capabilities?.email === true;
  const emailId = institutional ? "institutional-email" : "email";
  const passwordId = institutional ? "institutional-password" : "password";

  useEffect(() => {
    if (params.get("error")) setAuthError(t("auth.failed"));
  }, [params]);

  useEffect(() => {
    let active = true;
    setCapabilities(null);
    getInstitutionalAuthCapabilities().then(result => {
      if (active) setCapabilities(result);
    });
    return () => {
      active = false;
    };
  }, [capabilityAttempt]);

  const selectMethod = (value: AccountMethod) => {
    if (requestBusy.current || value === method) return;
    setMethod(value);
    setAuthError(null);
    setMode("signin");
    // A password entered for one identity system must never be sent to the other.
    setPassword("");
    setEmail("");
    setName("");
  };

  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const oauth = async (provider: "google" | "apple" | "linkedin_oidc") => {
    if (
      requestBusy.current ||
      !institutional ||
      !socialProviders.includes(provider)
    )
      return;
    requestBusy.current = true;
    setAuthError(null);
    setBusy(true);
    setPassword("");
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) setAuthError(t("auth.failed"));
    } catch {
      setAuthError(t("auth.networkError"));
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  };

  const mapError = (code: string | undefined): string => {
    switch (code) {
      case "INVALID_EMAIL":
        return t("auth.invalidEmail");
      case "WEAK_PASSWORD":
        return t("auth.weakPassword");
      case "EMAIL_EXISTS":
        return t("auth.emailExists");
      case "INVALID_CREDENTIALS":
        return t("auth.invalidCredentials");
      case "RATE_LIMITED":
        return t("auth.rateLimited");
      case "NETWORK_ERROR":
        return t("auth.networkError");
      case "SESSION_BRIDGE_FAILED":
        return isAr
          ? "تعذر إنشاء جلسة المنصة. أعد المحاولة أو تواصل مع مسؤول المؤسسة. لم يكتمل تسجيل الدخول."
          : "The platform session could not be established. Retry or contact your institutional administrator. Sign-in was not completed.";
      default:
        return t("auth.failed");
    }
  };

  // The explicit selection determines the identity service; failures never trigger a fallback.
  const emailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestBusy.current || !emailAvailable) return;
    requestBusy.current = true;
    setAuthError(null);
    setBusy(true);
    try {
      if (institutional) {
        const result = await signInInstitutional(
          getSupabase(),
          email,
          password
        );
        if (!result.ok) {
          setAuthError(mapError(result.code));
          return;
        }
        window.location.href = next;
        return;
      }
      const path = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        mode === "signup"
          ? { name: name.trim() || undefined, email: email.trim(), password }
          : { email: email.trim(), password };
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          code?: string | number;
          status?: string;
        };
        // Backend down / proxy 404 often returns { status, code:404, message }
        // without our auth `code`/`error` fields — surface a clear outage hint.
        const code = typeof body.code === "string" ? body.code : undefined;
        if (
          !code &&
          (res.status >= 500 || res.status === 404 || body.status === "error")
        ) {
          setAuthError(t("auth.serverUnavailable"));
          return;
        }
        setAuthError(mapError(code));
        return;
      }
      window.location.href = next;
    } catch {
      setAuthError(t("auth.networkError"));
    } finally {
      requestBusy.current = false;
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <header className="border-b border-forest-900/10 bg-cream-50/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="cursor-pointer"
          >
            <Logo size={32} />
          </button>
          <LanguageToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="font-display text-2xl font-bold text-forest-950 text-center">
            {mode === "signin" ? t("auth.signInTitle") : t("auth.signUpTitle")}
          </h1>
          <p className="mt-2 text-center text-sm text-ink-soft">
            {isAr
              ? "اختر نوع الحساب الذي تريد استخدامه."
              : "Choose the account you want to use."}
          </p>

          <fieldset
            className="mt-6"
            disabled={busy}
            aria-describedby="account-method-description"
          >
            <legend className="mb-2 text-sm font-medium text-forest-950">
              {isAr ? "نوع الحساب" : "Account type"}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["applicant", "institutional"] as const).map(value => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${method === value ? "border-forest-800 bg-forest-900/5" : "border-forest-900/15 bg-white"}`}
                >
                  <input
                    type="radio"
                    name="account-method"
                    value={value}
                    checked={method === value}
                    onChange={() => selectMethod(value)}
                    className="mt-0.5 accent-forest-900"
                  />
                  <span>
                    {value === "applicant"
                      ? isAr
                        ? "حساب مقدم الطلب"
                        : "Applicant account"
                      : isAr
                        ? "حساب المؤسسة"
                        : "Institutional account"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p
            id="account-method-description"
            className="mt-3 text-sm leading-relaxed text-ink-soft"
          >
            {institutional
              ? isAr
                ? "استخدم حساب الهوية المخصص لك من مؤسستك لهذه المنصة. يبقى حساب مقدم الطلب منفصلاً؛ لا تنتقل الطلبات أو الصلاحيات تلقائياً. تتطلب صلاحيات الموظفين تعييناً معتمداً والتحقق بخطوتين من صفحة الملف الشخصي."
                : "Use the identity account issued for this platform by your institution. Your applicant account remains separate; applications and permissions do not transfer automatically. Staff access requires an authorized appointment and two-step verification in Profile."
              : isAr
                ? "لإنشاء الطلبات ومتابعتها، استخدم حساب مقدم الطلب المسجل مباشرة في المنصة. هذا الحساب لا يثبت التحقق المؤسسي بخطوتين."
                : "Use your account registered directly with the platform to create and track applications. This account does not establish institutional two-step verification."}
          </p>

          {authError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900"
            >
              {authError}
            </p>
          )}

          {institutional && !emailAvailable && (
            <div
              role="status"
              className="mt-5 rounded-xl border border-forest-900/15 bg-white p-4 text-sm leading-relaxed"
            >
              {!isSupabaseAuthEnabled
                ? isAr
                  ? "تسجيل الدخول المؤسسي غير مضبوط في هذا النشر. تواصل مع مشغل المنصة."
                  : "Institutional sign-in is not configured for this deployment. Contact the platform operator."
                : !capabilities
                  ? isAr
                    ? "جارٍ التحقق من طرق تسجيل الدخول المؤسسي المتاحة…"
                    : "Checking available institutional sign-in methods…"
                  : capabilities.available
                    ? isAr
                      ? "لم تفعّل المؤسسة تسجيل الدخول بالبريد وكلمة المرور. تواصل مع مسؤول المؤسسة إذا لم تتوفر طريقة أخرى لتسجيل الدخول."
                      : "Institutional email and password sign-in is not enabled. Contact your institutional administrator if no other sign-in method is available."
                    : isAr
                      ? "خدمة الهوية المؤسسية غير متاحة حالياً. أعد المحاولة لاحقاً أو تواصل مع مسؤول المؤسسة."
                      : "The institutional identity service is currently unavailable. Retry later or contact your institutional administrator."}
              {isSupabaseAuthEnabled &&
                capabilities &&
                !capabilities.available && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 block"
                    onClick={() => setCapabilityAttempt(value => value + 1)}
                  >
                    {t("auth.tryAgain")}
                  </Button>
                )}
            </div>
          )}

          {socialAvailable && (
            <>
              <div className="mt-8 space-y-3">
                {socialProviders.includes("google") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-2 bg-white"
                    disabled={busy}
                    onClick={() => oauth("google")}
                  >
                    <GoogleIcon />
                    {t("auth.continueGoogle")}
                  </Button>
                )}
                {socialProviders.includes("apple") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-2 bg-white"
                    disabled={busy}
                    onClick={() => oauth("apple")}
                  >
                    <AppleIcon />
                    {t("auth.continueApple")}
                  </Button>
                )}
                {socialProviders.includes("linkedin_oidc") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-2 bg-white"
                    disabled={busy}
                    onClick={() => oauth("linkedin_oidc")}
                  >
                    <LinkedInIcon />
                    {t("auth.continueLinkedIn")}
                  </Button>
                )}
              </div>

              {emailAvailable && (
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-forest-900/10" />
                  <span className="text-xs text-ink-soft uppercase tracking-wider">
                    {t("auth.orEmail")}
                  </span>
                  <div className="h-px flex-1 bg-forest-900/10" />
                </div>
              )}
            </>
          )}

          {emailAvailable && (
            <form
              key={method}
              aria-label={
                institutional
                  ? isAr
                    ? "تسجيل الدخول بحساب المؤسسة"
                    : "Institutional email sign-in"
                  : isAr
                    ? "حساب مقدم الطلب"
                    : "Applicant account"
              }
              aria-busy={busy}
              onSubmit={emailAuth}
              className={`${socialAvailable ? "" : "mt-8 "}space-y-4 rounded-2xl border border-forest-900/10 bg-white p-6 shadow-sm`}
            >
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <Input
                    id="name"
                    maxLength={200}
                    disabled={busy}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor={emailId}>
                  {institutional
                    ? t("auth.email")
                    : isAr
                      ? "البريد الإلكتروني"
                      : "Email address"}
                </Label>
                <Input
                  id={emailId}
                  name={emailId}
                  disabled={busy}
                  maxLength={320}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete={
                    institutional
                      ? "section-institutional username"
                      : "section-applicant username"
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={passwordId}>
                  {mode === "signup"
                    ? t("auth.password")
                    : isAr
                      ? "كلمة المرور"
                      : "Password"}
                </Label>
                <Input
                  id={passwordId}
                  name={passwordId}
                  disabled={busy}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={
                    mode === "signup"
                      ? "section-applicant new-password"
                      : institutional
                        ? "section-institutional current-password"
                        : "section-applicant current-password"
                  }
                  minLength={mode === "signup" ? 12 : 1}
                  maxLength={128}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-forest-900 hover:bg-forest-800"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t("auth.signingIn")}
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    {institutional
                      ? isAr
                        ? "الدخول بحساب المؤسسة"
                        : "Sign in to institutional account"
                      : mode === "signin"
                        ? t("auth.signInButton")
                        : t("auth.signUpButton")}
                  </>
                )}
              </Button>
            </form>
          )}

          {!institutional && (
            <p className="mt-6 text-center text-sm text-ink-soft">
              {mode === "signin" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
              <button
                type="button"
                className="font-medium text-forest-800 underline underline-offset-2"
                disabled={busy}
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setAuthError(null);
                  setPassword("");
                }}
              >
                {mode === "signin"
                  ? t("auth.signUpLink")
                  : t("auth.signInLink")}
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
