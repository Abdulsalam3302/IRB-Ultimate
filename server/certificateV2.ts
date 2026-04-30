// Redesigned certificate — formal, NBCE-style document with the
// platform logo, proper letterhead, dual-language (EN + AR Hijri date),
// guilloché-style decorative border, and signature block.
//
// Two render targets:
//   renderCertificateHtml(app, …)  — the HTML used by the PDF generator
//                                     and as the in-page preview
//   generateCertificatePdf(...)    — invokes Chromium via Playwright to
//                                     produce a true A4 PDF and uploads
//                                     to storage. Returns the PDF URL.

import { chromium } from "playwright";
import type { Application } from "../drizzle/schema";
import { storagePut } from "./storage";

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Self-contained inline SVG logo — no external request at PDF time.
// Saudi-green palette (#064e3b) shield with crescent + research nib.
const INLINE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="lg-shield" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d6b4e"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <path d="M32 4 L58 14 V32 C58 47 47 58 32 60 C17 58 6 47 6 32 V14 Z"
        fill="url(#lg-shield)" stroke="#022c1f" stroke-width="0.5"/>
  <path d="M22 26 a12 12 0 1 0 16 12 a10 10 0 1 1 -16 -12 z"
        fill="#fff" opacity="0.92"/>
  <path d="M40 22 L46 22 L42 32 L46 32 L40 44 L40 36 L36 36 Z"
        fill="#fbbf24" stroke="#92400e" stroke-width="0.4" stroke-linejoin="round"/>
</svg>`;

interface CertData {
  app: Application;
  applicantName: string | null;
  applicantEmail: string | null;
}

export function renderCertificateHtml(data: CertData): string {
  const { app, applicantName, applicantEmail } = data;
  const approvalDate = app.approvedAt
    ? new Date(app.approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const expiryDate = app.approvedAt
    ? new Date(new Date(app.approvedAt).getTime() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  let hijriDate = "";
  try {
    hijriDate = (app.approvedAt ? new Date(app.approvedAt) : new Date())
      .toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "long", day: "numeric" });
  } catch { /* ignore */ }

  const irbNumber = app.irbNumber || `IRB-PENDING-${app.id}`;
  const reviewCategory = String(app.irbCategory || "full_board").replace(/_/g, " ");
  const researchType = String(app.researchType || "—").replace(/_/g, " ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IRB Certificate ${escapeHtml(irbNumber)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f3f4f6; }
  body { font-family: "Inter", "Helvetica Neue", -apple-system, "Segoe UI", system-ui, sans-serif; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page {
    width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff;
    padding: 22mm 24mm 26mm; position: relative; overflow: hidden;
  }
  /* Guilloché-style border — subtle, professional. */
  .page::before {
    content: ""; position: absolute; inset: 8mm;
    border: 2px solid #064e3b; border-radius: 4mm;
    box-shadow: inset 0 0 0 1px #d1fae5, inset 0 0 0 4px #fff;
    pointer-events: none;
  }
  .page::after {
    content: ""; position: absolute; inset: 13mm;
    border: 1px solid #064e3b33; border-radius: 2mm;
    pointer-events: none;
  }
  /* Watermark */
  .watermark {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    pointer-events: none; opacity: 0.05; transform: rotate(-22deg);
  }
  .watermark .wm { font-size: 110pt; font-weight: 900; letter-spacing: 6pt; color: #064e3b; }

  header.top { display: flex; align-items: flex-start; gap: 16pt; padding-bottom: 12pt; border-bottom: 1.5pt solid #064e3b; margin-bottom: 18pt; position: relative; z-index: 2; }
  header .logo { width: 64pt; height: 64pt; flex: 0 0 64pt; }
  header .lead h2 { font-size: 9pt; letter-spacing: 1.2pt; color: #064e3b; text-transform: uppercase; margin: 0 0 3pt; font-weight: 700; }
  header .lead h1 { font-size: 14pt; color: #111827; margin: 0 0 2pt; font-weight: 800; line-height: 1.2; }
  header .lead .sub { font-size: 9pt; color: #4b5563; margin-top: 2pt; }
  header .right { margin-left: auto; text-align: right; font-size: 9pt; color: #4b5563; }
  header .right b { color: #064e3b; }

  .title-block { text-align: center; margin: 18pt 0 22pt; position: relative; z-index: 2; }
  .title-block .eyebrow { font-size: 10pt; color: #059669; letter-spacing: 4pt; text-transform: uppercase; font-weight: 600; }
  .title-block h1 { font-size: 30pt; margin: 8pt 0 4pt; color: #064e3b; font-weight: 800; letter-spacing: 0.5pt; }
  .title-block .reg { font-size: 10pt; color: #6b7280; }
  .title-block .reg .num { font-family: "JetBrains Mono", "Menlo", monospace; color: #064e3b; font-weight: 700; font-size: 11pt; padding: 1pt 6pt; background: #ecfdf5; border: 1pt solid #a7f3d0; border-radius: 3pt; margin-left: 6pt; }

  .body { position: relative; z-index: 2; }
  .body .preamble { font-size: 11pt; line-height: 1.6; color: #374151; text-align: center; max-width: 140mm; margin: 0 auto 16pt; }
  .body .study-title { text-align: center; font-size: 13pt; line-height: 1.45; font-weight: 600; color: #111827; padding: 10pt 18pt; background: #f9fafb; border-left: 3pt solid #064e3b; border-right: 3pt solid #064e3b; margin: 12pt auto 18pt; max-width: 150mm; }

  table.facts { width: 100%; border-collapse: collapse; margin: 6pt 0 14pt; font-size: 10pt; }
  table.facts td { padding: 6pt 8pt; vertical-align: top; }
  table.facts td.k { color: #6b7280; width: 30%; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.6pt; padding-right: 14pt; }
  table.facts tr { border-bottom: 1pt dotted #e5e7eb; }
  table.facts tr:last-child { border-bottom: none; }
  table.facts td.v { font-weight: 500; }

  .scores { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin: 12pt 0 16pt; }
  .score { border: 1pt solid #d1fae5; background: linear-gradient(180deg, #f0fdf4 0%, #fff 100%); border-radius: 4pt; padding: 8pt 12pt; }
  .score .lab { font-size: 8.5pt; color: #047857; text-transform: uppercase; letter-spacing: 0.6pt; }
  .score .val { font-size: 22pt; font-weight: 800; color: #064e3b; line-height: 1; margin-top: 4pt; }
  .score .val small { font-size: 11pt; color: #6b7280; font-weight: 500; }

  .signoff { display: grid; grid-template-columns: 1fr auto 1fr; gap: 24pt; margin-top: 22pt; align-items: end; position: relative; z-index: 2; }
  .signoff .sign { text-align: center; }
  .signoff .sign .line { border-top: 1pt solid #111827; padding-top: 4pt; }
  .signoff .sign .name { font-weight: 700; font-size: 10pt; color: #111827; }
  .signoff .sign .role { font-size: 8.5pt; color: #6b7280; margin-top: 2pt; }
  .signoff .sign .scrip { font-size: 14pt; font-style: italic; color: #064e3b; margin-bottom: -2pt; font-family: "Brush Script MT", "Apple Chancery", cursive; }
  .signoff .seal { width: 60pt; height: 60pt; border: 2pt solid #064e3b; border-radius: 999pt; display: flex; align-items: center; justify-content: center; color: #064e3b; font-size: 7.5pt; font-weight: 800; text-align: center; line-height: 1.1; padding: 4pt; transform: rotate(-8deg); background: #fff; box-shadow: 0 0 0 2pt #fff, 0 0 0 3pt #064e3b22; }

  footer.bot { position: absolute; left: 24mm; right: 24mm; bottom: 16mm; border-top: 1pt solid #d1d5db; padding-top: 8pt; display: flex; justify-content: space-between; font-size: 8pt; color: #6b7280; z-index: 2; }
  footer.bot .l { max-width: 65%; }
  footer.bot .r { font-family: "JetBrains Mono", "Menlo", monospace; }
  .verify-block { display: flex; align-items: center; gap: 8pt; margin-top: 4pt; font-size: 8pt; color: #6b7280; }
  .verify-block code { font-family: "JetBrains Mono", "Menlo", monospace; padding: 1pt 4pt; background: #f3f4f6; border-radius: 2pt; color: #064e3b; font-size: 8pt; }
</style>
</head>
<body>
<div class="page">
  <div class="watermark"><span class="wm">APPROVED</span></div>

  <header class="top">
    <div class="logo">${INLINE_LOGO_SVG}</div>
    <div class="lead">
      <h2>National Bioethics Committee · Local IRB</h2>
      <h1>Institutional Review Board</h1>
      <div class="sub">Advanced Healthcare Systems Society — Kingdom of Saudi Arabia</div>
    </div>
    <div class="right">
      <div><b>Date:</b> ${escapeHtml(approvalDate)}</div>
      ${hijriDate ? `<div><b>Hijri:</b> ${escapeHtml(hijriDate)}</div>` : ""}
      <div><b>Valid until:</b> ${escapeHtml(expiryDate)}</div>
    </div>
  </header>

  <section class="title-block">
    <div class="eyebrow">Certificate of Ethical Approval</div>
    <h1>IRB Approval</h1>
    <div class="reg">Registry number <span class="num">${escapeHtml(irbNumber)}</span></div>
  </section>

  <section class="body">
    <p class="preamble">
      This is to certify that the research protocol described below has been reviewed by the
      Institutional Review Board and found to be in compliance with the
      <strong>Declaration of Helsinki (2013)</strong>, <strong>ICH-GCP E6(R2)</strong>, the
      <strong>Belmont Report</strong>, <strong>CIOMS International Ethical Guidelines (2016)</strong>,
      and the <strong>NBCE Implementing Regulations for Research Ethics</strong>. Approval is granted for
      the period of one calendar year from the date of issue.
    </p>

    <div class="study-title">${escapeHtml(app.researchTitle || "(study title)")}</div>

    <table class="facts">
      <tr><td class="k">Principal Investigator</td><td class="v">${escapeHtml(app.principalInvestigator || "—")}</td></tr>
      <tr><td class="k">Institution</td><td class="v">${escapeHtml(app.piInstitution || "—")}</td></tr>
      <tr><td class="k">Department</td><td class="v">${escapeHtml(app.piDepartment || "—")}</td></tr>
      <tr><td class="k">Research Type</td><td class="v" style="text-transform:capitalize">${escapeHtml(researchType)}</td></tr>
      <tr><td class="k">Review Category</td><td class="v" style="text-transform:capitalize">${escapeHtml(reviewCategory)}</td></tr>
      <tr><td class="k">Funding Source</td><td class="v">${escapeHtml(app.fundingSource || "—")}</td></tr>
      <tr><td class="k">Estimated Duration</td><td class="v">${escapeHtml(app.estimatedDuration || "—")}</td></tr>
      <tr><td class="k">Submitted by</td><td class="v">${escapeHtml(applicantName || "—")}${applicantEmail ? ` &lt;${escapeHtml(applicantEmail)}&gt;` : ""}</td></tr>
    </table>

    <div class="scores">
      <div class="score"><div class="lab">AI Compliance · Stage 1</div><div class="val">${app.stage1AiScore ?? "—"}<small>/100</small></div></div>
      <div class="score"><div class="lab">AI Ethics · Stage 2</div><div class="val">${app.stage2AiScore ?? "—"}<small>/100</small></div></div>
    </div>

    <div class="signoff">
      <div class="sign">
        <div class="scrip">A. Aleid</div>
        <div class="line">
          <div class="name">Dr. Abdulsalam Aleid, MBBS, MBA, MIM</div>
          <div class="role">Chairman · Institutional Review Board</div>
        </div>
      </div>
      <div class="seal">NBCE<br>APPROVED<br>${new Date(app.approvedAt ?? Date.now()).getFullYear()}</div>
      <div class="sign">
        <div class="scrip">AHSS</div>
        <div class="line">
          <div class="name">Advanced Healthcare Systems Society</div>
          <div class="role">Issuing Authority · Kingdom of Saudi Arabia</div>
        </div>
      </div>
    </div>
  </section>

  <footer class="bot">
    <div class="l">
      Verify the authenticity of this certificate at the platform's public registry.
      <div class="verify-block">Verify code: <code>${escapeHtml(irbNumber)}</code></div>
    </div>
    <div class="r">Issued ${escapeHtml(new Date().toISOString().slice(0, 19).replace("T", " "))} UTC</div>
  </footer>
</div>
</body>
</html>`;
}

let _browserPromise: Promise<import("playwright").Browser> | null = null;
async function getBrowser() {
  if (!_browserPromise) {
    _browserPromise = chromium.launch({ headless: true });
    // If launch fails, drop the cached promise so we retry next call
    _browserPromise.catch(() => { _browserPromise = null; });
  }
  return _browserPromise;
}

/**
 * Render the certificate to a PDF Buffer using a headless Chromium.
 * The browser is reused across calls (singleton) so we don't pay
 * launch latency on every invocation.
 */
export async function renderCertificatePdf(data: CertData): Promise<Buffer> {
  const html = renderCertificateHtml(data);
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 15000 });
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

/**
 * High-level convenience: render → upload to storage (S3 / forge / local
 * disk) → return the public URL. This replaces the SVG-based pipeline
 * for newly approved applications.
 */
export async function generateAndStoreCertificatePdf(data: CertData): Promise<string> {
  const pdf = await renderCertificatePdf(data);
  const key = `certificates/${(data.app.irbNumber || `app-${data.app.id}`).replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}.pdf`;
  const { url } = await storagePut(key, pdf, "application/pdf");
  return url;
}
