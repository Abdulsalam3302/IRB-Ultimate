import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  DISCLAIMER_ALLOWED_PATHS,
  hasAcknowledgedDisclaimer,
  isDisclaimerAllowedPath,
} from "@shared/disclaimer";

/**
 * First-visit disclaimer gate. Disabled for the official v2.0.0 launch —
 * /disclaimer remains available as a legal page, but it no longer blocks the app.
 */
export const DISCLAIMER_GATE_ENABLED = false;

export function DisclaimerGate({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!DISCLAIMER_GATE_ENABLED) return;
    if (hasAcknowledgedDisclaimer()) return;
    if (isDisclaimerAllowedPath(location)) return;
    setLocation("/disclaimer");
  }, [location, setLocation]);

  if (
    DISCLAIMER_GATE_ENABLED &&
    !hasAcknowledgedDisclaimer() &&
    !isDisclaimerAllowedPath(location)
  ) {
    // Avoid flashing gated content while redirecting.
    if (!(DISCLAIMER_ALLOWED_PATHS as readonly string[]).includes("/disclaimer")) {
      return null;
    }
    return null;
  }

  return <>{children}</>;
}
