import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { analyticsPath } from "@/lib/privacy";

export function AnalyticsBeacon() {
  const [location] = useLocation();
  const ingest = trpc.analytics.ingest.useMutation();
  const mutateRef = useRef(ingest.mutate);
  const sessionId = useRef<string | null>(null);
  useEffect(() => { mutateRef.current = ingest.mutate; }, [ingest.mutate]);

  useEffect(() => {
    // Explicit opt-in deployment switch; no third-party scripts or cookies.
    if (import.meta.env.VITE_PUBLIC_ANALYTICS_ENABLED !== "1") return;
    const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (privacy.doNotTrack === "1" || privacy.globalPrivacyControl) return;
    const path = analyticsPath(location);
    if (!path || document.visibilityState !== "visible") return;
    if (!sessionId.current) sessionId.current = crypto.randomUUID();
    mutateRef.current({ sessionId: sessionId.current, path, eventType: "pageview", dwellMs: 0 });
    // No heartbeat or leave mutations: avoid retaining interaction histories
    // or adding network work to every research workflow transition.
  }, [location]);
  return null;
}
