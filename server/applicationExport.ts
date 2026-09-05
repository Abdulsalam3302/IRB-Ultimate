// Application export — renders the full IRB application (Stage 1 +
// Stage 2 + authors + audit log + AI scores) as a printable HTML
// document. The applicant downloads this and includes it as an
// attachment to a grant proposal or institutional submission.
//
// Inspector ZIP — bundles the printable HTML + the certificate (when
// approved) + the audit log (CSV) + a manifest with SHA-256 hashes
// into a single ZIP. Used for NCBE inspections.

import archiver from "archiver";
import { createHash } from "node:crypto";
import { PassThrough } from "node:stream";
import type { Application } from "../drizzle/schema";

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: any, opts: { wide?: boolean } = {}): string {
  const v = value === null || value === undefined || value === "" ? "—" : escapeHtml(String(value));
  return `<tr${opts.wide ? ' class="wide"' : ""}>
    <td class="lab">${escapeHtml(label)}</td>
    <td class="val">${v.replace(/\n/g, "<br>")}</td>
  </tr>`;
}

interface ExportData {
  app: Application;
  authors: Array<{ name: string; email: string; institution?: string | null; department?: string | null; country?: string | null }>;
  audit: Array<{ action: string; details: string | null; createdAt: Date }>;
  applicantName?: string | null;
  applicantEmail?: string | null;
}

export function renderApplicationHtml(data: ExportData): string {
  const { app, authors, audit, applicantName, applicantEmail } = data;
  const stage1Score = app.stage1AiScore ?? null;
  const stage2Score = app.stage2AiScore ?? null;
  const status = String(app.status || "—");
  const created = app.createdAt ? new Date(app.createdAt).toLocaleString("en-US") : "—";
  const submitted = app.submittedAt ? new Date(app.submittedAt).toLocaleString("en-US") : "—";
  const approved = app.approvedAt ? new Date(app.approvedAt).toLocaleString("en-US") : "—";

  const authorRows = authors.length === 0
    ? `<tr><td colspan="2" class="empty">No co-authors registered.</td></tr>`
    : authors
        .map(
          (a, i) => `<tr>
            <td class="lab">Author ${i + 1}</td>
            <td class="val">${escapeHtml(a.name)} &lt;${escapeHtml(a.email)}&gt;
              ${a.institution ? `<br><span class="dim">${escapeHtml(a.institution)}${a.department ? ` · ${escapeHtml(a.department)}` : ""}${a.country ? ` · ${escapeHtml(a.country)}` : ""}</span>` : ""}
            </td>
          </tr>`
        )
        .join("");

  const auditRows = audit.length === 0
    ? `<tr><td colspan="3" class="empty">No audit entries.</td></tr>`
    : audit
        .slice(0, 100)
        .map(
          a => `<tr>
            <td class="dim">${escapeHtml(new Date(a.createdAt).toLocaleString("en-US"))}</td>
            <td><strong>${escapeHtml(a.action)}</strong></td>
            <td class="val">${escapeHtml(a.details || "")}</td>
          </tr>`
        )
        .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IRB Application ${escapeHtml(app.irbNumber || `#${app.id}`)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  body { font: 11pt/1.45 -apple-system, "Segoe UI", system-ui, sans-serif; color: #111; max-width: 760px; margin: 0 auto; }
  header { border-bottom: 2px solid #064e3b; padding-bottom: 10px; margin-bottom: 16px; }
  header h1 { font-size: 18pt; margin: 0; color: #064e3b; }
  header .sub { font-size: 9pt; color: #4b5563; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; font-size: 10pt; margin-bottom: 14px; }
  .meta div { padding: 4px 0; }
  .meta b { color: #064e3b; margin-right: 6px; }
  h2 { font-size: 12pt; color: #064e3b; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin: 18px 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10pt; }
  table.audit td { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  td.lab { width: 32%; padding: 6px 8px 6px 0; color: #4b5563; vertical-align: top; }
  td.val { padding: 6px 0; vertical-align: top; }
  td.dim { color: #6b7280; font-size: 9pt; white-space: nowrap; }
  td.empty { color: #9ca3af; padding: 8px 0; font-style: italic; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9pt; font-weight: 600; }
  .badge.ok { background: #d1fae5; color: #065f46; }
  .badge.warn { background: #fef3c7; color: #92400e; }
  .badge.bad { background: #fee2e2; color: #991b1b; }
  .scores { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0 16px; }
  .score-card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 14px; }
  .score-card .label { font-size: 9pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .score-card .num { font-size: 22pt; font-weight: 700; line-height: 1; margin-top: 4px; }
  .num.ok { color: #059669; }
  .num.warn { color: #d97706; }
  .num.bad { color: #dc2626; }
  footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #6b7280; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>IRB Research Application</h1>
  <div class="sub">IRB Saudi Arabia · Research ethics application record</div>
</header>

<div class="meta">
  <div><b>IRB Number:</b> ${escapeHtml(app.irbNumber || "(pending)")}</div>
  <div><b>Status:</b> <span class="badge ${status === "approved" ? "ok" : status.includes("reject") ? "bad" : "warn"}">${escapeHtml(status.replace(/_/g, " "))}</span></div>
  <div><b>Application ID:</b> #${app.id}</div>
  <div><b>Submission #:</b> ${app.submissionCount}</div>
  <div><b>Created:</b> ${escapeHtml(created)}</div>
  <div><b>Submitted:</b> ${escapeHtml(submitted)}</div>
  <div><b>Approved:</b> ${escapeHtml(approved)}</div>
  <div><b>Applicant:</b> ${escapeHtml(applicantName || "—")} ${applicantEmail ? `&lt;${escapeHtml(applicantEmail)}&gt;` : ""}</div>
</div>

${stage1Score !== null || stage2Score !== null ? `
<div class="scores">
  <div class="score-card">
    <div class="label">AI Compliance — Stage 1 (Gateway)</div>
    <div class="num ${stage1Score == null ? "" : stage1Score >= 80 ? "ok" : stage1Score >= 60 ? "warn" : "bad"}">${stage1Score ?? "—"}<span style="font-size:14pt;color:#6b7280">/100</span></div>
  </div>
  <div class="score-card">
    <div class="label">AI Ethics — Stage 2 (Detailed)</div>
    <div class="num ${stage2Score == null ? "" : stage2Score >= 80 ? "ok" : stage2Score >= 60 ? "warn" : "bad"}">${stage2Score ?? "—"}<span style="font-size:14pt;color:#6b7280">/100</span></div>
  </div>
</div>
` : ""}

<h2>Stage 1 — Classification &amp; Investigators</h2>
<table>
  ${row("Research Title", app.researchTitle, { wide: true })}
  ${row("Research Type", String(app.researchType || "").replace(/_/g, " "))}
  ${row("Review Category", String(app.irbCategory || "").replace(/_/g, " "))}
  ${row("Principal Investigator", app.principalInvestigator)}
  ${row("PI Email", app.piEmail)}
  ${row("Institution", app.piInstitution)}
  ${row("Department", app.piDepartment)}
  ${row("Funding Source", app.fundingSource)}
  ${row("Estimated Duration", app.estimatedDuration)}
</table>

<h2>Co-Investigators &amp; Authors</h2>
<table>${authorRows}</table>

<h2>Stage 2 — Detailed Ethics &amp; Methodology</h2>
<table>
  ${row("Research Objectives", app.researchObjectives, { wide: true })}
  ${row("Methodology", app.methodology, { wide: true })}
  ${row("Sample Size", app.sampleSize, { wide: true })}
  ${row("Target Population", app.targetPopulation, { wide: true })}
  ${row("Inclusion Criteria", app.inclusionCriteria, { wide: true })}
  ${row("Exclusion Criteria", app.exclusionCriteria, { wide: true })}
  ${row("Data Collection Methods", app.dataCollectionMethods, { wide: true })}
  ${row("Informed Consent Process", app.informedConsentProcess, { wide: true })}
  ${row("Risk Assessment", app.riskAssessment, { wide: true })}
  ${row("Benefit Assessment", app.benefitAssessment, { wide: true })}
  ${row("Confidentiality Measures", app.confidentialityMeasures, { wide: true })}
  ${row("Conflict of Interest", app.conflictOfInterest, { wide: true })}
</table>

<h2>Audit Trail (most recent 100 events)</h2>
<table class="audit">
  <thead>
    <tr><th align="left">Timestamp</th><th align="left">Action</th><th align="left">Details</th></tr>
  </thead>
  <tbody>${auditRows}</tbody>
</table>

<footer>
  Generated ${escapeHtml(new Date().toLocaleString("en-US"))} by IRB Ultimate ·
  Verify any IRB number at the platform's public registry · Document is human-readable;
  print to PDF via your browser for an archival copy.
</footer>
</body>
</html>`;
}

/**
 * Build the inspector ZIP. Streamed; the caller pipes the returned
 * stream straight to the HTTP response without buffering the whole
 * archive in memory.
 */
export function buildInspectorZip(data: ExportData): { stream: PassThrough; filename: string } {
  const html = renderApplicationHtml(data);
  // Spreadsheet applications execute formula-like CSV cells, even when quoted.
  const csvCell = (value: string) => `"${(/^[\s]*[=+@\-\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '\"\"')}"`;
  const auditCsv = [
    "timestamp,action,details",
    ...data.audit.map(a => {
      const ts = new Date(a.createdAt).toISOString();
      return [ts, a.action, a.details || ""].map(csvCell).join(",");
    }),
  ].join("\n");

  // Checksums detect accidental changes; without an external signed digest
  // they do not prove authenticity or protect against intentional replacement.
  const hash = (buf: Buffer | string) =>
    createHash("sha256").update(typeof buf === "string" ? Buffer.from(buf, "utf8") : buf).digest("hex");
  const manifest = JSON.stringify(
    {
      bundle: "irb-inspector-export-v1",
      generatedAt: new Date().toISOString(),
      application: {
        id: data.app.id,
        irbNumber: data.app.irbNumber,
        status: data.app.status,
        submissionCount: data.app.submissionCount,
      },
      contents: [
        { path: "application.html", sha256: hash(html), bytes: Buffer.byteLength(html) },
        { path: "audit-log.csv", sha256: hash(auditCsv), bytes: Buffer.byteLength(auditCsv) },
      ],
    },
    null,
    2
  );

  const archive = archiver("zip", { zlib: { level: 6 } });
  const stream = new PassThrough();
  archive.pipe(stream);
  archive.on("error", err => stream.destroy(err));
  stream.on("close", () => { if (!stream.readableEnded) archive.abort(); });

  archive.append(html, { name: "application.html" });
  archive.append(auditCsv, { name: "audit-log.csv" });
  archive.append(manifest, { name: "manifest.json" });
  // README so downstream consumers understand what they're looking at
  archive.append(
    `IRB Ultimate — Inspector Export
================================

This archive contains a checksum-indexed snapshot of an IRB application.
The embedded manifest is not an independent signature or authenticity proof.
Regulatory acceptance requires the responsible institution's review.

Files
  application.html  Full Stage 1 + Stage 2 + authors + audit-trail HTML
  audit-log.csv     Machine-readable audit events
  manifest.json     SHA-256 hashes of every file in this archive

Verification
  sha256sum application.html audit-log.csv
  …compare against manifest.json:contents[].sha256
`,
    { name: "README.txt" }
  );

  const filename = `irb-${(data.app.irbNumber || `app-${data.app.id}`).replace(/[^a-zA-Z0-9_-]/g, "-")}-inspector.zip`;
  void archive.finalize().catch(err => stream.destroy(err));
  return { stream, filename };
}
