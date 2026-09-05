import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import QRCode from "qrcode";
import type { Application } from "../drizzle/schema";
import { storagePut } from "./storage";
import { PLATFORM } from "@shared/branding";
import { backupCertificateArtifact } from "./services/certificateBackup";

const __dir = dirname(fileURLToPath(import.meta.url));
const escapeHtml = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface CertData {
  app: Application;
  applicantName: string | null;
  applicantEmail: string | null;
  redactForPublic?: boolean;
}

export const CERTIFICATE_ELIGIBLE_STATUSES = ["approved", "rejected", "retracted", "permanently_rejected"] as const;
export function isCertificateEligibleStatus(status: string | null | undefined): boolean {
  return (CERTIFICATE_ELIGIBLE_STATUSES as readonly string[]).includes(String(status ?? ""));
}

function verifyBaseUrl(): string {
  const configured = process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("A canonical PUBLIC_SITE_URL is required for certificate verification");
  const url = new URL(configured || "http://localhost:3000");
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Invalid certificate verification origin");
  }
  return url.origin;
}

function certificateRecord(data: CertData) {
  const { app, redactForPublic } = data;
  if (!isCertificateEligibleStatus(app.status)) throw new Error("A recorded final decision is required before generating a decision document");
  if (!Number.isSafeInteger(app.humanDecisionByUserId) || (app.humanDecisionByUserId ?? 0) <= 0 ||
      !app.humanDecisionAt || !Number.isFinite(new Date(app.humanDecisionAt).getTime())) {
    throw new Error("Verified human decision provenance is required; legacy automated approvals need committee review");
  }
  const rejected = app.status === "rejected" || app.status === "permanently_rejected";
  const retracted = app.status === "retracted";
  const approvedAt = app.approvedAt ? new Date(app.approvedAt) : null;
  if (!rejected && (!app.irbNumber || !approvedAt || !Number.isFinite(approvedAt.getTime()))) {
    throw new Error("Approval number and recorded approval date are required");
  }
  const number = app.irbNumber || `APPLICATION-${app.id}`;
  const date = approvedAt && Number.isFinite(approvedAt.getTime()) ? approvedAt.toISOString().replace("T", " ").replace(".000Z", " UTC") : "Not applicable — no approval recorded";
  const status = retracted ? "RETRACTED" : rejected ? "REJECTED" : "APPROVED";
  const reason = redactForPublic ? "" : retracted ? app.retractionReason : rejected ? app.rejectionReason : "";
  return {
    number, date, status, reason,
    title: retracted ? "Retraction notice" : rejected ? "Decision notice — rejection" : "Research ethics decision record",
    statusLabel: retracted ? "[ Retracted ] · سحب · RETRACTED" : rejected ? "[ Rejected ] · رفض · REJECTED" : "APPROVED · موافقة مسجّلة",
    standing: retracted ? "Retracted · Inactive" : rejected ? "Rejected · No approval" : "Approved — verify current conditions",
    notice: retracted ? "The previously recorded approval has been withdrawn. This notice does not authorize research activity."
      : rejected ? "The application was rejected. No authorization to conduct the proposed research is conferred by this document."
      : "The platform records an approval decision for the protocol identified above. Conduct is subject to the authorized committee's conditions and applicable local requirements.",
    validity: "No expiry date is inferred by this platform. Confirm the approved duration, renewal requirements, and decision conditions in the authorized committee record.",
    verifyUrl: `${verifyBaseUrl()}/verify/${encodeURIComponent(number)}`,
  };
}

function qrSvg(url: string): string {
  // Failure is explicit: a decorative image must never masquerade as a QR code.
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  let path = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (qr.modules.data[y * size + x]) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="#174d39"/></svg>`;
}

export function renderCertificateHtml(data: CertData): string {
  const record = certificateRecord(data);
  const app = data.app;
  const rows = data.redactForPublic ? [] : [
    ["Department", app.piDepartment], ["Funding source", app.fundingSource],
    ["Applicant", data.applicantName], ["Applicant email", data.applicantEmail],
    ["AI Stage 1 (advisory)", app.stage1AiScore], ["AI Stage 2 (advisory)", app.stage2AiScore],
  ];
  const replacements: Record<string, string> = {
    DOCUMENT_TITLE: escapeHtml(record.title), PLATFORM_NAME: escapeHtml(PLATFORM.nameEn),
    IRB_NUMBER: escapeHtml(record.number), STATUS_COLOR: record.status === "APPROVED" ? "#174d39" : "#991b1b",
    STATUS_LABEL: escapeHtml(record.statusLabel), RESEARCH_TITLE: escapeHtml(app.researchTitle || "Not provided"),
    PRINCIPAL_INVESTIGATOR: escapeHtml(app.principalInvestigator || "Not provided"),
    INSTITUTION: escapeHtml(app.piInstitution || "Not provided"),
    INTERNAL_ROWS: rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value ?? "Not available")}</td></tr>`).join(""),
    RESEARCH_TYPE: escapeHtml(app.researchType?.replace(/_/g, " ") || "Not provided"),
    REVIEW_CATEGORY: escapeHtml(app.irbCategory?.replace(/_/g, " ") || "Not provided"),
    APPROVAL_DATE: escapeHtml(record.date), STANDING: escapeHtml(record.standing),
    DECISION_NOTICE: escapeHtml(record.notice), VALIDITY_NOTICE: escapeHtml(record.validity),
    REASON: record.reason ? `<p>${escapeHtml(record.reason)}</p>` : "",
    QR_SVG: qrSvg(record.verifyUrl), VERIFY_URL: escapeHtml(record.verifyUrl),
    GENERATED_AT: escapeHtml(new Date().toISOString().slice(0, 19).replace("T", " ")),
  };
  // Single pass: applicant text that resembles another template token stays data.
  return readFileSync(join(__dir, "templates", "certificate.html"), "utf8")
    .replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
      if (!(key in replacements)) throw new Error(`Unknown certificate template token: ${key}`);
      return replacements[key];
    });
}

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).then(browser => {
      browser.once("disconnected", () => { browserPromise = null; });
      return browser;
    });
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

export async function renderCertificatePdf(data: CertData): Promise<Buffer> {
  const html = renderCertificateHtml(data);
  const { pdfSemaphore } = await import("./_core/concurrency");
  return pdfSemaphore.run(async () => {
    const browser = await getBrowser();
    const ctx = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
    const timeout = setTimeout(() => { void ctx.close().catch(() => undefined); }, 20000);
    try {
      await ctx.route("**/*", route => route.abort());
      const page = await ctx.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 15000 });
      return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
    } finally { clearTimeout(timeout); await ctx.close().catch(() => undefined); }
  });
}

export type CertificateArtifact = { buffer: Buffer; contentType: string; extension: "pdf" | "html" };
export async function renderCertificateArtifact(data: CertData): Promise<CertificateArtifact> {
  // Validate before fallback: invalid decisions are never rendered as approved.
  certificateRecord(data);
  try {
    return { buffer: await renderCertificatePdf(data), contentType: "application/pdf", extension: "pdf" };
  } catch {
    console.warn("[Certificate] PDF renderer unavailable; returning explicitly typed printable HTML");
    return { buffer: Buffer.from(renderCertificateHtml(data), "utf8"), contentType: "text/html; charset=utf-8", extension: "html" };
  }
}

export async function generateAndStoreCertificatePdf(data: CertData): Promise<string> {
  const artifact = await renderCertificateArtifact({ ...data, redactForPublic: true });
  const key = `certificates/${(data.app.irbNumber || `app-${data.app.id}`).replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}.${artifact.extension}`;
  const { url } = await storagePut(key, artifact.buffer, artifact.contentType);
  await backupCertificateArtifact(key, artifact.buffer, artifact.contentType).catch(() => {
    console.warn("[Certificate] backup copy failed; stored primary artifact retained");
  });
  return url;
}

export async function renderCertificateDocx(data: CertData): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const record = certificateRecord(data);
  const entries: Array<[string, unknown]> = [
    ["Standing", record.standing], ["IRB number / record", record.number],
    ["Research title", data.app.researchTitle], ["Principal investigator", data.app.principalInvestigator],
    ["Institution", data.app.piInstitution], ["Study type", data.app.researchType],
    ["Review category", data.app.irbCategory], ["Recorded approval date", record.date],
    ...(!data.redactForPublic ? [["Applicant", data.applicantName], ["Applicant email", data.applicantEmail], ["Department", data.app.piDepartment], ["Funding source", data.app.fundingSource]] as Array<[string, unknown]> : []),
  ];
  const doc = new Document({ creator: PLATFORM.nameEn, title: record.title, sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, text: `${PLATFORM.nameEn} — ${record.title}` }),
    new Paragraph({ children: [new TextRun({ text: record.statusLabel, bold: true })] }),
    ...entries.map(([key, value]) => new Paragraph(`${key}: ${value ?? "Not available"}`)),
    new Paragraph(record.notice), ...(record.reason ? [new Paragraph(record.reason)] : []),
    new Paragraph(record.validity), new Paragraph(`Verify current standing: ${record.verifyUrl}`),
    new Paragraph("AI analyses are advisory. This is a platform decision record, not a handwritten or cryptographic signature or a claim of government accreditation."),
  ] }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
