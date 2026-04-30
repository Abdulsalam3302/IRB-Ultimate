import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";
import {
  renderApplicationHtml,
  buildInspectorZip,
} from "../applicationExport";
import { renderCertificatePdf, renderCertificateHtml } from "../certificateV2";

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
      if (application.status !== "approved") {
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user) { res.status(401).type("text/plain").send("authentication required"); return; }
        if (application.applicantId !== user.id && user.role !== "admin") {
          res.status(403).type("text/plain").send("forbidden"); return;
        }
      }
      const applicant = await db.getUserById(application.applicantId);
      const wantsHtml = req.query.format === "html";
      if (wantsHtml) {
        const html = renderCertificateHtml({
          app: application,
          applicantName: applicant?.name ?? null,
          applicantEmail: applicant?.email ?? null,
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      }
      const pdf = await renderCertificatePdf({
        app: application,
        applicantName: applicant?.name ?? null,
        applicantEmail: applicant?.email ?? null,
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
}
