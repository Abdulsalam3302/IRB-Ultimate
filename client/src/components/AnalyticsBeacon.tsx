import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const SESSION_KEY = "irb-analytics-session";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function prefersDnt(): boolean {
  try {
    return navigator.doNotTrack === "1" || (window as unknown as { doNotTrack?: string }).doNotTrack === "1";
  } catch {
    return false;
  }
}

/**
 * Lightweight first-party pageview + heartbeat tracker.
 * Skips DNT browsers and the owner observability page.
 */
export function AnalyticsBeacon() {
  const [location] = useLocation();
  const ingest = trpc.analytics.ingest.useMutation();
  const pathEnteredAt = useRef(Date.now());
  const sessionId = useRef(getSessionId());
  const mutateRef = useRef(ingest.mutate);

  useEffect(() => {
    mutateRef.current = ingest.mutate;
  }, [ingest.mutate]);

  useEffect(() => {
    if (prefersDnt()) return;
    if (location.startsWith("/admin/observability")) return;

    pathEnteredAt.current = Date.now();
    mutateRef.current({
      sessionId: sessionId.current,
      path: location || "/",
      eventType: "pageview",
      dwellMs: 0,
    });

    const heartbeat = window.setInterval(() => {
      const dwell = Math.min(Date.now() - pathEnteredAt.current, 30_000);
      pathEnteredAt.current = Date.now();
      mutateRef.current({
        sessionId: sessionId.current,
        path: location || "/",
        eventType: "heartbeat",
        dwellMs: dwell,
      });
    }, 30_000);

    const onLeave = () => {
      const dwell = Math.min(Date.now() - pathEnteredAt.current, 120_000);
      mutateRef.current({
        sessionId: sessionId.current,
        path: location || "/",
        eventType: "leave",
        dwellMs: dwell,
      });
    };
    window.addEventListener("pagehide", onLeave);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, [location]);

  return null;
}
