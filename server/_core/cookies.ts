import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  const secure = isSecureRequest(req);
  // CSRF defence (SA-01): keep SameSite=Lax even in production.
  //
  // Lax sends the cookie on top-level GET navigations (so the OAuth callback
  // and direct links still work) but withholds it on cross-site POSTs — which
  // is the surface every tRPC mutation rides on. We pair this with the
  // originGuard middleware on /api/trpc, so even a same-site GET-then-POST
  // chain has to come from an allowlisted origin.
  //
  // SameSite=None is only correct when the API is deliberately exposed to
  // third-party browser contexts (e.g. an embedded widget). This app isn't.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
  };
}
