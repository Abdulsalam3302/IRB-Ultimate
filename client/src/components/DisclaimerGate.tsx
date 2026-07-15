import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  DISCLAIMER_ALLOWED_PATHS,
  hasAcknowledgedDisclaimer,
  isDisclaimerAllowedPath,
} from "@shared/disclaimer";

/**
 * Forces first-time visitors to /disclaimer until they acknowledge.
 * Allows /disclaimer and /policy so legal copy remains readable.
 */
export function DisclaimerGate({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (hasAcknowledgedDisclaimer()) return;
    if (isDisclaimerAllowedPath(location)) return;
    setLocation("/disclaimer");
  }, [location, setLocation]);

  if (!hasAcknowledgedDisclaimer() && !isDisclaimerAllowedPath(location)) {
    // Avoid flashing gated content while redirecting.
    if (!(DISCLAIMER_ALLOWED_PATHS as readonly string[]).includes("/disclaimer")) {
      return null;
    }
    return null;
  }

  return <>{children}</>;
}
