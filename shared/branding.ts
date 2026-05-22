/**
 * IRB Ultimate brand assets — Stamped Tick mark (8×8 grid spec).
 * Accent jade (#10b981) reserved for approval / success gestures only.
 */

export const BRAND = {
  forest: "#064e3b",
  jade: "#10b981",
  jadeDark: "#059669",
  cream: "#faf9f6",
} as const;

/** Stamped Tick — inline SVG for certificates, exports, and UI. */
export const STAMPED_TICK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="IRB Ultimate">
  <rect x="8" y="8" width="48" height="48" rx="6" fill="none" stroke="${BRAND.forest}" stroke-width="6" transform="rotate(-4 32 32)"/>
  <path d="M18 34 L28 44 L46 22" fill="none" stroke="${BRAND.jade}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-4 32 32)"/>
</svg>`;

export const LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(STAMPED_TICK_SVG)}`;
