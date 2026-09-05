import { describe, expect, it, vi } from "vitest";
import { inflateRawSync } from "node:zlib";
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn().mockRejectedValue(new Error("offline-test")), safeJsonParse: JSON.parse }));
import { renderCertificateDocx, renderCertificateHtml } from "./certificateV2";
import { fallbackContent, generateSnihProposalDocx } from "./snihProposalExport";
import type { Application } from "../drizzle/schema";
function app(overrides: Partial<Application> = {}): Application {
  const fields = ["researchObjectives", "methodology", "sampleSize", "targetPopulation", "inclusionCriteria", "exclusionCriteria", "dataCollectionMethods", "informedConsentProcess", "riskAssessment", "benefitAssessment", "confidentialityMeasures"];
  return { ...Object.fromEntries(fields.map(f => [f, `Applicant supplied ${f}`])), id: 5, humanDecisionByUserId: 7, humanDecisionAt: new Date("2026-01-02T03:04:05Z"), status: "approved", irbNumber: "IRB-SA-2026-00123", approvedAt: new Date("2026-01-02T03:04:05Z"), researchTitle: "Study & Arabic دراسة", principalInvestigator: "PI verified name", piInstitution: "Institution", ...overrides } as Application;
}
function zipText(buffer: Buffer, name: string): string {
  for (let i = 0; i < buffer.length - 46; i++) {
    if (buffer.readUInt32LE(i) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(i + 28);
    if (buffer.subarray(i + 46, i + 46 + nameLength).toString() !== name) continue;
    const local = buffer.readUInt32LE(i + 42);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + buffer.readUInt32LE(i + 20));
    return (buffer.readUInt16LE(i + 10) === 8 ? inflateRawSync(data) : data).toString();
  }
  throw new Error(`ZIP member missing: ${name}`);
}
describe("truthful generated documents", () => {
  it("never renders a draft, absent approval date, or invalid date as approved", () => {
    for (const override of [{ status: "draft" }, { approvedAt: null }, { approvedAt: new Date(NaN) }, { irbNumber: null }, { humanDecisionByUserId: null }, { humanDecisionAt: null }]) {
      expect(() => renderCertificateHtml({ app: app(override as never), applicantName: null, applicantEmail: null })).toThrow();
    }
  });
  it("includes the actual research title and never recursively substitutes applicant tokens", () => {
    const html = renderCertificateHtml({ app: app({ researchTitle: "University {{STATUS_LABEL}} <script>alert(1)</script>" }), applicantName: "Name", applicantEmail: null });
    expect(html).toContain("University {{STATUS_LABEL}}");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("makes rejection a non-approval notice without an invented approval date", () => {
    const html = renderCertificateHtml({ app: app({ status: "rejected", approvedAt: null, irbNumber: null }), applicantName: null, applicantEmail: null });
    expect(html).toContain("No authorization to conduct");
    expect(html).toContain("no approval recorded");
    expect(html).not.toContain("Approved · Active");
  });
  it("omits sensitive reasons and account details from public retraction copies", async () => {
    const data = { app: app({ status: "retracted", retractionReason: "patient private adverse event", piDepartment: "private department", fundingSource: "private funding" }), applicantName: "private account", applicantEmail: "secret@example.com", redactForPublic: true };
    const html = renderCertificateHtml(data);
    const docx = zipText(await renderCertificateDocx(data), "word/document.xml");
    for (const text of [html, docx]) for (const secret of ["patient private", "private department", "private funding", "private account", "secret@example.com"]) expect(text).not.toContain(secret);
    expect(docx).toContain("RETRACTED");
    expect(docx).toContain("No expiry date is inferred");
  });
  it("never turns an AI outage into an invented budget, commitment, or evidence base", async () => {
    const content = fallbackContent(app());
    expect(content.budget.total).toBe("Not provided");
    expect(content.team[0].commitment).toBe("Not provided");
    expect(content.references).toEqual(["No verified references supplied. Add and verify primary sources before submission."]);
    const xml = zipText(await generateSnihProposalDocx(app()), "word/document.xml");
    expect(xml).toContain("DRAFT — NOT FOR SUBMISSION");
    expect(xml).toContain("AI unavailable — source-only draft");
    expect(xml).toContain("Applicant supplied methodology");
    expect(xml).not.toContain("250,000");
    expect(xml).not.toContain("30% FTE");
  });
});
