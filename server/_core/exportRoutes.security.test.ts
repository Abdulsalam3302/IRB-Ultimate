import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
vi.mock("../db", () => ({ getApplicationByIrbNumber: vi.fn(), getApplicationById: vi.fn() }));
vi.mock("./sdk", () => ({ sdk: { authenticateRequest: vi.fn().mockResolvedValue(null) } }));
vi.mock("../certificateV2", () => ({ renderCertificateArtifact: vi.fn().mockResolvedValue({ buffer: Buffer.from("%PDF-test"), contentType: "application/pdf", extension: "pdf" }), renderCertificateHtml: vi.fn(), renderCertificateDocx: vi.fn(), isCertificateEligibleStatus: vi.fn() }));
import * as db from "../db";
import { sdk } from "./sdk";
import { renderCertificateArtifact } from "../certificateV2";
import { registerExportRoutes } from "./exportRoutes";
let server: Server;
async function endpoint() {
  const app = express(); app.use(express.json()); registerExportRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  vi.clearAllMocks(); vi.mocked(sdk.authenticateRequest).mockResolvedValue(null as never);
});
describe("document export access boundaries", () => {
  it("regenerates only redacted public artifacts from a proven human decision", async () => {
    vi.mocked(db.getApplicationByIrbNumber).mockResolvedValue({ id: 7, status: "approved", irbNumber: "IRB-TEST-2026-001", humanDecisionByUserId: 99, humanDecisionAt: new Date() } as never);
    const response = await fetch(`${await endpoint()}/api/export/public-certificate/IRB-TEST-2026-001`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(renderCertificateArtifact).toHaveBeenCalledWith(expect.objectContaining({ redactForPublic: true, applicantName: null, applicantEmail: null }));
  });
  it("never exposes an old automated approval as a public certificate", async () => {
    vi.mocked(db.getApplicationByIrbNumber).mockResolvedValue({ id: 7, status: "approved", irbNumber: "IRB-TEST-2026-001", humanDecisionByUserId: null, humanDecisionAt: null } as never);
    expect((await fetch(`${await endpoint()}/api/export/public-certificate/IRB-TEST-2026-001`)).status).toBe(404);
    expect(renderCertificateArtifact).not.toHaveBeenCalled();
  });
  it("requires authentication to generate documents from supplied answers", async () => {
    const response = await fetch(`${await endpoint()}/api/export/format/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: "informed-consent", format: "pdf", answers: {} }) });
    expect(response.status).toBe(401);
  });
  it("rejects non-integer IDs before fetching a confidential application", async () => {
    const response = await fetch(`${await endpoint()}/api/export/application/7junk`);
    expect(response.status).toBe(400);
    expect(db.getApplicationById).not.toHaveBeenCalled();
  });
});
