import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Clock, CheckCircle, XCircle, Loader2, Eye, Timer } from "lucide-react";

export default function ReviewDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { lang } = useT();
  const isAr = lang === "ar";

  const { data: pendingReviews, isLoading: pendingLoading, refetch: refetchPending } = trpc.review.myPendingReviews.useQuery(undefined, { enabled: isAuthenticated });
  const { data: allReviews, isLoading: allLoading, refetch: refetchAll } = trpc.review.myAllReviews.useQuery(undefined, { enabled: isAuthenticated });
  const [comments, setComments] = useState<Record<number, string>>({});

  const submitReview = trpc.review.submitReview.useMutation({
    onSuccess: (data) => {
      toast.success(isAr ? `تم تقديم المراجعة. الموافقات: ${data.approvals}` : `Review submitted. Approvals: ${data.approvals}, Rejections: ${data.rejections}`);
      refetchPending(); refetchAll();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="py-8 text-center">
          <p className="text-muted-foreground">{isAr ? "يرجى تسجيل الدخول للوصول إلى المراجعات." : "Please sign in to access reviews."}</p>
        </CardContent></Card>
      </div>
    );
  }

  const getTimeRemaining = (expiresAt: Date) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return isAr ? "منتهي" : "Expired";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return isAr ? `${hours} ساعة ${mins} دقيقة متبقية` : `${hours}h ${mins}m remaining`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{isAr ? "لوحة مراجعة اللجنة" : "Committee Review Panel"}</h1>
          <NotificationCenter />
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">{isAr ? "قيد الانتظار" : "Pending"} ({pendingReviews?.length || 0})</TabsTrigger>
            <TabsTrigger value="history">{isAr ? "السجل" : "History"} ({allReviews?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pendingLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : !pendingReviews?.length ? (
              <Card><CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{isAr ? "لا توجد مراجعات معلقة" : "No Pending Reviews"}</h3>
                <p className="text-muted-foreground">{isAr ? "ليس لديك طلبات تنتظر مراجعتك." : "You have no applications waiting for your review."}</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-4">
                {pendingReviews.map((review: any) => (
                  <Card key={review.id} className="border-yellow-100">
                    <CardContent className="py-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold">{review.application?.researchTitle || `Application #${review.applicationId}`}</h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>{review.application?.principalInvestigator}</span>
                            <span>{review.application?.piInstitution}</span>
                            {review.application?.researchType && (
                              <Badge variant="outline" className="text-xs">{review.application.researchType.replace(/_/g, " ")}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs">
                            {review.application?.stage1AiScore !== null && <span>{isAr ? "المرحلة 1:" : "AI Stage 1:"} <strong>{review.application.stage1AiScore}/100</strong></span>}
                            {review.application?.stage2AiScore !== null && <span>{isAr ? "المرحلة 2:" : "AI Stage 2:"} <strong>{review.application.stage2AiScore}/100</strong></span>}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Timer className="h-3 w-3 text-yellow-600" />
                            <span className="text-xs text-yellow-600 font-medium">{getTimeRemaining(review.expiresAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => setLocation(`/application/${review.applicationId}`)}>
                            <Eye className="h-3 w-3 me-1" /> {isAr ? "عرض" : "View"}
                          </Button>
                          <Dialog>
                            <DialogTrigger asChild><Button size="sm">{isAr ? "مراجعة" : "Review"}</Button></DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>{isAr ? "تقديم المراجعة" : "Submit Review"}</DialogTitle></DialogHeader>
                              <div className="space-y-4 pt-2">
                                <div className="p-3 rounded-lg bg-muted/50">
                                  <p className="font-medium text-sm">{review.application?.researchTitle}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{review.application?.principalInvestigator} • {review.application?.piInstitution}</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>{isAr ? "التعليقات (اختياري)" : "Comments (optional)"}</Label>
                                  <Textarea placeholder={isAr ? "قدم ملاحظاتك أو مخاوفك..." : "Provide feedback or concerns..."} value={comments[review.id] || ""} onChange={(e) => setComments({ ...comments, [review.id]: e.target.value })} rows={4} />
                                </div>
                                <div className="flex gap-3">
                                  <Button className="flex-1" onClick={() => submitReview.mutate({ reviewId: review.id, decision: "approved", comments: comments[review.id] || undefined })} disabled={submitReview.isPending}>
                                    <CheckCircle className="h-4 w-4 me-2" /> {isAr ? "موافقة" : "Approve"}
                                  </Button>
                                  <Button variant="destructive" className="flex-1" onClick={() => submitReview.mutate({ reviewId: review.id, decision: "rejected", comments: comments[review.id] || undefined })} disabled={submitReview.isPending}>
                                    <XCircle className="h-4 w-4 me-2" /> {isAr ? "رفض" : "Reject"}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            {allLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : !allReviews?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">{isAr ? "لا يوجد سجل مراجعات." : "No review history."}</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {allReviews.map((review: any) => (
                  <Card key={review.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{review.application?.researchTitle || `App #${review.applicationId}`}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-xs capitalize ${
                              review.status === "approved" ? "border-emerald-200 text-emerald-700" :
                              review.status === "rejected" ? "border-red-200 text-red-700" :
                              review.status === "expired" ? "border-gray-200 text-gray-500" :
                              "border-yellow-200 text-yellow-700"
                            }`}>
                              {review.status === "approved" && <CheckCircle className="h-3 w-3 me-1" />}
                              {review.status === "rejected" && <XCircle className="h-3 w-3 me-1" />}
                              {review.status === "expired" && <Clock className="h-3 w-3 me-1" />}
                              {review.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {review.respondedAt ? new Date(review.respondedAt).toLocaleString() : (isAr ? "لم يتم الرد" : "No response")}
                            </span>
                          </div>
                          {review.comments && <p className="text-xs text-muted-foreground mt-1">{review.comments}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
