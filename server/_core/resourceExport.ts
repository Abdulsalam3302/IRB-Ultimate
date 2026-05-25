/**
 * Resource export — official EN or AR templates (PDF via Chromium, DOCX via docx).
 */

import {
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
  BorderStyle,
} from "docx";
import type { ResourceItem } from "@shared/resources";
import { getTemplateSections, type TemplateField, type TemplateSection } from "@shared/templateFields";
import { BRAND, STAMPED_TICK_SVG, AUTHOR, PLATFORM } from "@shared/branding";

export type ExportLang = "en" | "ar";
export type ExportMode = "blank" | "filled" | "generated";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blankLinesHtml(count: number, lang: ExportLang): string {
  return Array.from({ length: count }, () =>
    lang === "ar"
      ? `<div class="blank-line" dir="rtl">_______________________________________________</div>`
      : `<div class="blank-line">_______________________________________________</div>`,
  ).join("");
}

function renderFieldHtml(
  field: TemplateField,
  lang: ExportLang,
  mode: ExportMode,
  prefill?: Record<string, string>,
): string {
  const isAr = lang === "ar";
  const label = isAr ? field.labelAr : field.labelEn;
  const hint = isAr ? field.hintAr : field.hintEn;
  const example = isAr ? field.exampleAr : field.exampleEn;
  const filled = prefill?.[field.id]?.trim();
  const dir = isAr ? 'dir="rtl" lang="ar"' : 'lang="en"';
  const isGenerated = mode === "generated";

  let valueBlock: string;
  if ((mode === "filled" || isGenerated) && filled) {
    valueBlock = `<div class="filled-value" ${dir}>${escapeHtml(filled).replace(/\n/g, "<br/>")}</div>`;
  } else if (isGenerated) {
    valueBlock = `<div class="filled-value empty" ${dir}><em>${isAr ? "— لم يُذكر —" : "— not provided —"}</em></div>`;
  } else {
    valueBlock = blankLinesHtml(field.blankLines ?? 2, lang);
  }

  const hintBlock = isGenerated
    ? ""
    : `<div class="field-hint"><strong>${isAr ? "↳ أدخل:" : "↳ Enter:"}</strong> ${escapeHtml(hint)}</div>
      <div class="field-example"><strong>${isAr ? "★ مثال مثالي:" : "★ Ideal example:"}</strong> ${escapeHtml(example).replace(/\n/g, "<br/>")}</div>`;

  return `
    <div class="field-block" ${dir}>
      <div class="field-label">${escapeHtml(label)}</div>
      ${hintBlock}
      <div class="field-input">${valueBlock}</div>
    </div>`;
}

function renderSectionHtml(
  section: TemplateSection,
  lang: ExportLang,
  mode: ExportMode,
  prefill?: Record<string, string>,
): string {
  const isAr = lang === "ar";
  const heading = isAr ? section.headingAr : section.headingEn;
  const dir = isAr ? 'dir="rtl" lang="ar"' : 'lang="en"';
  const fields = section.fields.map(f => renderFieldHtml(f, lang, mode, prefill)).join("");
  return `<section class="doc-section" ${dir}><h2>${escapeHtml(heading)}</h2>${fields}</section>`;
}

function authorStampHtml(lang: ExportLang): string {
  const isAr = lang === "ar";
  const dir = isAr ? 'dir="rtl" lang="ar"' : 'lang="en"';
  return `<div class="author-stamp" ${dir}>
    ${STAMPED_TICK_SVG}
    <div>
      <div class="name">${isAr ? AUTHOR.nameAr : AUTHOR.nameEn}</div>
      <div class="role">${isAr ? AUTHOR.titleAr : AUTHOR.titleEn}</div>
      <div class="role">${isAr ? AUTHOR.orgAr : AUTHOR.orgEn}</div>
      <div class="role" style="margin-top:8px;font-style:italic">
        ${isAr ? "توقيع معتمد · ختم المنصة" : "Authorized signature · Platform seal"}
      </div>
    </div>
  </div>`;
}

function footerHtml(lang: ExportLang, dateStr: string): string {
  const isAr = lang === "ar";
  return `<footer>
    ${isAr ? `${PLATFORM.nameAr} — منصة AHSS مستقلة · PDPL · إرشادات NBCE` : `${PLATFORM.nameEn} — Independent AHSS platform · PDPL · NBCE guidelines`} · ${dateStr}<br/>
    © ${isAr ? AUTHOR.nameAr : AUTHOR.nameEn} · AHSS · ${isAr ? "المملكة العربية السعودية" : "Kingdom of Saudi Arabia"}
  </footer>`;
}

function officialStyles(lang: ExportLang): string {
  const isAr = lang === "ar";
  const bodyFont = isAr
    ? '"Traditional Arabic", "Geeza Pro", Tahoma, Arial, sans-serif'
    : '"Times New Roman", Times, serif';
  const bodySize = isAr ? "14pt" : "12pt";

  return `
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: ${bodyFont}; font-size: ${bodySize}; color: #111; line-height: 1.55; margin: 0;
    ${isAr ? "direction: rtl; text-align: right;" : "direction: ltr; text-align: left;"}}
  .official-header { border-bottom: 3px double ${BRAND.forest}; padding-bottom: 14px; margin-bottom: 22px;
    display: flex; align-items: center; gap: 16px; ${isAr ? "flex-direction: row-reverse;" : ""}}
  .official-header svg { width: 52px; height: 52px; flex-shrink: 0; }
  .official-header .titles h1 { font-size: ${isAr ? "18pt" : "16pt"}; color: ${BRAND.forest}; margin: 0 0 4px; }
  .official-header .titles .subtitle { font-size: 10pt; color: #555; }
  .official-header .meta { margin-${isAr ? "right" : "left"}: auto; font-size: 9pt; color: #666;
    text-align: ${isAr ? "left" : "right"}; }
  .doc-section { margin: 20px 0; page-break-inside: avoid; }
  .doc-section h2 { font-size: ${isAr ? "16pt" : "14pt"}; color: ${BRAND.forest};
    border-bottom: 1.5px solid ${BRAND.jade}; padding-bottom: 4px; margin: 0 0 12px; }
  .field-block { border: 1px solid #d4d4d8; border-${isAr ? "right" : "left"}: 4px solid ${BRAND.jade};
    padding: 10px 12px; margin: 10px 0; background: #fafafa; page-break-inside: avoid; }
  .field-label { font-weight: 700; margin-bottom: 6px; color: ${BRAND.forest}; }
  .field-hint { font-size: 10pt; color: #444; margin-bottom: 4px; }
  .field-example { font-size: 10pt; color: #065f46; background: #ecfdf5; border: 1px dashed ${BRAND.jade};
    padding: 6px 8px; margin: 6px 0; border-radius: 4px; }
  .blank-line { border-bottom: 1px solid #999; min-height: 1.6em; margin: 6px 0; }
  .filled-value { background: #fff; border: 1px solid ${BRAND.forest}; padding: 8px 10px; white-space: pre-wrap; }
  .filled-value.empty { color: #888; font-style: italic; }
  .author-stamp {
    margin-top: 32px; padding: 16px; border: 2px solid ${BRAND.forest};
    display: flex; align-items: center; gap: 16px; page-break-inside: avoid;
    ${isAr ? "flex-direction: row-reverse; direction: rtl;" : ""}
  }
  .author-stamp svg { width: 48px; height: 48px; flex-shrink: 0; }
  .author-stamp .name { font-weight: 700; color: ${BRAND.forest}; font-size: ${isAr ? "13pt" : "12pt"}; }
  .author-stamp .role { font-size: 10pt; color: #444; margin-top: 2px; }
  footer { margin-top: 20px; padding-top: 10px; border-top: 2px solid ${BRAND.forest}; font-size: 9pt;
    color: #666; text-align: center; }`;
}

export type RenderResourceOptions = {
  item: ResourceItem;
  lang: ExportLang;
  mode?: ExportMode;
  prefill?: Record<string, string>;
};

export function renderResourceHtml(opts: RenderResourceOptions): string {
  const { item, lang, mode = "blank", prefill } = opts;
  const isAr = lang === "ar";
  const title = isAr ? item.titleAr : item.titleEn;
  const desc = isAr ? item.descAr : item.descEn;
  const dir = isAr ? 'dir="rtl" lang="ar"' : 'lang="en"';
  const dateStr = new Date().toISOString().slice(0, 10);
  const modeLabel =
    mode === "generated"
      ? isAr
        ? "نسخة مُولَّدة من إجاباتك"
        : "Generated from your answers"
      : mode === "filled"
        ? isAr
          ? "نسخة مُعبَّأة من بيانات الطلب"
          : "Pre-filled from application data"
        : isAr
          ? "نموذج فارغ للتعبئة اليدوية"
          : "Blank template for manual completion";

  const sections = getTemplateSections(item.slug);
  let mainContent: string;

  if (sections?.length) {
    mainContent = sections.map(s => renderSectionHtml(s, lang, mode, prefill)).join("");
  } else {
    mainContent = item.sections
      .map(s => {
        const heading = isAr ? s.headingAr : s.headingEn;
        const body = isAr ? s.bodyAr : s.bodyEn;
        return `<section class="doc-section" ${dir}><h2>${escapeHtml(heading)}</h2>
          <p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p></section>`;
      })
      .join("");
  }

  return `<!doctype html>
<html ${dir}><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>${officialStyles(lang)}</style></head><body>
<div class="official-header">${STAMPED_TICK_SVG}
  <div class="titles"><h1>${escapeHtml(title)}</h1><div class="subtitle">${escapeHtml(desc)}</div></div>
  <div class="meta">${isAr ? "اللغة: العربية" : "Language: English"}<br/>${escapeHtml(modeLabel)}<br/>${dateStr}</div>
</div><main>${mainContent}</main>
${authorStampHtml(lang)}
${footerHtml(lang, dateStr)}
</body></html>`;
}

function fieldParagraphs(
  field: TemplateField,
  lang: ExportLang,
  mode: ExportMode,
  prefill?: Record<string, string>,
): Paragraph[] {
  const isAr = lang === "ar";
  const label = isAr ? field.labelAr : field.labelEn;
  const hint = isAr ? field.hintAr : field.hintEn;
  const example = isAr ? field.exampleAr : field.exampleEn;
  const filled = prefill?.[field.id]?.trim();
  const font = isAr ? "Traditional Arabic" : "Times New Roman";
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      bidirectional: isAr,
      children: [new TextRun({ text: label, bold: true, color: "064e3b", font, size: isAr ? 28 : 24 })],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({ text: isAr ? "↳ أدخل: " : "↳ Enter: ", bold: true, font, size: 20 }),
        new TextRun({ text: hint, font, size: 20, color: "444444" }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({ text: isAr ? "★ مثال: " : "★ Example: ", bold: true, font, size: 20, color: "059669" }),
        new TextRun({ text: example, font, size: 20, color: "065f46", italics: true }),
      ],
    }),
  );

  if (mode === "filled" && filled) {
    for (const line of filled.split("\n")) {
      out.push(
        new Paragraph({
          bidirectional: isAr,
          children: [new TextRun({ text: line, font, size: isAr ? 28 : 24 })],
        }),
      );
    }
  } else if (mode === "generated") {
    const text = filled || (isAr ? "— لم يُذكر —" : "— not provided —");
    for (const line of text.split("\n")) {
      out.push(
        new Paragraph({
          bidirectional: isAr,
          children: [new TextRun({ text: line, font, size: isAr ? 28 : 24 })],
        }),
      );
    }
  } else {
    for (let i = 0; i < (field.blankLines ?? 2); i++) {
      out.push(
        new Paragraph({
          bidirectional: isAr,
          children: [
            new TextRun({
              text: "_______________________________________________",
              font,
              size: 22,
              color: "999999",
            }),
          ],
        }),
      );
    }
  }
  out.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  return out;
}

export async function renderResourceDocx(opts: RenderResourceOptions): Promise<Buffer> {
  const { item, lang, mode = "blank", prefill } = opts;
  const isAr = lang === "ar";
  const title = isAr ? item.titleAr : item.titleEn;
  const desc = isAr ? item.descAr : item.descEn;
  const font = isAr ? "Traditional Arabic" : "Times New Roman";
  const children: Paragraph[] = [
    new Paragraph({
      bidirectional: isAr,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true, font, size: 36, color: "064e3b" })],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [new TextRun({ text: desc, italics: true, font, size: 22, color: "555555" })],
    }),
    new Paragraph({ children: [new TextRun({ text: "" })] }),
  ];

  const sections = getTemplateSections(item.slug);
  if (sections?.length) {
    for (const s of sections) {
      const heading = isAr ? s.headingAr : s.headingEn;
      children.push(
        new Paragraph({
          bidirectional: isAr,
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: heading, bold: true, font, color: "064e3b", size: 28 })],
          border: { bottom: { color: "10b981", size: 6, style: BorderStyle.SINGLE } },
        }),
      );
      for (const f of s.fields) {
        if (mode === "generated") {
          children.push(
            new Paragraph({
              bidirectional: isAr,
              children: [new TextRun({ text: isAr ? f.labelAr : f.labelEn, bold: true, font, color: "064e3b" })],
            }),
          );
          const val = prefill?.[f.id]?.trim() || (isAr ? "— لم يُذكر —" : "— not provided —");
          for (const line of val.split("\n")) {
            children.push(
              new Paragraph({
                bidirectional: isAr,
                children: [new TextRun({ text: line, font, size: isAr ? 28 : 24 })],
              }),
            );
          }
          children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
        } else {
          children.push(...fieldParagraphs(f, lang, mode, prefill));
        }
      }
    }
  } else {
    for (const s of item.sections) {
      const heading = isAr ? s.headingAr : s.headingEn;
      const body = isAr ? s.bodyAr : s.bodyEn;
      children.push(
        new Paragraph({
          bidirectional: isAr,
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: heading, bold: true, font, color: "064e3b" })],
        }),
      );
      for (const line of body.split("\n")) {
        children.push(
          new Paragraph({
            bidirectional: isAr,
            children: [new TextRun({ text: line, font, size: isAr ? 28 : 24 })],
          }),
        );
      }
    }
  }

  children.push(
    new Paragraph({ children: [new TextRun({ text: "" })] }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: isAr ? AUTHOR.nameAr : AUTHOR.nameEn,
          bold: true,
          font,
          color: "064e3b",
        }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: isAr ? `${AUTHOR.titleAr} · توقيع معتمد` : `${AUTHOR.titleEn} · Authorized signature`,
          italics: true,
          font,
          size: 20,
        }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: `${PLATFORM.nameEn} — Independent AHSS · PDPL · NBCE guidelines · ${new Date().toISOString().slice(0, 10)} · © ${isAr ? AUTHOR.nameAr : AUTHOR.nameEn}`,
          italics: true,
          color: "888888",
          size: 18,
          font,
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: PLATFORM.nameEn,
    title,
    sections: [{ properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } }, children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function renderResourcePdf(opts: RenderResourceOptions): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const html = renderResourceHtml(opts);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route("**/*", route => {
      if (route.request().url().startsWith("data:")) return route.continue();
      return route.abort();
    });
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export function parseExportLang(raw: unknown): ExportLang {
  return raw === "ar" ? "ar" : "en";
}

export function resourceFilename(slug: string, fmt: string, lang: ExportLang, mode: ExportMode): string {
  const suffix = mode === "filled" ? "-filled" : mode === "generated" ? "-generated" : "";
  return `${slug}-${lang}${suffix}.${fmt}`;
}
