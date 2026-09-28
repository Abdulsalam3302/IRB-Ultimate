import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";
import { getServiceState, onServiceState, type ServiceState } from "@/lib/serviceStatus";

/** Friendly notice while the API is briefly unavailable; disappears on the next successful request. */
export function MaintenanceBanner() {
  const { isRtl } = useT();
  const [state, setState] = useState<ServiceState>(getServiceState);
  useEffect(() => onServiceState(setState), []);
  if (state !== "maintenance") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      <Wrench className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        {isRtl
          ? "نجري صيانة سريعة. أعمالك المحفوظة آمنة — يرجى المحاولة بعد دقائق."
          : "We're doing quick maintenance. Your saved work is safe — please try again in a few minutes."}
      </span>
    </div>
  );
}
