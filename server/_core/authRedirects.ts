import type { Express, Request, Response } from "express";
import { ENV } from "./env";

function authSpaUrl(req: Request): string {
  if (ENV.publicAppUrl) return `${ENV.publicAppUrl.replace(/\/$/, "")}/auth`;
  const proto = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : req.protocol;
  return `${proto}://${req.get("host") ?? "localhost"}/auth`;
}

/** Legacy /api/sign-in links → SPA auth when Supabase (or any modern auth) is active. */
export function registerAuthRedirectRoutes(app: Express) {
  const redirectToAuth = (req: Request, res: Response) => {
    const dest = authSpaUrl(req);
    const next = typeof req.query.next === "string" ? req.query.next : "";
    if (next && /^\/(?![\/\\])[^\\\x00-\x1f]*$/.test(next)) {
      res.redirect(302, `${dest}?next=${encodeURIComponent(next)}`);
      return;
    }
    res.redirect(302, dest);
  };

  app.get("/api/sign-in", (req, res, next) => {
    if (ENV.devLoginEnabled || ENV.pilotLoginEnabled) return next();
    if (ENV.supabaseEnabled || ENV.publicAppUrl) {
      redirectToAuth(req, res);
      return;
    }
    res.status(404).json({ error: "not found", path: req.path, hint: "Use /auth" });
  });

  app.get("/api/dev/login", (req, res, next) => {
    if (ENV.devLoginEnabled) return next();
    if (ENV.supabaseEnabled || ENV.publicAppUrl) {
      redirectToAuth(req, res);
      return;
    }
    res.status(404).json({ error: "not found", path: req.path, hint: "Use /auth" });
  });
}
