import { GUIDELINE_METADATA } from "./guidelineMetadata";

export type SiteLanguage = "en" | "ar";
export type PublicPageMetadata = {
  path: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
};

/** Public information only. Never add application, identity, or certificate-number routes. */
export const PUBLIC_PAGES: PublicPageMetadata[] = [
  { path: "/", titleEn: "Digital IRB workflows for Saudi Arabia", titleAr: "إدارة طلبات أخلاقيات البحث رقمياً في السعودية", descriptionEn: "Prepare research ethics applications, organize documents, and support accountable committee review with AI assistance. Built for Saudi Arabia; global expansion planned from 2027.", descriptionAr: "أعدّ طلبات أخلاقيات البحث ونظّم المستندات وتابع مراجعة اللجنة بمساعدة الذكاء الاصطناعي. منصة للسعودية مع توسع دولي مخطط له ابتداءً من 2027." },
  { path: "/resources", titleEn: "Research ethics resources and templates", titleAr: "موارد ونماذج أخلاقيات البحث", descriptionEn: "Preparation guides and draft templates for research protocols, informed consent, and research ethics applications in Saudi Arabia.", descriptionAr: "أدلة إعداد ونماذج أولية لبروتوكولات البحث والموافقة المستنيرة وطلبات أخلاقيات البحث في السعودية." },
  { path: "/policy", titleEn: "Platform use and research review policy", titleAr: "سياسة استخدام المنصة ومراجعة البحوث", descriptionEn: "Understand the platform's scope, researcher responsibilities, AI assistance, human decision authority, and data protection requirements.", descriptionAr: "تعرّف على نطاق المنصة ومسؤوليات الباحث ودور الذكاء الاصطناعي وصلاحية القرار البشري ومتطلبات حماية البيانات." },
  { path: "/disclaimer", titleEn: "About IRB Saudi Arabia and service scope", titleAr: "عن منصة IRB السعودية ونطاق الخدمة", descriptionEn: "Learn about the independent digital research ethics workflow platform, its founder, service limitations, and planned international expansion.", descriptionAr: "تعرّف على المنصة المستقلة لإدارة إجراءات أخلاقيات البحث ومؤسسها وحدود الخدمة وخطط التوسع الدولي." },
  { path: "/support", titleEn: "Researcher support", titleAr: "دعم الباحثين", descriptionEn: "Get help with research ethics applications, account access, document preparation, and platform issues.", descriptionAr: "احصل على المساعدة في طلبات أخلاقيات البحث والدخول إلى الحساب وإعداد المستندات ومشكلات المنصة." },
  { path: "/verify", titleEn: "Verify a platform IRB record", titleAr: "التحقق من سجل IRB في المنصة", descriptionEn: "Look up an IRB record by its reference number and check its current status. Online verification does not establish acceptance in another institution or country.", descriptionAr: "ابحث عن سجل IRB برقمه المرجعي وتحقق من حالته الحالية. التحقق الإلكتروني لا يثبت قبول السجل لدى مؤسسة أخرى أو في دولة أخرى." },
  ...GUIDELINE_METADATA.map(doc => ({ path: `/resources/guideline/${doc.slug}`, titleEn: doc.titleEn, titleAr: doc.titleAr, descriptionEn: doc.descEn, descriptionAr: doc.descAr })),
];

export const PUBLIC_PATHS = PUBLIC_PAGES.map(page => page.path);

export function getPageMetadata(path: string, language: SiteLanguage = "en") {
  const barePath = path.split(/[?#]/, 1)[0] || "/";
  const page = PUBLIC_PAGES.find(row => row.path === barePath);
  const isAr = language === "ar";
  return {
    path: barePath,
    title: `${page ? (isAr ? page.titleAr : page.titleEn) : (isAr ? "مساحة العمل" : "Workspace")} | IRB Saudi Arabia`,
    description: page ? (isAr ? page.descriptionAr : page.descriptionEn) : (isAr ? "مساحة عمل خاصة لإدارة طلبات أخلاقيات البحث." : "Private workspace for managing research ethics applications."),
    robots: page ? "index, follow" : "noindex, nofollow, noarchive",
    indexable: Boolean(page),
  };
}

/** Only a configured HTTPS origin can become a canonical or sitemap hostname. */
export function getPublicSiteOrigin(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || !["", "/"].includes(parsed.pathname)) return null;
    if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return null;
    return parsed.origin;
  } catch { return null; }
}
