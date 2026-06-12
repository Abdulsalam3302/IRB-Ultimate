import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabase, isSupabaseAuthEnabled } from "@/lib/supabase";
import { useT } from "@/contexts/LanguageContext";

async function bridgeSession(accessToken: string): Promise<void> {
  const res = await fetch("/api/auth/supabase/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Session bridge failed");
  }
}

export default function AuthCallback() {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const rawNext = params.get("next") || "/dashboard";
  // Same-origin path only — block open redirects via //evil.com or /\evil.com
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/dashboard";

  useEffect(() => {
    if (!isSupabaseAuthEnabled) {
      window.location.href = "/";
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const supabase = getSupabase();
        const code = params.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const token = data.session?.access_token;
        if (!token) {
          throw new Error(t("auth.noSession"));
        }

        await bridgeSession(token);
        if (!cancelled) {
          window.location.replace(next.startsWith("/") ? next : "/dashboard");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("auth.failed"));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [next, params, t]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-destructive max-w-md">{error}</p>
        <a href="/auth" className="text-forest-800 underline underline-offset-2">
          {t("auth.tryAgain")}
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-forest-800" />
      <p className="text-sm text-ink-soft">{t("auth.signingIn")}</p>
    </div>
  );
}
