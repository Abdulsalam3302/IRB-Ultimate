// Formal NCBE-style certificate — loads design template from
// server/templates/certificate.html (white paper, guilloché frame).
//
//   renderCertificateHtml(data)  — HTML for PDF generator & preview
//   renderCertificatePdf(data)   — A4 PDF via Playwright Chromium

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import type { Application } from "../drizzle/schema";
import { storagePut } from "./storage";
import { AUTHOR } from "@shared/branding";

const __dir = dirname(fileURLToPath(import.meta.url));

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function loadTemplate(): string {
  return readFileSync(join(__dir, "templates", "certificate.html"), "utf8");
}

interface CertData {
  app: Application;
  applicantName: string | null;
  applicantEmail: string | null;
}

function verifyBaseUrl(): string {
  const base = (process.env.VITE_PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return base || "https://irb-sa.org";
}

function qrSvgPlaceholder(code: string): string {
  const short = escapeHtml(code.replace(/^IRB-/, "").slice(-12));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84" shape-rendering="crispEdges" style="width:100%;height:100%">
    <rect width="84" height="84" fill="#ffffff"/>
    <rect x="4" y="4" width="76" height="76" fill="none" stroke="#064e3b" stroke-width="1.5"/>
    <rect x="10" y="10" width="18" height="18" fill="#064e3b"/><rect x="56" y="10" width="18" height="18" fill="#064e3b"/><rect x="10" y="56" width="18" height="18" fill="#064e3b"/>
    <text x="42" y="48" text-anchor="middle" font-family="ui-monospace,monospace" font-size="6.5" fill="#064e3b">${short}</text>
  </svg>`;
}

function buildAiScoresHtml(app: Application): string {
  const s1 = app.stage1AiScore;
  const s2 = app.stage2AiScore;
  if (s1 == null && s2 == null) {
    return `<div class="scores" style="grid-template-columns: 1fr; padding: 14px 0; margin-bottom: 28px;">
      <div style="display:flex; align-items:center; gap: 18px; padding: 12px 18px; background: var(--paper-2); border: 1px dashed var(--rule); border-radius: 6px;">
        <div style="flex:1;">
          <div class="k" style="font-family:ui-monospace,monospace; font-size:10px; letter-spacing:.18em; text-transform:uppercase; color: var(--ink-muted);">AI assessment</div>
          <div style="font-family:Inter,system-ui; font-size:12.5px; color: var(--ink-soft); margin-top: 2px;">Stage 1 compliance and Stage 2 ethics scores are pending; assessment will appear on the registry record when finalised.</div>
        </div>
        <span style="font-family:ui-monospace,monospace; font-size:10.5px; color: var(--ink-muted); letter-spacing:.16em; text-transform:uppercase;">Pending</span>
      </div>
    </div>`;
  }
  return `<div class="scores" style="margin-bottom: 28px;">
    <div class="score"><div class="k">AI compliance · Stage 1</div><div class="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="3"/><circle cx="18" cy="18" r="15" fill="none" stroke="#10b981" stroke-width="3" stroke-dasharray="${s1 ?? 0} 100" transform="rotate(-90 18 18)"/></svg><span class="n">${s1 ?? "—"}</span></div></div>
    <div class="score"><div class="k">AI ethics · Stage 2</div><div class="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="3"/><circle cx="18" cy="18" r="15" fill="none" stroke="#10b981" stroke-width="3" stroke-dasharray="${s2 ?? 0} 100" transform="rotate(-90 18 18)"/></svg><span class="n">${s2 ?? "—"}</span></div></div>
  </div>`;
}

const RETRACTED_CSS = `
  .retracted-stamp { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .retracted-stamp .stamp-inner { transform: rotate(-18deg); border: 6px solid #dc2626; border-radius: 8px; padding: 18px 28px; background: rgba(254,242,242,.92); box-shadow: 0 0 0 4px rgba(220,38,38,.15); }
  .retracted-stamp .stamp-text { font-size: 42px; font-weight: 900; letter-spacing: 4px; color: #dc2626; text-transform: uppercase; text-align: center; line-height: 1; font-family: Inter, system-ui, sans-serif; }
  .retracted-stamp .stamp-sub { font-size: 11px; font-weight: 600; color: #991b1b; text-align: center; margin-top: 8px; letter-spacing: 1px; font-family: Inter, system-ui, sans-serif; }
`;

export function renderCertificateHtml(data: CertData): string {
  const { app, applicantName, applicantEmail } = data;
  const approvedAt = app.approvedAt ? new Date(app.approvedAt) : new Date();
  const approvalDate = approvedAt.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const approvalTime = approvedAt.toISOString().slice(0, 19).replace("T", " ") + " UTC";
  const expiryDate = new Date(approvedAt.getTime() + 365 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  let hijriDate = "";
  try {
    hijriDate = approvedAt.toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "long", day: "numeric" });
  } catch { /* ignore */ }

  const irbNumber = app.irbNumber || `IRB-PENDING-${app.id}`;
  const reviewCategory = String(app.irbCategory || "full_board").replace(/_/g, " ");
  const researchType = String(app.researchType || "—").replace(/_/g, " ");
  const isRetracted = app.status === "retracted";
  const statusLabel = isRetracted ? "RETRACTED" : "APPROVED";
  const statusColor = isRetracted ? "#dc2626" : "var(--jade)";
  const verifyUrl = `${verifyBaseUrl()}/verify/${encodeURIComponent(irbNumber)}`;
  const verifyHost = verifyBaseUrl().replace(/^https?:\/\//, "");
  const submittedBy = applicantName
    ? `${applicantName}${applicantEmail ? ` <span class="sub mono" style="font-size:11px;">&lt;${escapeHtml(applicantEmail)}&gt;</span>` : ""}`
    : "—";
  const stampMonth = String(approvedAt.getMonth() + 1).padStart(2, "0");
  const stampYear = approvedAt.getFullYear();
  const standingLabel = isRetracted ? "Retracted · Inactive" : "Approved · Active";
  const standingColor = isRetracted ? "#dc2626" : "var(--jade)";

  let html = loadTemplate();
  html = html.replace("</style>", `${isRetracted ? RETRACTED_CSS : ""}</style>`);

  if (isRetracted) {
    html = html.replace(
      "<body>",
      `<body><div class="retracted-stamp"><div class="stamp-inner"><div class="stamp-text">[ Retracted ]</div><div class="stamp-sub">${escapeHtml(app.retractionReason || "Approval withdrawn")}</div></div></div>`,
    );
  }

  const aiScoresHtml = buildAiScoresHtml(app);
  const pendingBlock = html.match(/<div class="scores" style="grid-template-columns: 1fr;[\s\S]*?<\/div>\s*<\/div>/)?.[0];
  if (pendingBlock) html = html.replace(pendingBlock, aiScoresHtml);

  const replacements: Record<string, string> = {
    "{{IRB_NUMBER}}": escapeHtml(irbNumber),
    "{{VERIFY_URL}}": escapeHtml(verifyUrl),
    "{{VERIFY_HOST}}": escapeHtml(verifyHost),
    "{{QR_SVG}}": qrSvgPlaceholder(irbNumber),
    "IRB-SA-2026-00024": escapeHtml(irbNumber),
    "Dr. Test": escapeHtml(app.principalInvestigator || "—"),
    "University": escapeHtml(app.piInstitution || "—"),
    "Medicine": escapeHtml(app.piDepartment || "—"),
    "Clinical Trial": escapeHtml(researchType),
    "Full Board": escapeHtml(reviewCategory),
    "Not disclosed": escapeHtml(app.fundingSource || "Not disclosed"),
    "Not specified": escapeHtml(app.estimatedDuration || "Not specified"),
    "Dr. Abdulsalam Aleid <span class=\"sub mono\" style=\"font-size:11px;\">&lt;owner@irb-ultimate.local&gt;</span>": submittedBy,
    "22 May 2026 · 10:54 UTC": escapeHtml(`${approvalDate} · ${approvalTime.split(" ")[1]} UTC`),
    "22 May 2027": escapeHtml(expiryDate),
    "2026-05-22 10:54:30 UTC": escapeHtml(approvalTime),
    "2026 · 05": escapeHtml(`${stampYear} · ${stampMonth}`),
    "AHSS · 2026": escapeHtml(`AHSS · ${stampYear}`),
    "Approved · Active": escapeHtml(standingLabel),
  };

  for (const [from, to] of Object.entries(replacements)) {
    html = html.split(from).join(to);
  }

  html = html.replace(
    `<span class="v" style="color: var(--jade); display:inline-flex; align-items:center; gap:6px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg>
        APPROVED
      </span>`,
    `<span class="v" style="color: ${statusColor}; display:inline-flex; align-items:center; gap:6px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg>
        ${statusLabel}
      </span>`,
  );

  if (hijriDate) {
    html = html.replace("٦ ذو الحجة ١٤٤٧ هـ", escapeHtml(hijriDate));
  }

  html = html.replace(
    `<div class="v" style="color: var(--jade);">Approved · Active</div>`,
    `<div class="v" style="color: ${standingColor};">${escapeHtml(standingLabel)}</div>`,
  );

  if (isRetracted) {
    html = html.replace("APPROVED", "RETRACTED");
    html = html.replace('<div class="stamp-approved">', '<div class="stamp-approved" style="border-color:#dc2626;color:#dc2626;">');
  }

  // Signature block uses AUTHOR from branding
  html = html.replace("Dr. Abdulsalam Aleid, MBBS, MBA, MIM", escapeHtml(AUTHOR.nameEn + ", MBBS, MBA, MIM"));

  return html;
}

let _browserPromise: Promise<import("playwright").Browser> | null = null;
async function getBrowser() {
  if (!_browserPromise) {
    _browserPromise = chromium.launch({ headless: true });
    _browserPromise.catch(() => { _browserPromise = null; });
  }
  return _browserPromise;
}

export async function renderCertificatePdf(data: CertData): Promise<Buffer> {
  const html = renderCertificateHtml(data);
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith("data:")) return route.continue();
    return route.abort();
  });
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await ctx.close();
  }
}

export async function generateAndStoreCertificatePdf(data: CertData): Promise<string> {
  const pdf = await renderCertificatePdf(data);
  const key = `certificates/${(data.app.irbNumber || `app-${data.app.id}`).replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}.pdf`;
  const { url } = await storagePut(key, pdf, "application/pdf");
  return url;
}
