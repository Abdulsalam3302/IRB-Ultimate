import { useT } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { MfaSettings } from "@/components/MfaSettings";

/** Verification appears only when the server requires it for the current account. */
export function StaffMfaNotice() {
  const { lang } = useT();
  const isAr = lang === "ar";
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-lg">
        <MfaSettings />
        <Button asChild variant="outline" className="w-full">
          <a href="/dashboard">
            {isAr ? "العودة إلى لوحة التحكم" : "Back to dashboard"}
          </a>
        </Button>
      </div>
    </main>
  );
}
