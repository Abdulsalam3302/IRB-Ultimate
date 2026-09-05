import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { renderResourceHtml, renderResourceDocx } from "./_core/resourceExport";
import { RESOURCES, getResourceBySlug } from "../shared/resources";
import { TEMPLATE_SECTIONS } from "../shared/templateFields";
import { SLUG_META } from "../shared/formatMeta";

function zipText(buffer: Buffer, name: string): string {
  for (let i = 0; i < buffer.length - 46; i++) {
    if (buffer.readUInt32LE(i) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(i + 28);
    if (buffer.subarray(i + 46, i + 46 + nameLength).toString() !== name)
      continue;
    const local = buffer.readUInt32LE(i + 42);
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + buffer.readUInt32LE(i + 20));
    return (
      buffer.readUInt16LE(i + 10) === 8 ? inflateRawSync(data) : data
    ).toString();
  }
  throw new Error("ZIP member missing");
}

describe("public resource worksheets", () => {
  it("uses clearly illustrative examples and safe placeholder identities across every template", () => {
    const catalog = JSON.stringify({ TEMPLATE_SECTIONS, RESOURCES, SLUG_META });
    expect(catalog).not.toMatch(
      /fatimah|ahmed\.o|ksu\.edu|0000-0002-1825-0097|5.year retention|5 years per PDPL|5 سنوات وفق PDPL|حذف وفق PDPL|متوافقة مع (?:NCBE|اللوائح)/i
    );
    const addresses = catalog.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    expect(
      addresses.every(address => address.endsWith("@example.invalid"))
    ).toBe(true);
    for (const item of RESOURCES.filter(
      resource => resource.category === "template"
    )) {
      for (const lang of ["en", "ar"] as const) {
        const html = renderResourceHtml({ item, lang });
        expect(html).toContain(
          lang === "ar" ? "الأمثلة توضيحية" : "Examples are illustrative"
        );
        expect(html).not.toContain("Ideal example");
      }
    }
  });
  it("renders each handwriting line once and keeps the final field with the closing notice", () => {
    for (const item of RESOURCES)
      for (const lang of ["en", "ar"] as const) {
        const html = renderResourceHtml({ item, lang });
        const lines = [
          ...html.matchAll(/<div class="blank-line"[^>]*>(.*?)<\/div>/g),
        ];
        expect(lines.every(line => line[1] === "")).toBe(true);
        expect(html.match(/<footer /g)).toHaveLength(1);
        expect(html).toContain('<div class="document-closing">');
        expect(html).not.toContain('class="author-stamp"');
      }
  });
  it("includes independent participant-rights contacts in the actual consent worksheet", async () => {
    const item = getResourceBySlug("informed-consent")!;
    for (const lang of ["en", "ar"] as const) {
      const html = renderResourceHtml({ item, lang });
      const xml = zipText(
        await renderResourceDocx({ item, lang }),
        "word/document.xml"
      );
      for (const output of [html, xml]) {
        expect(output).toContain(
          lang === "ar" ? "الحقوق والشكاوى" : "Rights/complaints"
        );
        expect(output).toContain("investigator@example.invalid");
        expect(output).toContain(
          lang === "ar" ? "المدة والأساس المعتمد" : "period and approved basis"
        );
      }
    }
  });
  it("preserves generated answers safely without presenting examples as supplied study facts", async () => {
    const item = getResourceBySlug("informed-consent")!;
    const opts = {
      item,
      lang: "en" as const,
      mode: "generated" as const,
      prefill: {
        study_title: '<script>alert("test")</script> & verified study',
        participant_contacts: "Supplied committee contact",
      },
    };
    const html = renderResourceHtml(opts);
    const xml = zipText(await renderResourceDocx(opts), "word/document.xml");
    for (const output of [html, xml]) {
      expect(output).toContain("Supplied committee contact");
      expect(output).toContain("not provided");
      expect(output).toContain("Draft from your answers");
      expect(output).not.toContain("investigator@example.invalid");
      expect(output).not.toContain("Illustrative example:");
      expect(output).not.toContain("<script>alert");
    }
    expect(html).toContain("&lt;script&gt;");
  });
  it("does not substitute a universal reporting, retention or consent rule for committee determination", () => {
    const item = getResourceBySlug("nbce-ethics-summary")!;
    const english = renderResourceHtml({ item, lang: "en" });
    const arabic = renderResourceHtml({ item, lang: "ar" });
    expect(english).toContain(
      "Any waiver or alteration needs the applicable documented determination"
    );
    expect(english).toContain(
      "does not determine compliance or a universal retention period"
    );
    expect(english).not.toContain("within 7 days");
    expect(arabic).not.toContain("خلال ٧ أيام");
    expect(arabic).toContain("لا تمنح هذه النظرة التعليمية إعفاءً");
  });
});
