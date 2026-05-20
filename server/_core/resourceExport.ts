/**
 * Resource export — renders a structured ResourceItem (from shared/resources.ts)
 * to either a PDF (via the existing Chromium pipeline used for certificates)
 * or a DOCX (via the `docx` package). Both formats are bilingual (EN/AR).
 *
 * Wired into /api/export/resource/:slug.:format in exportRoutes.ts. Items
 * are static and content-addressable by slug — no auth required, but
 * the route stays inside the general rate-limit bucket.
 */

import {
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
} from "docx";
import type { ResourceItem } from "@shared/resources";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a ResourceItem to a print-friendly HTML page. The Chromium PDF
 * pipeline picks this up as inline content (no external network — see
 * SA-37 isolation). Layout is intentionally simple so it converts cleanly
 * via Chromium's print engine.
 */
export function renderResourceHtml(item: ResourceItem): string {
  const sections = item.sections
    .map(
      s => `
      <section>
        <h2>${escapeHtml(s.headingEn)} <span class="ar">${escapeHtml(s.headingAr)}</span></h2>
        <div class="body">
          <p class="en">${escapeHtml(s.bodyEn).replace(/\n/g, "<br/>")}</p>
          <p class="ar" dir="rtl" lang="ar">${escapeHtml(s.bodyAr).replace(/\n/g, "<br/>")}</p>
        </div>
      </section>
    `,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${escapeHtml(item.titleEn)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, "Segoe UI", "Noto Sans", "Tahoma", Arial, sans-serif; color: #111; line-height: 1.5; font-size: 11pt; }
  header { border-bottom: 2px solid #0a7c4a; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 22pt; margin: 0 0 4px; color: #0a7c4a; }
  h1 .ar { display: block; font-size: 16pt; color: #444; margin-top: 4px; }
  .desc { color: #555; font-size: 10pt; }
  .desc .ar { display: block; margin-top: 2px; }
  section { margin: 16px 0; }
  h2 { font-size: 12pt; margin: 18px 0 6px; color: #0a7c4a; }
  h2 .ar { color: #444; font-weight: 600; margin-inline-start: 12px; }
  .body p { margin: 0 0 6px; }
  .ar { direction: rtl; text-align: right; font-family: "Tahoma", "Geeza Pro", Arial, sans-serif; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; color: #888; font-size: 9pt; text-align: center; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(item.titleEn)}<span class="ar" dir="rtl">${escapeHtml(item.titleAr)}</span></h1>
    <div class="desc">${escapeHtml(item.descEn)}<span class="ar" dir="rtl">${escapeHtml(item.descAr)}</span></div>
  </header>
  <main>${sections}</main>
  <footer>
    IRB Ultimate — National Bioethics Committee aligned · ${new Date().toISOString().slice(0, 10)}
  </footer>
</body></html>`;
}

/**
 * Render a ResourceItem to a DOCX Buffer using the `docx` library.
 * Bilingual layout: each section emits an EN paragraph followed by an
 * AR paragraph with bidi text and Arabic font hint.
 */
export async function renderResourceDocx(item: ResourceItem): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Title block
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: item.titleEn, bold: true })],
    }),
    new Paragraph({
      bidirectional: true,
      children: [new TextRun({ text: item.titleAr, bold: true, font: "Tahoma" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: item.descEn, italics: true, color: "555555" })],
    }),
    new Paragraph({
      bidirectional: true,
      children: [
        new TextRun({ text: item.descAr, italics: true, color: "555555", font: "Tahoma" }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: "" })] }), // spacer
  );

  for (const s of item.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: s.headingEn, bold: true, color: "0a7c4a" })],
      }),
      new Paragraph({
        bidirectional: true,
        children: [
          new TextRun({ text: s.headingAr, bold: true, color: "555555", font: "Tahoma" }),
        ],
      }),
    );
    for (const line of s.bodyEn.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line })] }));
    }
    for (const line of s.bodyAr.split("\n")) {
      children.push(
        new Paragraph({
          bidirectional: true,
          children: [new TextRun({ text: line, font: "Tahoma" })],
        }),
      );
    }
    children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  }

  // Footer note
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `IRB Ultimate — National Bioethics Committee aligned · ${new Date()
            .toISOString()
            .slice(0, 10)}`,
          italics: true,
          color: "888888",
          size: 18,
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "IRB Ultimate",
    title: item.titleEn,
    description: item.descEn,
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
          },
        },
        children,
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}
