import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevLoginRoutes } from "./devLogin";
import { registerSecurity, registerErrorHandler } from "./security";
import { registerExportRoutes } from "./exportRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { UPLOADS_DIR_PATH } from "../storage";
import { sdk } from "./sdk";
import * as db from "../db";
import * as fsSync from "node:fs";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
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

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Security headers + naive rate limit on /api/*
  registerSecurity(app);
  // Body parser sizing — the 21 MB cap covers a 15 MB upload + base64 +
  // wrapping JSON, but only for the upload route. Everything else is
  // capped at 1 MB so attackers can't exhaust RAM via auth / tRPC.
  const jsonSmall = express.json({ limit: "1mb" });
  const jsonLarge = express.json({ limit: "21mb" });
  const urlencodedSmall = express.urlencoded({ limit: "1mb", extended: true });
  app.use((req, res, next) => {
    if (
      req.path === "/api/trpc/application.uploadFile" ||
      req.path.startsWith("/api/trpc/application.uploadFile")
    ) {
      return jsonLarge(req, res, next);
    }
    return jsonSmall(req, res, next);
  });
  app.use(urlencodedSmall);
  // Health check (used by load balancers / uptime monitors)
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });
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
        const user = await sdk.authenticateRequest(req).catch(() => null);
        if (!user) {
          res.status(401).type("text/plain").send("authentication required"); return;
        }
        // The first segment of the key is the uploader's user id (see
        // routers.ts uploadFile). Admin can read everything; uploader
        // can read their own. Everyone else must have the file row
        // attached to an application they're permitted to view.
        const segs = req.path.replace(/^\/+/, "").split("/");
        const uploaderIdRaw = segs[0] ?? "";
        const uploaderId = Number.parseInt(uploaderIdRaw, 10);
        if (user.role === "admin" || (Number.isFinite(uploaderId) && uploaderId === user.id)) {
          // OK — authorised by uploader / admin.
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
            const member = await db.getCommitteeMemberByUserId(user.id);
            const reviews = member ? await db.getReviewsByApplication(application.id) : [];
            const isAssignedReviewer = member && reviews.some(r => r.committeeMemberId === member.id);
            if (!isAssignedReviewer) {
              res.status(403).type("text/plain").send("forbidden"); return;
            }
          }
        }
        // Force download semantics on every served file.
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        res.setHeader("Cache-Control", "private, max-age=300");
        next();
      } catch (err) {
        console.error("[Uploads] authz failure:", err);
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
  // Dev login (auto-disabled in production / when OAUTH_SERVER_URL is set)
  registerDevLoginRoutes(app);
  // Application export (HTML for printing, ZIP for inspectors). Streamed
  // binaries — kept off the tRPC adapter which expects JSON.
  registerExportRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  // Final error handler — must come after all routes
  registerErrorHandler(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
