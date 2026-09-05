/**
 * IRB Saudi Arabia brand assets — Stamped Tick mark (8×8 grid spec).
 * Accent jade (#10b981) reserved for approval / success gestures only.
 */

export const PLATFORM = {
  nameEn: "IRB Saudi Arabia",
  nameAr: "IRB — المملكة العربية السعودية",
  nbceUrl: "https://www.ncbe.kacst.edu.sa",
  ahssUrl: "https://ahss-sa.org",
} as const;

/** Scope statement must not imply government affiliation or accreditation. */
export const PLATFORM_DISCLAIMER = {
  en: "Independent digital research ethics workflow platform for Saudi Arabia. AI assists preparation and assessment; authorized human reviewers retain decision authority. Institutional and jurisdictional requirements apply. International expansion is planned from 2027, subject to local requirements.",
  ar: "منصة رقمية مستقلة لإدارة إجراءات أخلاقيات البحث في السعودية. يساعد الذكاء الاصطناعي في الإعداد والتقييم، وتبقى صلاحية القرار لدى المراجعين البشريين المخولين. تنطبق متطلبات المؤسسة والدولة المعنية. يُخطط للتوسع الدولي ابتداءً من 2027 وفق المتطلبات المحلية.",
} as const;

export const BRAND = {
  forest: "#064e3b",
  jade: "#10b981",
  jadeDark: "#059669",
  cream: "#faf9f6",
} as const;

export const AUTHOR = {
  nameEn: "Dr. Abdulsalam Aleid",
  nameAr: "د. عبدالسلام العيد",
  titleEn: "Platform Founder",
  titleAr: "مؤسس المنصة",
  orgEn: "Advanced Healthcare Systems Society (AHSS)",
  orgAr: "جمعية أنظمة الرعاية الصحية المتقدمة (AHSS)",
  linkedin: "https://www.linkedin.com/in/abdulsalam-aleid-mbbs-mba-mim-mhqs-911446142/",
  founderTitleEn: "Founder",
  founderTitleAr: "المؤسس",
} as const;

/** Stamped Tick — inline SVG for certificates, exports, and UI. */
export const STAMPED_TICK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${PLATFORM.nameEn}">
  <rect x="8" y="8" width="48" height="48" rx="6" fill="none" stroke="${BRAND.forest}" stroke-width="6" transform="rotate(-4 32 32)"/>
  <path d="M18 34 L28 44 L46 22" fill="none" stroke="${BRAND.jade}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-4 32 32)"/>
</svg>`;

export const LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(STAMPED_TICK_SVG)}`;
