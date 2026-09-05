import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

export function getSessionCookieOptions(req: Request): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return { httpOnly: true, path: "/", sameSite: "lax", secure: ENV.isProduction || req.protocol === "https" };
}
