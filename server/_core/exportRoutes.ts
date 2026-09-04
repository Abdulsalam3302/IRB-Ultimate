import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";
import {
  renderApplicationHtml,
  buildInspectorZip,
} from "../applicationExport";
import { renderCertificateHtml, renderCertificateArtifact, renderCertificateDocx, isCertificateEligibleStatus } from "../certificateV2";
import { getResourceBySlug } from "@shared/resources";
import { buildPrefillMap } from "@shared/resourcePrefill";
import { isFormattableSlug } from "@shared/templateFields";
import {
  renderResourceDocx,
  renderResourcePdf,
  parseExportLang,
  resourceFilename,
  type ExportMode,
} from "./resourceExport";
import {
  generateSnihProposalDocx,
  isStage2CompleteForProposal,
  proposalFilename,
} from "../snihProposalExport";
import { reserveLlmCall } from "./budget";

type GenerateFormatBody = {
  slug?: string;
  lang?: string;
  format?: string;
  answers?: Record<string, string>;
  appId?: number;
};

/**
 * Streamed export endpoints. Two formats:
 *   /api/export/application/:id       → printable HTML (browser → Save as PDF)
 *   /api/export/inspector/:id         → ZIP with HTML + audit CSV + manifest (admin only)
 *
 * Authn / authz:
 *   - HTML: applicant who owns the record OR admin
 *   - ZIP : admin only (the bundle is intended for regulatory inspection)
 */
export function registerExportRoutes(app: Express) {
  app.get("/api/export/application/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).type("text/plain").send("invalid id");
        return;
      }
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        res.status(401).type("text/plain").send("authentication required");
        return;
      }
      const application = await db.getApplicationById(id);
      if (!application) {
        res.status(404).type("text/plain").send("not found");
        return;
      }
      if (application.applicantId !== user.id && user.role !== "admin") {
        res.status(403).type("text/plain").send("forbidden");
        return;
      }

      const [authors, audit, applicant] = await Promise.all([
        db.getAuthorsByApplication(id),
        db.getAuditLogByApplication(id),
        db.getUserById(application.applicantId),
      ]);

      const html = renderApplicationHtml({
        app: application,
        authors: authors.map(a => ({
          name: a.name,
          email: a.email,
          institution: a.institution,
          department: a.department,
          country: a.country,
        })),
        audit: audit.map(a => ({
          action: a.action,
          details: a.details,
          createdAt: a.createdAt,
        })),
        applicantName: applicant?.name ?? null,
        applicantEmail: applicant?.email ?? null,
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="irb-${(application.irbNumber || `app-${id}`).replace(/[^a-zA-Z0-9_-]/g, "-")}.html"`
      );
      res.send(html);
    } catch (err) {
      console.error("[Export HTML] failed:", err);
      if (!res.headersSent) res.status(500).type("text/plain").send("export failed");
    }
  });

  app.get("/api/export/inspector/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).type("text/plain").send("invalid id");
        return;
      }
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        res.status(401).type("text/plain").send("authentication required");
        return;
      }
      // Admin-only — inspector bundles include audit data not generally
      // visible to the applicant in raw form.
      if (user.role !== "admin") {
        res.status(403).type("text/plain").send("admin required");
        return;
      }
      const application = await db.getApplicationById(id);
      if (!application) {
        res.status(404).type("text/plain").send("not found");
        return;
      }

      const [authors, audit, applicant] = await Promise.all([
        db.getAuthorsByApplication(id),
        db.getAuditLogByApplication(id),
        db.getUserById(application.applicantId),
      ]);

      const { stream, filename } = buildInspectorZip({
        app: application,
        authors: authors.map(a => ({
          name: a.name,
          email: a.email,
          institution: a.institution,
          department: a.department,
          country: a.country,
        })),
        audit: audit.map(a => ({
          action: a.action,
          details: a.details,
          createdAt: a.createdAt,
        })),
        applicantName: applicant?.name ?? null,
        applicantEmail: applicant?.email ?? null,
      });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      stream.pipe(res);
    } catch (err) {
      console.error("[Export ZIP] failed:", err);
      if (!res.headersSent) res.status(500).type("text/plain").send("export failed");
    }
  });

  // ─── Certificate download — formal PDF, regenerated on-demand
  // SA-05: authenticated owner/admin ONLY. The previous behaviour allowed
  // anonymous downloads of any approved certificate by iterating the
  // sequential numeric id — a full-registry PII harvest. Public
  // verification uses the stored (redacted) certificateUrl surfaced by
  // /verify and the registry, so nothing public breaks by locking this.
  // Unauthorized and non-existent ids both return 404 so the endpoint is
  // not an application-id oracle.
  app.get("/api/export/certificate/:id", async (req: Request, res: Response) => {
    let eligiblePayload: {
      app: NonNullable<Awaited<ReturnType<typeof db.getApplicationById>>>;
      applicantName: string | null;
      applicantEmail: string | null;
    } | null = null;
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).type("text/plain").send("invalid id"); return;
      }
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        res.status(401).type("text/plain").send("authentication required"); return;
      }
      const application = await db.getApplicationById(id);
      if (!application || (application.applicantId !== user.id && user.role !== "admin")) {
        res.status(404).type("text/plain").send("not found"); return;
      }
      if (!isCertificateEligibleStatus(application.status)) {
        res.status(409).type("text/plain").send("certificate is issued only for approved, rejected, or retracted applications");
        return;
      }
      const applicant = await db.getUserById(application.applicantId);
      const payload = {
        app: application,
        applicantName: applicant?.name ?? null,
        applicantEmail: applicant?.email ?? null,
      };
      eligiblePayload = payload;
      const fmt = String(req.query.format || "").toLowerCase();
      const safeName = (application.irbNumber || `app-${id}`).replace(/[^a-zA-Z0-9_-]/g, "-");
      if (fmt === "html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderCertificateHtml(payload));
        return;
      }
      if (fmt === "docx" || fmt === "word") {
        try {
          const buf = await renderCertificateDocx(payload);
          res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          res.setHeader("Content-Disposition", `attachment; filename="irb-certificate-${safeName}.docx"`);
          res.send(buf);
          return;
        } catch (docxErr) {
          console.warn("[Export Cert] DOCX failed; HTML fallback", docxErr);
        }
      }
      const artifact = await renderCertificateArtifact(payload);
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader(
        "Content-Disposition",
        artifact.extension === "pdf"
          ? `inline; filename="irb-certificate-${safeName}.pdf"`
          : `inline; filename="irb-certificate-${safeName}.html"`,
      );
      res.send(artifact.buffer);
    } catch (err) {
      console.error("[Export Cert] failed:", err);
      if (res.headersSent) return;
      if (eligiblePayload) {
        try {
          res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
          res.send(renderCertificateHtml(eligiblePayload));
          return;
        } catch (htmlErr) {
          console.error("[Export Cert] HTML fallback failed", htmlErr);
        }
      }
      res.status(500).type("text/html; charset=utf-8").send(
        "<!doctype html><html><head><meta charset='utf-8'><title>Certificate</title></head><body><p>Unable to generate this certificate right now. Please retry or contact support.</p></body></html>",
      );
    }
  });

  // ─── Resource downloads: /api/export/resource/:slug.:format?lang=en|ar ──
  //
  // Public blank templates in English OR Arabic (not bilingual in one file).
  // Optional query: lang=en (default) | lang=ar
  app.get("/api/export/resource/:fileName", async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName || "";
      const m = fileName.match(/^([a-z0-9-]{1,64})\.(pdf|docx)$/i);
      if (!m) {
        res.status(400).type("text/plain").send("expected <slug>.<pdf|docx>");
        return;
      }
      const [, slug, fmt] = m;
      const item = getResourceBySlug(slug);
      if (!item) {
        res.status(404).type("text/plain").send("resource not found");
        return;
      }
      const lang = parseExportLang(req.query.lang);
      const mode: ExportMode = "blank";
      const opts = { item, lang, mode };
      const safeName = resourceFilename(item.slug, fmt.toLowerCase(), lang, mode);

      if (fmt.toLowerCase() === "docx") {
        const buf = await renderResourceDocx(opts);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.send(buf);
        return;
      }

      const pdf = await renderResourcePdf(opts);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(pdf);
    } catch (err) {
      console.error("[Export Resource] failed:", err);
      if (!res.headersSent)
        res.status(500).type("text/plain").send("resource generation failed");
    }
  });

  // ─── Format from application: /api/export/application/:id/format/:fileName ──
  // Generates a pre-filled template from the applicant's saved data.
  app.get("/api/export/application/:id/format/:fileName", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).type("text/plain").send("invalid id");
        return;
      }
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        res.status(401).type("text/plain").send("authentication required");
        return;
      }
      const application = await db.getApplicationById(id);
      if (!application) {
        res.status(404).type("text/plain").send("not found");
        return;
      }
      if (application.applicantId !== user.id && user.role !== "admin") {
        res.status(403).type("text/plain").send("forbidden");
        return;
      }

      const fileName = req.params.fileName || "";
      const m = fileName.match(/^([a-z0-9-]{1,64})\.(pdf|docx)$/i);
      if (!m) {
        res.status(400).type("text/plain").send("expected <slug>.<pdf|docx>");
        return;
      }
      const [, slug, fmt] = m;
      if (!isFormattableSlug(slug)) {
        res.status(400).type("text/plain").send("this resource cannot be formatted from application data");
        return;
      }
      const item = getResourceBySlug(slug);
      if (!item) {
        res.status(404).type("text/plain").send("resource not found");
        return;
      }

      const authors = await db.getAuthorsByApplication(id);
      const prefill = buildPrefillMap(
        slug,
        application,
        authors.map(a => ({
          name: a.name,
          email: a.email,
          institution: a.institution,
          department: a.department,
          country: a.country,
        })),
      );
      const lang = parseExportLang(req.query.lang);
      const opts = { item, lang, mode: "filled" as ExportMode, prefill };
      const safeName = resourceFilename(item.slug, fmt.toLowerCase(), lang, "filled");

      if (fmt.toLowerCase() === "docx") {
        const buf = await renderResourceDocx(opts);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
        res.send(buf);
        return;
      }

      const pdf = await renderResourcePdf(opts);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.send(pdf);
    } catch (err) {
      console.error("[Export Format] failed:", err);
      if (!res.headersSent) res.status(500).type("text/plain").send("format export failed");
    }
  });

  // ─── Format wizard generate: POST /api/export/format/generate ──
  // User answers questions in the wizard, then generates a stamped document.
  app.post("/api/export/format/generate", async (req: Request, res: Response) => {
    try {
      const body = req.body as GenerateFormatBody;
      const slug = typeof body.slug === "string" ? body.slug : "";
      if (!isFormattableSlug(slug)) {
        res.status(400).type("text/plain").send("invalid or unsupported template slug");
        return;
      }
      const item = getResourceBySlug(slug);
      if (!item) {
        res.status(404).type("text/plain").send("resource not found");
        return;
      }

      const appId = typeof body.appId === "number" && Number.isFinite(body.appId) ? body.appId : undefined;
      if (appId) {
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user) {
          res.status(401).type("text/plain").send("authentication required");
          return;
        }
        const application = await db.getApplicationById(appId);
        if (!application) {
          res.status(404).type("text/plain").send("application not found");
          return;
        }
        if (application.applicantId !== user.id && user.role !== "admin") {
          res.status(403).type("text/plain").send("forbidden");
          return;
        }
      }

      const lang = parseExportLang(body.lang);
      const fmt = body.format === "docx" ? "docx" : "pdf";
      const answers =
        body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
          ? Object.fromEntries(
              Object.entries(body.answers).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]),
            )
          : {};

      const opts = { item, lang, mode: "generated" as ExportMode, prefill: answers };
      const safeName = resourceFilename(item.slug, fmt, lang, "generated");

      if (fmt === "docx") {
        const buf = await renderResourceDocx(opts);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.send(buf);
        return;
      }

      const pdf = await renderResourcePdf(opts);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(pdf);
    } catch (err) {
      console.error("[Export Format Generate] failed:", err);
      if (!res.headersSent) res.status(500).type("text/plain").send("format generation failed");
    }
  });

  // SNIH combined proposal DOCX — Stage 2 must be complete (all core fields filled)
  app.get("/api/export/proposal/:id.docx", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).type("text/plain").send("invalid id");
        return;
      }
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        res.status(401).type("text/plain").send("authentication required");
        return;
      }
      const application = await db.getApplicationById(id);
      if (!application) {
        res.status(404).type("text/plain").send("not found");
        return;
      }
      if (application.applicantId !== user.id && user.role !== "admin") {
        res.status(403).type("text/plain").send("forbidden");
        return;
      }
      if (!isStage2CompleteForProposal(application)) {
        res.status(400).type("text/plain").send("Complete Stage 2 before generating the proposal package.");
        return;
      }
      // This export runs a large LLM completion — charge it against the same
      // per-user/global daily AI budget as the tRPC AI routes, otherwise it's
      // an unmetered way to burn the LLM bill.
      const budget = await reserveLlmCall(user.id);
      if (!budget.ok) {
        res.status(429).type("text/plain").send(
          budget.reason === "global"
            ? "The platform's daily AI limit has been reached. Please try again tomorrow."
            : "You've reached your daily AI limit. Please try again tomorrow.",
        );
        return;
      }
      const buf = await generateSnihProposalDocx(application);
      const name = proposalFilename(application);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(buf);
    } catch (err) {
      console.error("[Export Proposal] failed:", err);
      if (!res.headersSent) res.status(500).type("text/plain").send("proposal generation failed");
    }
  });
}
