import { safeLogError } from "./safeLog";
import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevLoginRoutes } from "./devLogin";
import { registerSupabaseAuthRoutes } from "./supabaseAuth";
import { registerNativeAuthRoutes } from "./nativeAuth";
import { registerAuthRedirectRoutes } from "./authRedirects";
import { registerSecurity, registerApiGuards, registerErrorHandler, createUploadAdmission } from "./security";
import { registerExportRoutes } from "./exportRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { UPLOADS_DIR_PATH } from "../storage";
import { APP_VERSION } from "@shared/const";
import { sdk } from "./sdk";
import { registerIrbAgentRoutes, registerMcpJsonRpc } from "../agent/irbApiRoutes";
import { listTrpcProcedurePaths } from "./trpcMeta";
import { startCertificateBackupScheduler } from "../services/certificateBackup";
import { ensureDefaultCommittee } from "../services/committeeAutoEnroll";
import * as db from "../db";
import * as fsSync from "node:fs";
import { verifyDatabaseReadiness } from "./readiness";
import { assertStaffMfa } from "./staffAuth";
import { attachRemoteScanner } from "../services/remoteScanner";
import { startStorageDeletionWorker } from "../services/storageDeletion";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

import { runMigrations } from "../migrate";

async function startServer() {
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    try {
      await runMigrations();
    } catch (err) {
      console.error("[migrate] Failed:", safeLogError(err));
      throw err;
    }
  }
  const app = express();
  const server = createServer(app);
  const closeRemoteScanner = attachRemoteScanner(server);
  const stopStorageDeletionWorker = startStorageDeletionWorker();
  server.headersTimeout = 15_000;
  server.requestTimeout = 120_000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 1000;
  server.maxConnections = 200;
  // Shared rate limiting runs before upload authentication and body allocation.
  registerSecurity(app);
  app.use(createUploadAdmission(req => sdk.authenticateRequest(req)));
  // Body parser sizing — the 21 MB cap covers a 15 MB upload + base64 +
  // wrapping JSON, but only for the upload route. Everything else is
  // capped at 1 MB so attackers can't exhaust RAM via auth / tRPC.
  const jsonSmall = express.json({ limit: "1mb" });
  const jsonLarge = express.json({ limit: "21mb" });
  const urlencodedSmall = express.urlencoded({ limit: "1mb", extended: true });
  app.use((req, res, next) => {
    if (
      req.path === "/api/trpc/application.uploadFile"
    ) {
      return jsonLarge(req, res, next);
    }
    return jsonSmall(req, res, next);
  });
  app.use(urlencodedSmall);
  // Health check (used by load balancers / uptime monitors). Registered
  // BEFORE the API guards so monitors can poll without sending an Origin
  // header that matches ENV.allowedOrigins. Includes a build-version hint
  // so deploys are confirmable (SA-39); does NOT touch the DB so it never
  // leaks connectivity status.
  const procedurePaths = listTrpcProcedurePaths(appRouter);
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      appVersion: APP_VERSION,
      reviewAuthority: "qualified-human-committee",
      version:
        process.env.RELEASE ||
        process.env.RENDER_GIT_COMMIT ||
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        "dev",
      host: process.env.RENDER ? "render" : process.env.RAILWAY_ENVIRONMENT ? "railway" : "local",
      features: {
        chatApplicationSendMessage: procedurePaths.includes("chatApplication.sendMessage"),
        applicationSendChatMessage: procedurePaths.includes("application.sendChatMessage"),
        certificateHtmlFallback: true,
        acceleratedDigitalReview: true,
      },
    });
  });
  let readiness: { ok: boolean; until: number } | null = null;
  app.get("/api/ready", async (_req, res) => {
    if (!readiness || readiness.until < Date.now()) {
      try {
        await verifyDatabaseReadiness(await db.getDb());
        readiness = { ok: true, until: Date.now() + 5000 };
      } catch { readiness = { ok: false, until: Date.now() + 5000 }; }
    }
    res.status(readiness.ok ? 200 : 503).json({ ok: readiness.ok, appVersion: APP_VERSION });
  });
  // CORS + Origin allowlist for state-changing /api/* calls (SA-01, SA-20).
  // Must come AFTER body parsers (so preflight short-circuit reads no body)
  // and BEFORE OAuth/dev-login/exports/tRPC mounts.
  registerApiGuards(app);
  registerAuthRedirectRoutes(app);
  // Reject any /api/* request that doesn't match a defined route as JSON 404
  // (SA-21). Without this the SPA fallthrough at vite.ts returns index.html
  // for stale endpoints, which masks misconfiguration and bad clients.
  // Mounted AFTER guards so unauthorized origins still get the 403, and
  // BEFORE the SPA static handler at the bottom of startServer().
  const apiNotFound = (req: Request, res: Response) => {
    res.status(404).json({ error: "not found", path: req.path });
  };
  // Local-disk uploads — only mounted when no Forge / S3 driver is
  // configured. Files persist under <project>/uploads/ and are served
  // here so the SPA can render <a href="/uploads/...">.
  //
  // SECURITY: every /uploads/<userId>/... request must be authenticated.
  // We refuse to serve HTML/SVG and force Content-Disposition: attachment
  // so a stored file can never be rendered as active content on the SPA
  // origin. Without this, any logged-in user could upload `evil.html` and
  // get a same-origin XSS surface.
  if (!process.env.BUILT_IN_FORGE_API_URL && !process.env.S3_BUCKET) {
    if (!fsSync.existsSync(UPLOADS_DIR_PATH)) {
      fsSync.mkdirSync(UPLOADS_DIR_PATH, { recursive: true });
    }
    console.log(`[Storage] Local-disk fallback active at ${UPLOADS_DIR_PATH}`);

    const RENDERABLE_BLOCKLIST = /\.(html?|svg|xml|js|mjs|cjs|wasm)$/i;

    const authenticateUpload = async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Block obvious traversal attempts before reaching express.static.
        if (req.path.includes("..") || req.path.includes("\0")) {
          res.status(400).type("text/plain").send("bad request"); return;
        }
        // Refuse to serve back active-content extensions.
        if (RENDERABLE_BLOCKLIST.test(req.path)) {
          res.status(415).type("text/plain").send("unsupported"); return;
        }
        const segs = req.path.replace(/^\/+/, "").split("/");
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user) {
          res.status(401).type("text/plain").send("authentication required"); return;
        }
        // The first segment of the key is the uploader's user id (see
        // routers.ts uploadFile). Admin can read everything; uploader
        // can read their own. Everyone else must have the file row
        // attached to an application they're permitted to view.
        const uploaderIdRaw = segs[0] ?? "";
        const uploaderId = /^[1-9]\d*$/.test(uploaderIdRaw) ? Number(uploaderIdRaw) : NaN;
        if (user.role === "admin" || (Number.isFinite(uploaderId) && uploaderId === user.id)) {
          if (user.id !== uploaderId) assertStaffMfa(user);
          // Authorised by uploader or verified staff.
        } else {
          // Look up the file row by fileKey (path minus leading /)
          const fileKey = segs.join("/");
          const fileRow = await db.getFileUploadByKey?.(fileKey).catch(() => null);
          if (!fileRow || !fileRow.applicationId) {
            res.status(403).type("text/plain").send("forbidden"); return;
          }
          const application = await db.getApplicationById(fileRow.applicationId);
          if (!application) {
            res.status(404).type("text/plain").send("not found"); return;
          }
          if (application.applicantId !== user.id) {
            assertStaffMfa(user);
            const member = await db.getCommitteeMemberByUserId(user.id);
            const reviews = member ? await db.getReviewsByApplication(application.id) : [];
            const isAssignedReviewer = member?.isActive && member.appointedAt && member.qualificationReference && reviews.some(r => r.committeeMemberId === member.id && r.expiresAt && new Date(r.expiresAt).getTime() > Date.now());
            if (!isAssignedReviewer) {
              res.status(403).type("text/plain").send("forbidden"); return;
            }
          }
        }
        // Force download semantics on every served file.
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        res.setHeader("Cache-Control", "private, no-store");
        next();
      } catch (err) {
        console.error("[Uploads] authz failure:", safeLogError(err));
        if (!res.headersSent) res.status(500).type("text/plain").send("server error");
      }
    };

    app.use("/uploads", authenticateUpload, express.static(UPLOADS_DIR_PATH, {
      // Stop dotfiles being served back through the static handler.
      dotfiles: "deny",
      index: false,
      // Cache header is set in middleware above; keep static defaults short.
      maxAge: 0,
    }));
  }
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerSupabaseAuthRoutes(app);
  // First-party email/password auth (no external dependency). Sets the same
  // session cookie as every other auth path, so the rest of the app is
  // provider-agnostic.
  registerNativeAuthRoutes(app);
  registerDevLoginRoutes(app);
  // Application export (HTML for printing, ZIP for inspectors). Streamed
  // binaries — kept off the tRPC adapter which expects JSON.
  registerExportRoutes(app);
  registerIrbAgentRoutes(app);
  registerMcpJsonRpc(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      maxBatchSize: 10,
    })
  );
  // Catch /api/* requests that didn't match any defined route as JSON 404
  // instead of letting them fall through to the SPA index.html (SA-21).
  app.use("/api", apiNotFound);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  // Final error handler — must come after all routes
  registerErrorHandler(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  let port: number;
  if (process.env.NODE_ENV === "production") {
    // SA-40: in production, refuse to silently shift ports. If the
    // configured PORT is busy something else is wrong — the load balancer
    // will route to the wrong process otherwise.
    if (!(await isPortAvailable(preferredPort))) {
      throw new Error(
        `Port ${preferredPort} is in use. Refusing to scan in production.`
      );
    }
    port = preferredPort;
  } else {
    port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      closeRemoteScanner();
      const timer = setTimeout(() => process.exit(1), 15_000).unref();
      server.close(() => { void stopStorageDeletionWorker().finally(() => db.closeDatabase()).finally(() => { clearTimeout(timer); process.exit(0); }); });
      server.closeIdleConnections();
    });
  }
  server.listen(port, process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${port}/`);
    startCertificateBackupScheduler();
    void ensureDefaultCommittee()
      .then(r => console.log("[committee] auto-enroll", r))
      .catch(err => console.warn("[committee] auto-enroll failed", safeLogError(err)));
  });
}

startServer().catch(() => { console.error("[Startup] Failed to initialize service; inspect configuration and migration state."); process.exitCode = 1; });
