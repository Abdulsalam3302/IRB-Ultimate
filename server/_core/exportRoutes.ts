import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";
import {
  renderApplicationHtml,
  buildInspectorZip,
} from "../applicationExport";
import { renderCertificatePdf, renderCertificateHtml } from "../certificateV2";
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
  // Public when the application is `approved` (anyone with the IRB number
  // can download the certificate, mirroring the verify-page behaviour).
  // Authenticated when not yet approved (preview for owner/admin only).
  app.get("/api/export/certificate/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).type("text/plain").send("invalid id"); return;
      }
      const application = await db.getApplicationById(id);
      if (!application) {
        res.status(404).type("text/plain").send("not found"); return;
      }
      // Public access only for approved certificates. Otherwise require
      // either the owner or an admin.
      let viewerKind: "public" | "owner-or-admin" = "owner-or-admin";
      if (application.status !== "approved") {
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user) { res.status(401).type("text/plain").send("authentication required"); return; }
        if (application.applicantId !== user.id && user.role !== "admin") {
          res.status(403).type("text/plain").send("forbidden"); return;
        }
      } else {
        // Approved + no auth needed → mark this as a public render. We
        // still want to redact the applicant email so the unauth
        // endpoint can't be scraped for a "principal investigator → email"
        // harvest.
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user) viewerKind = "public";
        else if (application.applicantId !== user.id && user.role !== "admin") viewerKind = "public";
      }
      const applicant = await db.getUserById(application.applicantId);
      const applicantEmailForRender = viewerKind === "public" ? null : (applicant?.email ?? null);
      const wantsHtml = req.query.format === "html";
      if (wantsHtml) {
        const html = renderCertificateHtml({
          app: application,
          applicantName: applicant?.name ?? null,
          applicantEmail: applicantEmailForRender,
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      }
      const pdf = await renderCertificatePdf({
        app: application,
        applicantName: applicant?.name ?? null,
        applicantEmail: applicantEmailForRender,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="irb-certificate-${(application.irbNumber || `app-${id}`).replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf"`
      );
      res.send(pdf);
    } catch (err) {
      console.error("[Export Cert] failed:", err);
      if (!res.headersSent) res.status(500).type("text/plain").send("certificate generation failed");
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
}
