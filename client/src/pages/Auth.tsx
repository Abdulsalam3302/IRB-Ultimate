import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/design/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/contexts/LanguageContext";
import { getSupabase, isSupabaseAuthEnabled } from "@/lib/supabase";
import { getLoginUrl } from "@/const";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

type Mode = "signin" | "signup";

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
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export default function Auth() {
  const { t } = useT();
  const [, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const next = params.get("next") || "/dashboard";
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseAuthEnabled) {
      window.location.href = getLoginUrl(next);
    }
    const err = params.get("error");
    if (err) toast.error(decodeURIComponent(err));
  }, [next, params]);

  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const oauth = async (provider: "google" | "apple") => {
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const emailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() || undefined },
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
        if (data.session) {
          window.location.href = `/auth/callback?next=${encodeURIComponent(next)}`;
          return;
        }
        toast.success(t("auth.checkEmail"));
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        window.location.href = `/auth/callback?next=${encodeURIComponent(next)}`;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("auth.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseAuthEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <header className="border-b border-forest-900/10 bg-cream-50/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <button type="button" onClick={() => setLocation("/")} className="cursor-pointer">
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
          <p className="mt-2 text-center text-sm text-ink-soft">{t("auth.subtitle")}</p>

          <div className="mt-8 space-y-3">
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
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-forest-900/10" />
            <span className="text-xs text-ink-soft uppercase tracking-wider">{t("auth.orEmail")}</span>
            <div className="h-px flex-1 bg-forest-900/10" />
          </div>

          <form onSubmit={emailAuth} className="space-y-4 rounded-2xl border border-forest-900/10 bg-white p-6 shadow-sm">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.fullName")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full h-11 bg-forest-900 hover:bg-forest-800" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  {mode === "signin" ? t("auth.signInButton") : t("auth.signUpButton")}
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-soft">
            {mode === "signin" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
            <button
              type="button"
              className="font-medium text-forest-800 underline underline-offset-2"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? t("auth.signUpLink") : t("auth.signInLink")}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
