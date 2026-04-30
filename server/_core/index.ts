import "dotenv/config";
import express from "express";
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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Health check (used by load balancers / uptime monitors)
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });
  // Local-disk uploads — only mounted when no Forge / S3 driver is
  // configured. Files persist under <project>/uploads/ and are served
  // here so the SPA can render <a href="/uploads/...">.
  if (!process.env.BUILT_IN_FORGE_API_URL && !process.env.S3_BUCKET) {
    if (!fsSync.existsSync(UPLOADS_DIR_PATH)) {
      fsSync.mkdirSync(UPLOADS_DIR_PATH, { recursive: true });
    }
    console.log(`[Storage] Local-disk fallback active at ${UPLOADS_DIR_PATH}`);
    app.use(
      "/uploads",
      express.static(UPLOADS_DIR_PATH, {
        // Stop dotfiles being served back through the static handler.
        dotfiles: "deny",
        index: false,
        // 1h cache for in-app uploads — applicants edit drafts often.
        maxAge: "1h",
      })
    );
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
