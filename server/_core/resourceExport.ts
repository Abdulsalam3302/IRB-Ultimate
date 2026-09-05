/**
 * Resource export — draft EN or AR worksheets (PDF via Chromium, DOCX via docx).
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
import {
  getTemplateSections,
  type TemplateField,
  type TemplateSection,
} from "@shared/templateFields";
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
  return Array.from(
    { length: count },
    () =>
      `<div class="blank-line" aria-hidden="true"${lang === "ar" ? ' dir="rtl"' : ""}></div>`
  ).join("");
}

function preparationNotice(
  lang: ExportLang,
  mode: ExportMode,
  category: ResourceItem["category"] = "template"
): string {
  if (category === "guideline")
    return lang === "ar"
      ? "مرجع تعليمي مختصر. تحقق من المصادر الرسمية الحالية واطلب مراجعة المؤسسة لتحديد المتطلبات المنطبقة. لا يمثل سياسة رسمية أو قراراً تنظيمياً."
      : "Brief educational reference. Check current official sources and obtain institutional review of applicable requirements. This is not an official policy or regulatory determination.";
  if (mode === "generated")
    return lang === "ar"
      ? "مسودة من إجاباتك. تحقق من الحقائق واستكمل النواقص واطلب مراجعة اللجنة المختصة قبل الاستخدام. ليست موافقة أخلاقية."
      : "Draft from your answers. Verify facts, complete missing information and obtain responsible committee review before use. This is not ethics approval.";
  return lang === "ar"
    ? "ورقة عمل للإعداد. الأمثلة توضيحية وليست حقائق عن دراستك. استبدلها ببيانات موثقة واطلب مراجعة اللجنة المختصة قبل الاستخدام."
    : "Preparation worksheet. Examples are illustrative, not facts about your study. Replace them with verified details and obtain responsible committee review before use.";
}

function renderFieldHtml(
  field: TemplateField,
  lang: ExportLang,
  mode: ExportMode,
  prefill?: Record<string, string>
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
      <div class="field-example"><strong>${isAr ? "مثال توضيحي:" : "Illustrative example:"}</strong> ${escapeHtml(example).replace(/\n/g, "<br/>")}</div>`;

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
  closingNote?: string
): string {
  const isAr = lang === "ar";
  const heading = isAr ? section.headingAr : section.headingEn;
  const dir = isAr ? 'dir="rtl" lang="ar"' : 'lang="en"';
  const fields = section.fields
    .map((field, index) => {
      const html = renderFieldHtml(field, lang, mode, prefill);
      return closingNote && index === section.fields.length - 1
        ? `<div class="document-closing">${html}${closingNote}</div>`
        : html;
    })
    .join("");
  return `<section class="doc-section" ${dir}><h2>${escapeHtml(heading)}</h2>${fields}</section>`;
}

// Compact closing note stays with the last field; no pre-signed approval stamp.
function footerHtml(lang: ExportLang, dateStr: string): string {
  const isAr = lang === "ar";
  return `<footer class="document-note" lang="${lang}" dir="${isAr ? "rtl" : "ltr"}">
    <strong>${isAr ? PLATFORM.nameAr : PLATFORM.nameEn} · AHSS</strong>
    <p>${
      isAr
        ? "مسودة تعليمية تحتاج إلى مراجعة المؤسسة واللجنة المختصة. لا تثبت موافقة أخلاقية أو امتثالاً تنظيمياً."
        : "Draft educational material requiring institutional and committee review. It does not establish ethics approval or regulatory compliance."
    }</p>
    <small>${dateStr} · © ${isAr ? AUTHOR.nameAr : AUTHOR.nameEn}</small>
  </footer>`;
}

function officialStyles(lang: ExportLang): string {
  const isAr = lang === "ar";
  const bodyFont = isAr
    ? '"DejaVu Sans", "Noto Naskh Arabic", Tahoma, Arial, sans-serif'
    : '"Liberation Serif", "Times New Roman", Times, serif';
  return `
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ${bodyFont}; font-size: ${isAr ? "12pt" : "11pt"}; color: #111; line-height: 1.45; margin: 0;
    direction: ${isAr ? "rtl" : "ltr"}; text-align: ${isAr ? "right" : "left"}; }
  .official-header { border-bottom: 2px solid ${BRAND.forest}; padding-bottom: 10px; margin-bottom: 10px;
    display: flex; align-items: center; gap: 12px; }
  .official-header svg { width: 36px; height: 36px; flex-shrink: 0; }
  .official-header .titles { flex: 1; min-width: 0; }
  .official-header .titles h1 { font-size: ${isAr ? "17pt" : "16pt"}; color: ${BRAND.forest}; margin: 0 0 4px; }
  .official-header .titles .subtitle { font-size: 9pt; color: #555; }
  .official-header .meta { width: 112px; flex-shrink: 0; font-size: 8pt; color: #666; }
  .preparation-notice { background: #f0f5f3; border-inline-start: 3px solid ${BRAND.forest};
    padding: 7px 9px; font-size: 9pt; margin: 10px 0 16px; break-inside: avoid; }
  .doc-section { margin: 14px 0; }
  .doc-section h2 { font-size: ${isAr ? "14pt" : "13pt"}; color: ${BRAND.forest};
    border-bottom: 1px solid ${BRAND.jade}; padding-bottom: 3px; margin: 0 0 8px; break-after: avoid; }
  .field-block { border: 1px solid #d4d4d8; border-inline-start: 3px solid ${BRAND.jade};
    padding: 8px 10px; margin: 8px 0; background: #fafafa; break-inside: avoid; }
  .field-label { font-weight: 700; margin-bottom: 4px; color: ${BRAND.forest}; break-after: avoid; }
  .field-hint { font-size: 9pt; color: #444; margin-bottom: 4px; }
  .field-example { font-size: 9pt; color: #065f46; background: #ecfdf5; border: 1px dashed ${BRAND.jade};
    padding: 5px 7px; margin: 5px 0; border-radius: 3px; overflow-wrap: anywhere; }
  .blank-line { border-bottom: 1px solid #aaa; height: 7mm; margin: 0; }
  .filled-value { background: #fff; border: 1px solid ${BRAND.forest}; padding: 7px 9px;
    white-space: pre-wrap; overflow-wrap: anywhere; orphans: 3; widows: 3; }
  .filled-value.empty { color: #666; font-style: italic; }
  .document-closing { break-inside: avoid; }
  .document-note { break-inside: avoid; break-before: avoid; margin-top: 12px; padding-top: 7px;
    border-top: 1px solid ${BRAND.forest}; font-size: 8pt; color: #555; }
  .document-note strong { color: ${BRAND.forest}; }
  .document-note p { margin: 3px 0; }
  .document-note small { font-size: 7.5pt; }`;
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
    item.category === "guideline"
      ? isAr
        ? "مرجع تعليمي للمراجعة"
        : "Educational reference for review"
      : mode === "generated"
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
    mainContent = sections
      .map((section, index) =>
        renderSectionHtml(
          section,
          lang,
          mode,
          prefill,
          index === sections.length - 1 ? footerHtml(lang, dateStr) : undefined
        )
      )
      .join("");
  } else {
    mainContent = item.sections
      .map((s, index) => {
        const heading = isAr ? s.headingAr : s.headingEn;
        const body = isAr ? s.bodyAr : s.bodyEn;
        const section = `<section class="doc-section" ${dir}><h2>${escapeHtml(heading)}</h2>
          <p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p></section>`;
        return index === item.sections.length - 1
          ? `<div class="document-closing">${section}${footerHtml(lang, dateStr)}</div>`
          : section;
      })
      .join("");
  }

  return `<!doctype html>
<html ${dir}><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>${officialStyles(lang)}</style></head><body>
<div class="official-header">${STAMPED_TICK_SVG}
  <div class="titles"><h1>${escapeHtml(title)}</h1><div class="subtitle">${escapeHtml(desc)}</div></div>
  <div class="meta">${isAr ? "اللغة: العربية" : "Language: English"}<br/>${escapeHtml(modeLabel)}<br/>${dateStr}</div>
</div>
<p class="preparation-notice">${escapeHtml(preparationNotice(lang, mode, item.category))}</p>
<main>${mainContent}</main>
</body></html>`;
}

function fieldParagraphs(
  field: TemplateField,
  lang: ExportLang,
  mode: ExportMode,
  prefill?: Record<string, string>
): Paragraph[] {
  const isAr = lang === "ar";
  const label = isAr ? field.labelAr : field.labelEn;
  const hint = isAr ? field.hintAr : field.hintEn;
  const example = isAr ? field.exampleAr : field.exampleEn;
  const filled = prefill?.[field.id]?.trim();
  const font = isAr ? "DejaVu Sans" : "Times New Roman";
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: label,
          bold: true,
          color: "064e3b",
          font,
          size: isAr ? 28 : 24,
        }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: isAr ? "↳ أدخل: " : "↳ Enter: ",
          bold: true,
          font,
          size: 20,
        }),
        new TextRun({ text: hint, font, size: 20, color: "444444" }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: isAr ? "مثال توضيحي: " : "Illustrative example: ",
          bold: true,
          font,
          size: 20,
          color: "059669",
        }),
        new TextRun({
          text: example,
          font,
          size: 20,
          color: "065f46",
          italics: true,
        }),
      ],
    })
  );

  if (mode === "filled" && filled) {
    for (const line of filled.split("\n")) {
      out.push(
        new Paragraph({
          bidirectional: isAr,
          children: [new TextRun({ text: line, font, size: isAr ? 28 : 24 })],
        })
      );
    }
  } else if (mode === "generated") {
    const text = filled || (isAr ? "— لم يُذكر —" : "— not provided —");
    for (const line of text.split("\n")) {
      out.push(
        new Paragraph({
          bidirectional: isAr,
          children: [new TextRun({ text: line, font, size: isAr ? 28 : 24 })],
        })
      );
    }
  } else {
    for (let i = 0; i < (field.blankLines ?? 2); i++) {
      out.push(
        new Paragraph({
          bidirectional: isAr,
          children: [new TextRun({ text: "", font, size: 22 })],
          spacing: { after: 100, line: 340 },
          border: {
            bottom: { color: "AAAAAA", size: 4, style: BorderStyle.SINGLE },
          },
        })
      );
    }
  }
  out.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  return out;
}

export async function renderResourceDocx(
  opts: RenderResourceOptions
): Promise<Buffer> {
  const { item, lang, mode = "blank", prefill } = opts;
  const isAr = lang === "ar";
  const title = isAr ? item.titleAr : item.titleEn;
  const desc = isAr ? item.descAr : item.descEn;
  const font = isAr ? "DejaVu Sans" : "Times New Roman";
  const children: Paragraph[] = [
    new Paragraph({
      bidirectional: isAr,
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: title,
          bold: true,
          font,
          size: 36,
          color: "064e3b",
        }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: desc,
          italics: true,
          font,
          size: 22,
          color: "555555",
        }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: preparationNotice(lang, mode, item.category),
          font,
          size: 19,
          color: "444444",
        }),
      ],
      spacing: { after: 180 },
    }),
  ];

  const sections = getTemplateSections(item.slug);
  if (sections?.length) {
    for (const s of sections) {
      const heading = isAr ? s.headingAr : s.headingEn;
      children.push(
        new Paragraph({
          bidirectional: isAr,
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: heading,
              bold: true,
              font,
              color: "064e3b",
              size: 28,
            }),
          ],
          border: {
            bottom: { color: "10b981", size: 6, style: BorderStyle.SINGLE },
          },
        })
      );
      for (const f of s.fields) {
        if (mode === "generated") {
          children.push(
            new Paragraph({
              bidirectional: isAr,
              children: [
                new TextRun({
                  text: isAr ? f.labelAr : f.labelEn,
                  bold: true,
                  font,
                  color: "064e3b",
                }),
              ],
            })
          );
          const val =
            prefill?.[f.id]?.trim() ||
            (isAr ? "— لم يُذكر —" : "— not provided —");
          for (const line of val.split("\n")) {
            children.push(
              new Paragraph({
                bidirectional: isAr,
                children: [
                  new TextRun({ text: line, font, size: isAr ? 28 : 24 }),
                ],
              })
            );
          }
          children.push(
            new Paragraph({ children: [new TextRun({ text: "" })] })
          );
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
          children: [
            new TextRun({ text: heading, bold: true, font, color: "064e3b" }),
          ],
        })
      );
      for (const line of body.split("\n")) {
        children.push(
          new Paragraph({
            bidirectional: isAr,
            children: [new TextRun({ text: line, font, size: isAr ? 28 : 24 })],
          })
        );
      }
    }
  }

  children.push(
    new Paragraph({
      bidirectional: isAr,
      keepNext: true,
      children: [
        new TextRun({
          text: `${isAr ? PLATFORM.nameAr : PLATFORM.nameEn} · AHSS`,
          bold: true,
          font,
          size: 20,
          color: "064e3b",
        }),
      ],
      border: { top: { color: "064e3b", size: 4, style: BorderStyle.SINGLE } },
      spacing: { before: 180 },
    }),
    new Paragraph({
      bidirectional: isAr,
      keepNext: true,
      children: [
        new TextRun({
          text: isAr
            ? "مسودة تعليمية تحتاج إلى مراجعة المؤسسة واللجنة المختصة. لا تثبت موافقة أخلاقية أو امتثالاً تنظيمياً."
            : "Draft educational material requiring institutional and committee review. It does not establish ethics approval or regulatory compliance.",
          font,
          size: 18,
          color: "555555",
        }),
      ],
    }),
    new Paragraph({
      bidirectional: isAr,
      children: [
        new TextRun({
          text: `${new Date().toISOString().slice(0, 10)} · © ${isAr ? AUTHOR.nameAr : AUTHOR.nameEn}`,
          font,
          size: 16,
          color: "666666",
        }),
      ],
    })
  );

  const doc = new Document({
    creator: PLATFORM.nameEn,
    title,
    sections: [
      {
        properties: {
          page: { size: { orientation: PageOrientation.PORTRAIT } },
        },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

// One lazily-launched browser shared across all resource-PDF renders — a
// fresh chromium.launch() per request (the old behaviour) let an anonymous
// caller spawn unbounded browser processes via the public export endpoint.
let _browserPromise: Promise<import("playwright").Browser> | null = null;
async function getSharedBrowser() {
  const { chromium } = await import("playwright");
  if (!_browserPromise) {
    _browserPromise = chromium.launch({ headless: true }).then(browser => {
      browser.once("disconnected", () => {
        _browserPromise = null;
      });
      return browser;
    });
    _browserPromise.catch(() => {
      _browserPromise = null;
    });
  }
  return _browserPromise;
}

export async function renderResourcePdf(
  opts: RenderResourceOptions
): Promise<Buffer> {
  const { pdfSemaphore } = await import("./concurrency");
  return pdfSemaphore.run(async () => {
    const html = renderResourceHtml(opts);
    const browser = await getSharedBrowser();
    const ctx = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    const timeout = setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 20000);
    try {
      const page = await ctx.newPage();
      await page.route("**/*", route => {
        if (route.request().url().startsWith("data:")) return route.continue();
        return route.abort();
      });
      await page.setContent(html, { waitUntil: "load", timeout: 15000 });
      const pdf = await page.pdf({
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      clearTimeout(timeout);
      await ctx.close().catch(() => undefined);
    }
  });
}

export function parseExportLang(raw: unknown): ExportLang {
  return raw === "ar" ? "ar" : "en";
}

export function resourceFilename(
  slug: string,
  fmt: string,
  lang: ExportLang,
  mode: ExportMode
): string {
  const suffix =
    mode === "filled" ? "-filled" : mode === "generated" ? "-generated" : "";
  return `${slug}-${lang}${suffix}.${fmt}`;
}
