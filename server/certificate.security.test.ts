import { describe, expect, it } from "vitest";
import { renderCertificateHtml } from "./certificateV2";
import type { Application } from "../drizzle/schema";

function fakeApp(over: Partial<Application> = {}): Application {
  return {
    id: 1,
    irbNumber: "IRB-SA-2026-00123",
    status: "approved",
    researchType: "clinical_trial",
    irbCategory: "full_board",
    principalInvestigator: "Dr. Real PI",
    piInstitution: "Test University",
    piDepartment: "Cardiology",
    fundingSource: "Acme Pharma Grant 42",
    stage1AiScore: 88,
    stage2AiScore: 91,
    approvedAt: new Date("2026-05-22T10:54:30Z"),
    ...(over as object),
  } as unknown as Application;
}

describe("certificate security", () => {
  it("escapes a malicious applicant name (stored XSS)", () => {
    const html = renderCertificateHtml({
      app: fakeApp(),
      applicantName: '<script>alert(1)</script>',
      applicantEmail: null,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("redacts email, department, funding and AI scores on the public certificate", () => {
    const html = renderCertificateHtml({
      app: fakeApp(),
      applicantName: "Dr. Real PI",
      applicantEmail: "secret.applicant@hospital.sa",
      redactForPublic: true,
    });
    expect(html).not.toContain("secret.applicant@hospital.sa");
    expect(html).not.toContain("Acme Pharma Grant 42");
    expect(html).not.toContain("Cardiology");
    // The internal AI score numbers must not appear in the score panel.
    expect(html).not.toMatch(/class="n">\s*88\s*</);
    expect(html).not.toMatch(/class="n">\s*91\s*</);
  });

  it("keeps full detail on the internal (non-public) certificate", () => {
    const html = renderCertificateHtml({
      app: fakeApp(),
      applicantName: "Dr. Real PI",
      applicantEmail: "applicant@hospital.sa",
      redactForPublic: false,
    });
    expect(html).toContain("applicant@hospital.sa");
    expect(html).toContain("Cardiology");
  });
});
