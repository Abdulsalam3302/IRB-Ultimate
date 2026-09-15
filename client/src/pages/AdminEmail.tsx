import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function AdminEmail() {
  const { user, loading } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar",
    label = (en: string, arabic: string) => (ar ? arabic : en);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [role, setRole] = useState<"all" | "user" | "admin">("all"),
    [page, setPage] = useState(1);
  const [copy, setCopy] = useState({
      subjectEn: "",
      subjectAr: "",
      bodyEn: "",
      bodyAr: "",
    }),
    [confirmation, setConfirmation] = useState(""),
    [authorized, setAuthorized] = useState(false),
    [message, setMessage] = useState("");
  const enabled = !!user && user.role === "admin",
    isOwner = !!user?.isOwner;
  const config = trpc.mailAdmin.configuration.useQuery(undefined, {
    enabled,
    retry: false,
  });
  const directory = trpc.mailAdmin.directory.useQuery(
    { search: filter, role, page, pageSize: 25 },
    { enabled, retry: false }
  );
  const deliveries = trpc.mailAdmin.deliveries.useQuery(
    { limit: 50 },
    { enabled, retry: false }
  );
  const campaigns = trpc.mailAdmin.campaigns.useQuery(undefined, {
    enabled: enabled && isOwner,
    retry: false,
  });
  const preview = trpc.mailAdmin.preview.useMutation({
    onSuccess: () => {
      setConfirmation("");
      setAuthorized(false);
      setMessage("");
    },
    onError: e => setMessage(e.message),
  });
  const confirm = trpc.mailAdmin.confirm.useMutation({
    onSuccess: result => {
      setMessage(
        label(
          `${result.queuedCount} messages queued; ${result.skippedCount} skipped. Queueing does not confirm delivery.`,
          `أُضيفت ${result.queuedCount} رسالة إلى قائمة الإرسال، وتُخطيت ${result.skippedCount} رسالة. الإضافة إلى القائمة لا تعني تأكيد التسليم.`
        )
      );
      preview.reset();
      setConfirmation("");
      setAuthorized(false);
      void deliveries.refetch();
      void campaigns.refetch();
    },
    onError: e => setMessage(e.message),
  });
  const invalidatePreview = () => {
    preview.reset();
    setConfirmation("");
    setAuthorized(false);
  };
  const stateLabel = (state: string) =>
    ({
      queued: label("Queued", "في قائمة الإرسال"),
      sending: label("Sending", "قيد الإرسال"),
      accepted: label("Provider accepted", "قبله مزود البريد"),
      delivered: label(
        "Delivered to recipient server",
        "سُلّم إلى خادم المستلم"
      ),
      bounced: label("Bounced", "تعذر التسليم نهائياً"),
      complained: label("Reported as spam", "أُبلغ عنه كبريد مزعج"),
      failed: label("Failed", "فشل"),
      unknown: label(
        "Uncertain — review required",
        "غير مؤكد — يتطلب المراجعة"
      ),
      suppressed: label("Suppressed", "مستبعد من الإرسال"),
      cancelled: label("Cancelled", "ملغى"),
      preview: label("Preview only", "معاينة فقط"),
      queueing: label("Preparing queue", "جارٍ إعداد قائمة الإرسال"),
    })[state] || state;
  if (loading)
    return <main className="p-8">{label("Loading…", "جارٍ التحميل…")}</main>;
  if (!enabled)
    return (
      <main className="p-8">
        <h1>{label("Administrator access required", "يلزم حساب مسؤول")}</h1>
        <Link href="/dashboard">{label("Dashboard", "لوحة التحكم")}</Link>
      </main>
    );
  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      className="mx-auto max-w-6xl space-y-6 px-4 py-8"
    >
      <div>
        <Link href="/admin" className="text-sm underline">
          {label("Back to administration", "العودة إلى الإدارة")}
        </Link>
        <h1 className="mt-3 text-3xl font-bold">
          {label("Email administration", "إدارة البريد الإلكتروني")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {label(
            "Private account directory, message previews and delivery records.",
            "دليل الحسابات الخاص ومعاينة الرسائل وسجلات التسليم."
          )}
        </p>
      </div>
      {config.error && (
        <p role="alert" className="text-destructive">
          {config.error.message}
        </p>
      )}
      {config.data && (
        <p className="rounded border bg-muted p-4">
          {label("Sender", "المرسل")}: <span dir="ltr">{config.data.from}</span>{" "}
          ·{" "}
          {config.data.enabled
            ? label(
                `Configured, up to ${config.data.dailyLimit} attempts daily.`,
                `مُعدّ للإرسال، بحد أقصى ${config.data.dailyLimit} محاولة يومياً.`
              )
            : label(
                "Delivery is not configured. Previews and sends remain unavailable.",
                "الإرسال غير مُعدّ. المعاينة والإرسال غير متاحين حالياً."
              )}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {label("User email directory", "دليل البريد الإلكتروني للمستخدمين")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap gap-3"
            onSubmit={event => {
              event.preventDefault();
              setFilter(search);
              setPage(1);
              invalidatePreview();
            }}
          >
            <Input
              aria-label={label(
                "Search name or email",
                "البحث بالاسم أو البريد"
              )}
              className="min-w-48 flex-1"
              value={search}
              onChange={event => setSearch(event.target.value)}
              maxLength={100}
            />
            <select
              aria-label={label("Account role", "دور الحساب")}
              className="rounded border px-3"
              value={role}
              onChange={event => {
                setRole(event.target.value as typeof role);
                setPage(1);
                invalidatePreview();
              }}
            >
              <option value="all">{label("All roles", "جميع الأدوار")}</option>
              <option value="user">
                {label("Applicants", "مقدمو الطلبات")}
              </option>
              <option value="admin">
                {label("Administrators", "المسؤولون")}
              </option>
            </select>
            <Button type="submit">{label("Search", "بحث")}</Button>
          </form>
          {directory.error && (
            <p role="alert" className="text-destructive">
              {directory.error.message}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-start">{label("Name", "الاسم")}</th>
                  <th className="p-2 text-start">
                    {label("Email", "البريد الإلكتروني")}
                  </th>
                  <th className="p-2 text-start">{label("Role", "الدور")}</th>
                </tr>
              </thead>
              <tbody>
                {directory.data?.accounts.map(account => (
                  <tr key={account.id} className="border-b">
                    <td className="p-2">{account.name || "—"}</td>
                    <td className="p-2" dir="ltr">
                      {account.email}
                    </td>
                    <td className="p-2">
                      {account.role === "admin"
                        ? label("Administrator", "مسؤول")
                        : label("Applicant", "مقدم طلب")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {directory.data && (
            <div className="flex items-center justify-between gap-3">
              <span>
                {label(
                  `${directory.data.total} matching accounts`,
                  `${directory.data.total} حساب مطابق`
                )}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  {label("Previous", "السابق")}
                </Button>
                <Button
                  variant="outline"
                  disabled={page * 25 >= directory.data.total}
                  onClick={() => setPage(p => p + 1)}
                >
                  {label("Next", "التالي")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>
              {label(
                "Prepare an optional account update",
                "إعداد تحديث اختياري للحسابات"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              {label(
                "The current directory filter defines the audience, across all pages. A batch is limited to250 accounts. Each person receives a private email with an unsubscribe link.",
                "يحدد مرشح الدليل الحالي الجمهور عبر جميع الصفحات. تُحدّد الدفعة بـ250 حساباً. يتلقى كل شخص رسالة خاصة تتضمن رابط إلغاء الاشتراك."
              )}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["subjectEn", "English subject", "عنوان الرسالة بالإنجليزية"],
                  ["subjectAr", "Arabic subject", "عنوان الرسالة بالعربية"],
                  ["bodyEn", "English message", "نص الرسالة بالإنجليزية"],
                  ["bodyAr", "Arabic message", "نص الرسالة بالعربية"],
                ] as const
              ).map(([key, en, arabic]) => (
                <label key={key} className="space-y-2">
                  <span className="block text-sm font-medium">
                    {label(en, arabic)}
                  </span>
                  {key.startsWith("subject") ? (
                    <Input
                      dir={key.endsWith("Ar") ? "rtl" : "ltr"}
                      value={copy[key]}
                      maxLength={100}
                      onChange={event => {
                        setCopy({ ...copy, [key]: event.target.value });
                        invalidatePreview();
                      }}
                    />
                  ) : (
                    <Textarea
                      dir={key.endsWith("Ar") ? "rtl" : "ltr"}
                      rows={7}
                      value={copy[key]}
                      maxLength={8000}
                      onChange={event => {
                        setCopy({ ...copy, [key]: event.target.value });
                        invalidatePreview();
                      }}
                    />
                  )}
                </label>
              ))}
            </div>
            <Button
              disabled={
                !config.data?.enabled ||
                preview.isPending ||
                Object.values(copy).some(v => !v.trim())
              }
              onClick={() =>
                preview.mutate({ copy, audience: { search: filter, role } })
              }
            >
              {preview.isPending
                ? label("Preparing…", "جارٍ الإعداد…")
                : label(
                    "Preview message and recipients",
                    "معاينة الرسالة والمستلمين"
                  )}
            </Button>
            {preview.data && (
              <section className="space-y-4 rounded border bg-muted/40 p-4">
                <h3 className="font-bold">
                  {label(
                    `${preview.data.recipientCount} recipients; ${preview.data.excludedCount} excluded`,
                    `${preview.data.recipientCount} مستلماً؛ استُبعد ${preview.data.excludedCount}`
                  )}
                </h3>
                <p className="text-sm">
                  {label(
                    "Preview expires after30 minutes. Nothing has been sent.",
                    "تنتهي المعاينة بعد30 دقيقة. لم تُرسل أي رسالة بعد."
                  )}
                </p>
                <pre
                  className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-background p-4 font-sans text-sm"
                  dir="auto"
                >
                  {preview.data.text}
                </pre>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={authorized}
                    onChange={event => setAuthorized(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    {label(
                      "I have reviewed this message and am authorized to contact this audience with this optional update.",
                      "راجعت هذه الرسالة ولدي صلاحية التواصل مع هذا الجمهور بشأن هذا التحديث الاختياري."
                    )}
                  </span>
                </label>
                <label className="block space-y-2">
                  <span>
                    {label(
                      "Type this exact confirmation:",
                      "اكتب عبارة التأكيد التالية حرفياً:"
                    )}{" "}
                    <strong dir="ltr">{preview.data.confirmation}</strong>
                  </span>
                  <Input
                    dir="ltr"
                    value={confirmation}
                    onChange={event => setConfirmation(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <Button
                  disabled={
                    !authorized ||
                    confirmation !== preview.data.confirmation ||
                    confirm.isPending
                  }
                  onClick={() =>
                    confirm.mutate({
                      id: preview.data!.id,
                      confirmation,
                      authorizedAudience: true,
                    })
                  }
                >
                  {confirm.isPending
                    ? label("Queueing…", "جارٍ الإضافة إلى القائمة…")
                    : label(
                        "Confirm and queue emails",
                        "تأكيد وإضافة الرسائل إلى قائمة الإرسال"
                      )}
                </Button>
              </section>
            )}
            {message && (
              <p role="status" className="rounded border p-3">
                {message}
              </p>
            )}
            {campaigns.data && campaigns.data.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold">
                  {label("Recent batches", "الدفعات الأخيرة")}
                </h3>
                <ul className="space-y-2 text-sm">
                  {campaigns.data.map(campaign => (
                    <li key={campaign.id}>
                      {new Date(campaign.createdAt).toLocaleString(
                        ar ? "ar-SA" : "en-GB"
                      )}{" "}
                      · {stateLabel(campaign.status)} ·{" "}
                      {campaign.recipientCount} {label("recipients", "مستلم")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{label("Delivery records", "سجلات التسليم")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {label(
              "Accepted means the provider accepted the message. Delivered means a signed provider callback confirmed delivery to the recipient’s mail server; it does not mean the person read it. Uncertain messages require reconciliation before resending.",
              "تعني حالة القبول أن مزود البريد قبل الرسالة. وتعني حالة التسليم أن إشعاراً موقّعاً من المزود أكد وصولها إلى خادم بريد المستلم؛ ولا تعني أن الشخص قرأها. تتطلب الرسائل غير المؤكدة التحقق قبل إعادة إرسالها."
            )}
          </p>
          <Button variant="outline" onClick={() => void deliveries.refetch()}>
            {label("Refresh delivery records", "تحديث سجلات التسليم")}
          </Button>
          {deliveries.error && <p role="alert">{deliveries.error.message}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-start">
                    {label("Account ID", "معرف الحساب")}
                  </th>
                  <th className="p-2 text-start">{label("Event", "الحدث")}</th>
                  <th className="p-2 text-start">
                    {label("Status", "الحالة")}
                  </th>
                  <th className="p-2 text-start">
                    {label("Created", "وقت الإنشاء")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data?.map(delivery => (
                  <tr key={delivery.id} className="border-b">
                    <td className="p-2">{delivery.userId}</td>
                    <td className="p-2">{delivery.kind}</td>
                    <td className="p-2">{stateLabel(delivery.status)}</td>
                    <td className="p-2">
                      {new Date(delivery.createdAt).toLocaleString(
                        ar ? "ar-SA" : "en-GB"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
