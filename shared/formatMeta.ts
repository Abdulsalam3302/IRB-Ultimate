import type { FormattableSlug } from "./templateFields";

export { AUTHOR } from "./branding";

export const SLUG_META: Record<
  FormattableSlug,
  { titleEn: string; titleAr: string; descEn: string; descAr: string }
> = {
  "irb-application-form": {
    titleEn: "IRB Application Form",
    titleAr: "نموذج طلب IRB",
    descEn:
      "Principal investigator details, research classification, and ethics declaration.",
    descAr: "بيانات الباحث الرئيسي، تصنيف البحث، وإقرار الأخلاقيات.",
  },
  "informed-consent": {
    titleEn: "Informed Consent Form",
    titleAr: "نموذج الموافقة المستنيرة",
    descEn:
      "Draft participant consent for review and adaptation by the responsible committee.",
    descAr: "مسودة موافقة المشاركين لمراجعتها وتكييفها من اللجنة المختصة.",
  },
  "research-protocol": {
    titleEn: "Research Protocol",
    titleAr: "بروتوكول البحث",
    descEn: "Full methodology, ethics, analysis plan, and timeline.",
    descAr: "المنهجية الكاملة والأخلاقيات وخطة التحليل والجدول الزمني.",
  },
  "data-collection-instrument": {
    titleEn: "Data Collection Instrument",
    titleAr: "أداة جمع البيانات",
    descEn:
      "Survey or case report worksheet; select and verify suitable instruments.",
    descAr:
      "ورقة عمل لاستبيان أو تسجيل حالات؛ اختر الأدوات المناسبة وتحقق من صلاحيتها.",
  },
};

export type FormatContext =
  | { kind: "stage1"; appId: number }
  | { kind: "stage2"; appId: number }
  | { kind: "slug"; slug: FormattableSlug; appId?: number };

/** Context-aware — only slugs relevant to where the user clicked Format. */
export function getRelevantFormatSlugs(ctx: FormatContext): FormattableSlug[] {
  switch (ctx.kind) {
    case "stage1":
      return ["irb-application-form"];
    case "stage2":
      return [
        "informed-consent",
        "research-protocol",
        "data-collection-instrument",
      ];
    case "slug":
      return [ctx.slug];
  }
}

export function formatWizardPath(
  slug: FormattableSlug,
  appId?: number
): string {
  const q = appId ? `?appId=${appId}` : "";
  return `/format/${slug}${q}`;
}
