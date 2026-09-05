import { describe, expect, it } from "vitest";
import { getPageMetadata, getPublicSiteOrigin, PUBLIC_PATHS } from "./seo";

describe("public discovery contract", () => {
  it("has unique routes and protects all private and verification-record paths", () => {
    expect(new Set(PUBLIC_PATHS).size).toBe(PUBLIC_PATHS.length);
    for (const path of ["/dashboard", "/auth", "/admin", "/profile", "/application/123", "/verify/IRB-SA-2026-00001", "/registry", "/unknown"]) expect(getPageMetadata(path).robots).toContain("noindex");
    expect(getPageMetadata("/resources").indexable).toBe(true);
    expect(getPageMetadata("/verify").indexable).toBe(true);
    expect(getPageMetadata("/", "ar").title).toContain("السعودية");
  });
  it("accepts only configured HTTPS origins for canonical and sitemap generation", () => {
    expect(getPublicSiteOrigin("https://irb.example/")).toBe("https://irb.example");
    for (const value of [undefined, "", "javascript:alert(1)", "http://irb.example", "https://user:secret@irb.example", "https://irb.example/other", "https://irb.example?token=secret", "https://localhost"]) expect(getPublicSiteOrigin(value)).toBeNull();
  });
});

import { GUIDELINE_DOCS } from "./guidelineDocs";
import { GUIDELINE_METADATA } from "./guidelineMetadata";
it("keeps lightweight discovery metadata synchronized with lazy guideline content", () => {
  expect(GUIDELINE_METADATA).toEqual(GUIDELINE_DOCS.map(({ sections: _sections, ...metadata }) => metadata));
});
