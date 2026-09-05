import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Navbar } from "@/components/Navbar";
import { useT } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Send,
  CheckCircle,
  Loader2,
  MessageSquare,
  HelpCircle,
  Lightbulb,
  Bug,
} from "lucide-react";
import { SiteFooter } from "@/components/design/SiteFooter";

type SupportCategory = "issue" | "suggestion" | "question" | "other";

export default function Support() {
  const [, setLocation] = useLocation();
  const { t, lang } = useT();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    category: "" as SupportCategory | "",
    message: "",
  });

  const createTicket = trpc.support.create.useMutation();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createTicket.isPending) return;
    const name = form.name.trim();
    const email = form.email.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (!name || !email || !subject || !form.category || !message) {
      toast.error(t("support.fillAll"));
      return;
    }
    try {
      await createTicket.mutateAsync({
        name,
        email,
        subject,
        category: form.category,
        message,
      });
      setSubmitted(true);
      toast.success(t("support.success"));
    } catch {
      toast.error(t("support.error"));
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar showBack backTo="/" backLabel={t("common.backHome")} />
        <div className="container py-20 max-w-lg mx-auto text-center">
          <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold mb-3">{t("support.submitted")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("support.submittedDesc")}
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                setForm({
                  name: "",
                  email: "",
                  subject: "",
                  category: "",
                  message: "",
                });
              }}
            >
              {t("support.submitAnother")}
            </Button>
            <Button onClick={() => setLocation("/")}>
              {t("common.backHome")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo="/" backLabel={t("common.backHome")} />

      <div className="container py-12 max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {t("support.title")}
          </h1>
          <p className="text-muted-foreground">{t("support.desc")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("support.formTitle")}</CardTitle>
            <CardDescription>{t("support.formDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm text-muted-foreground">
                {lang === "ar"
                  ? "لا تُدرج بيانات المرضى أو كلمات المرور أو مفاتيح API. أرسل وصفاً مختصراً للمشكلة."
                  : "Do not include patient information, passwords, or API keys. Send a brief description of the issue."}
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="support-name">{t("support.name")} *</Label>
                  <Input
                    placeholder={t("support.namePlaceholder")}
                    id="support-name"
                    name="name"
                    autoComplete="name"
                    required
                    aria-label={t("support.name")}
                    maxLength={200}
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="support-email">{t("support.email")} *</Label>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    id="support-email"
                    name="email"
                    autoComplete="email"
                    required
                    aria-label={t("support.email")}
                    maxLength={320}
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-category">
                  {t("support.category")} *
                </Label>
                <Select
                  name="category"
                  required
                  value={form.category}
                  onValueChange={v =>
                    setForm({ ...form, category: v as SupportCategory })
                  }
                >
                  <SelectTrigger id="support-category" aria-required="true">
                    <SelectValue
                      placeholder={t("support.categoryPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">
                      <span className="flex items-center gap-2">
                        <Bug className="h-3 w-3" /> {t("support.catIssue")}
                      </span>
                    </SelectItem>
                    <SelectItem value="suggestion">
                      <span className="flex items-center gap-2">
                        <Lightbulb className="h-3 w-3" />{" "}
                        {t("support.catSuggestion")}
                      </span>
                    </SelectItem>
                    <SelectItem value="question">
                      <span className="flex items-center gap-2">
                        <HelpCircle className="h-3 w-3" />{" "}
                        {t("support.catQuestion")}
                      </span>
                    </SelectItem>
                    <SelectItem value="other">
                      <span className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3" />{" "}
                        {t("support.catOther")}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-subject">
                  {t("support.subject")} *
                </Label>
                <Input
                  placeholder={t("support.subjectPlaceholder")}
                  id="support-subject"
                  name="subject"
                  required
                  aria-label={t("support.subject")}
                  maxLength={200}
                  value={form.subject}
                  onChange={e => setForm({ ...form, subject: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-message">
                  {t("support.message")} *
                </Label>
                <Textarea
                  placeholder={t("support.messagePlaceholder")}
                  id="support-message"
                  name="message"
                  required
                  aria-label={t("support.message")}
                  maxLength={5000}
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  rows={5}
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                type="submit"
                disabled={createTicket.isPending}
              >
                {createTicket.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 me-2 animate-spin" />{" "}
                    {t("support.submitting")}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 me-2" /> {t("support.submit")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <SiteFooter />
    </div>
  );
}
