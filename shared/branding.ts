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

/** Legal positioning — independent AHSS platform, not an official NCBE IRB provider. */
export const PLATFORM_DISCLAIMER = {
  en: "Independent platform operated by Advanced Healthcare Systems Society (AHSS · ahss-sa.org). This is not an official NCBE Institutional Review Board provider. Built in compliance with PDPL, NCBE ethical guidelines, the Declaration of Helsinki, ICH-GCP, and Saudi Vision 2030 digitalization goals.",
  ar: "منصة مستقلة تُشغّلها جمعية أنظمة الرعاية الصحية المتقدمة (AHSS · ahss-sa.org). ليست جهة IRB رسمية تابعة للجنة NCBE. مُصمّمة وفق PDPL وإرشادات NCBE الأخلاقية وإعلان هلسنكي وICH-GCP وأهداف رؤية السعودية 2030 للتحول الرقمي.",
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
  titleEn: "Platform Director & Approving Authority",
  titleAr: "مدير المنصة والجهة المعتمدة",
  orgEn: "Advanced Healthcare Systems Society (AHSS)",
  orgAr: "جمعية أنظمة الرعاية الصحية المتقدمة (AHSS)",
  linkedin: "https://www.linkedin.com/in/abdulsalam-aleid-mbbs-mba-mim-911446142",
} as const;

/** Stamped Tick — inline SVG for certificates, exports, and UI. */
export const STAMPED_TICK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${PLATFORM.nameEn}">
  <rect x="8" y="8" width="48" height="48" rx="6" fill="none" stroke="${BRAND.forest}" stroke-width="6" transform="rotate(-4 32 32)"/>
  <path d="M18 34 L28 44 L46 22" fill="none" stroke="${BRAND.jade}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-4 32 32)"/>
</svg>`;

export const LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(STAMPED_TICK_SVG)}`;
