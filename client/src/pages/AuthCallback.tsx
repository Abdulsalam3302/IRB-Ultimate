import { safeNextPath } from "@/lib/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabase, isSupabaseAuthEnabled } from "@/lib/supabase";
import {
  createOAuthCallbackAttempt,
  clearOAuthCallbackParameters,
} from "@/lib/oauthCallback";
import { useT } from "@/contexts/LanguageContext";

export default function AuthCallback() {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  // Capture before constructing the SDK, which consumes successful callback codes.
  const capturedUrl = useMemo(() => window.location.href, []);
  const next = safeNextPath(
    new URL(capturedUrl).searchParams.get("next") || "/dashboard"
  );
  const attempt = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseAuthEnabled) {
      setFailed(true);
      window.history.replaceState(
        window.history.state,
        "",
        clearOAuthCallbackParameters(window.location.href)
      );
      return;
    }
    const clearHistory = () => {
      if (window.location.pathname === new URL(capturedUrl).pathname) {
        window.history.replaceState(
          window.history.state,
          "",
          clearOAuthCallbackParameters(window.location.href)
        );
      }
    };
    try {
      attempt.current ??= createOAuthCallbackAttempt(
        getSupabase(),
        capturedUrl
      );
      void attempt
        .current()
        .then(() => {
          if (!cancelled) {
            clearHistory();
            window.location.replace(next);
          }
        })
        .catch(() => {
          if (!cancelled) {
            clearHistory();
            setFailed(true);
          }
        });
    } catch {
      setFailed(true);
      clearHistory();
    }

    return () => {
      cancelled = true;
    };
  }, [next, capturedUrl]);

  if (failed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert" className="text-destructive max-w-md">
          {t("auth.failed")}
        </p>
        <a
          href={`/auth?next=${encodeURIComponent(next)}`}
          className="text-forest-800 underline underline-offset-2"
        >
          {t("auth.tryAgain")}
        </a>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="min-h-screen flex flex-col items-center justify-center gap-3"
    >
      <Loader2 className="h-8 w-8 animate-spin text-forest-800" aria-hidden />
      <p className="text-sm text-ink-soft">{t("auth.signingIn")}</p>
    </div>
  );
}
