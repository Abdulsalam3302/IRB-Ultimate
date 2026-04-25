import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useT } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, FileCheck, Users,
  Shield, Clock, Info, CheckCheck
} from "lucide-react";

const typeIcons: Record<string, typeof Bell> = {
  application_submitted: FileCheck,
  ai_review_passed: CheckCircle2,
  ai_review_failed: XCircle,
  committee_assigned: Users,
  review_received: Users,
  admin_approved: Shield,
  admin_rejected: XCircle,
  resubmission_required: AlertTriangle,
  certificate_issued: FileCheck,
  review_assignment: Clock,
  review_reminder: AlertTriangle,
  general: Info,
};

const typeColors: Record<string, string> = {
  application_submitted: "text-blue-600 bg-blue-100",
  ai_review_passed: "text-emerald-600 bg-emerald-100",
  ai_review_failed: "text-red-600 bg-red-100",
  committee_assigned: "text-purple-600 bg-purple-100",
  review_received: "text-indigo-600 bg-indigo-100",
  admin_approved: "text-emerald-600 bg-emerald-100",
  admin_rejected: "text-red-600 bg-red-100",
  resubmission_required: "text-amber-600 bg-amber-100",
  certificate_issued: "text-emerald-600 bg-emerald-100",
  review_assignment: "text-blue-600 bg-blue-100",
  review_reminder: "text-amber-600 bg-amber-100",
  general: "text-gray-600 bg-gray-100",
};

export function NotificationCenter() {
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);

  const { data: notifications, refetch } = trpc.notification.myNotifications.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => refetch(),
  });
  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => refetch(),
  });

  const count = typeof unreadCount === "number" ? unreadCount : 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold animate-pulse">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side={isAr ? "left" : "right"} className="w-[400px] sm:w-[440px]">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {t("notif.title")}
              {count > 0 && (
                <Badge variant="destructive" className="text-xs">{count}</Badge>
              )}
            </SheetTitle>
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate()}
                className="text-xs"
              >
                <CheckCheck className="h-3 w-3 me-1" />
                {t("notif.markAllRead")}
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          {!notifications?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">{t("notif.empty")}</p>
            </div>
          ) : (
            <div className="space-y-3 pe-2">
              {notifications.map((notif) => {
                const Icon = typeIcons[notif.type] || Info;
                const colorClass = typeColors[notif.type] || "text-gray-600 bg-gray-100";

                return (
                  <Card
                    key={notif.id}
                    className={`cursor-pointer transition-all hover:shadow-sm ${!notif.isRead ? "border-primary/30 bg-primary/5" : "opacity-75"}`}
                    onClick={() => {
                      if (!notif.isRead) markRead.mutate({ id: notif.id });
                    }}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className={`h-8 w-8 rounded-lg ${colorClass} flex items-center justify-center shrink-0 mt-0.5`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm truncate">{notif.title}</h4>
                            {!notif.isRead && (
                              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{notif.message}</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {new Date(notif.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
