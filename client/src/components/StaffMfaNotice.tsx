import { useT } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

/** Guidance only; staff authorization is always enforced by the server. */
export function StaffMfaNotice() {
  const { lang } = useT();
  const isAr = lang === "ar";
  return <div className="min-h-screen flex items-center justify-center p-5"><Card className="max-w-lg"><CardContent className="py-8 space-y-4 text-center"><ShieldCheck className="h-10 w-10 mx-auto text-primary" /><h1 className="text-xl font-bold">{isAr ? "يلزم التحقق بخطوتين" : "Two-step verification required"}</h1><p>{isAr ? "أكمل التحقق في إعدادات حسابك قبل استخدام صلاحيات المراجعة أو الإدارة. يبقى ملفك وطلباتك الشخصية متاحين." : "Complete verification in your account settings before using reviewer or administrator authority. Your profile and personal applications remain available."}</p><Button asChild><a href="/profile#account-security">{isAr ? "فتح إعدادات أمان الحساب" : "Open account security"}</a></Button></CardContent></Card></div>;
}
