import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Response as ExpressResponse } from "express";
import { createServer, request as httpRequest, type Server, type ClientRequest } from "node:http";
import { once } from "node:events";
import { EventEmitter } from "node:events";

const { limiter, userLookup, revoked } = vi.hoisted(() => ({ limiter: vi.fn(), userLookup: vi.fn(), revoked: vi.fn() }));
vi.mock("./_core/env", () => ({ ENV: { isProduction: true, cookieSecret: "synthetic-upload-admission-cookie-secret-32plus", appId: "upload-admission-test", allowedOrigins: ["https://public.example"], supabaseUrl: "", publicAppUrl: "https://public.example" } }));
vi.mock("./_core/requestLimits", () => ({ consumeRateLimit: limiter }));
vi.mock("./db", () => ({ getUserByOpenId: userLookup }));
vi.mock("./_core/sessions", () => ({ isSessionRevoked: revoked, revokeSession: vi.fn() }));
vi.mock("./_core/observability", () => ({ captureException: vi.fn() }));
import { registerSecurity, createUploadAdmission } from "./_core/security";
import { sdk } from "./_core/sdk";
import { assertStaffMfa } from "./_core/staffAuth";
import { COOKIE_NAME } from "../shared/const";

const UPLOAD_PATH = "/api/trpc/application.uploadFile";
const servers: Server[] = [];
const clients: ClientRequest[] = [];
type HttpResult = { status: number; body: string; headers: Record<string, unknown> };

async function appServer(bodyTimeoutMs = 30_000) {
  const app = express();
  const events = new EventEmitter();
  const held: ExpressResponse[] = [];
  let parsedCount = 0;
  registerSecurity(app);
  app.use(createUploadAdmission(req => sdk.authenticateRequest(req), { bodyTimeoutMs }));
  app.use((req, _res, next) => { if (req.path === UPLOAD_PATH) events.emit("admitted"); next(); });
  app.use(express.json({ limit: "21mb" }));
  app.post(UPLOAD_PATH, async (req, res) => {
    parsedCount++;
    // Admission does not cache a user or bypass final ownership/staff checks.
    const user = await sdk.authenticateRequest(req);
    if (req.body.staffAccess) {
      try { assertStaffMfa(user); } catch { res.status(403).json({ error: "MFA required" }); return; }
    }
    if (req.body.hold) { held.push(res); events.emit("held"); return; }
    res.json({ success: true, authLevel: user.authLevel });
  });
  app.get("/api/ordinary", (_req, res) => res.json({ ok: true }));
  app.all(["/api/export/test", "/api/auth/login"], (_req, res) => res.json({ ok: true }));
  app.use((err: unknown, _req: express.Request, res: ExpressResponse, _next: express.NextFunction) => {
    if (!res.headersSent) res.status(400).json({ error: "Body rejected" });
  });
  const server = createServer(app); servers.push(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  function send(path: string, options: { cookie?: string; method?: string; data?: string; partial?: boolean; headers?: Record<string, string> } = {}) {
    let client!: ClientRequest;
    const response = new Promise<HttpResult>((resolve, reject) => {
      client = httpRequest({ host: "127.0.0.1", port, path, method: options.method || "POST", headers: {
        origin: "https://public.example", "content-type": "application/json", ...(options.cookie ? { cookie: `${COOKIE_NAME}=${options.cookie}` } : {}),
        ...(options.partial ? { "content-length": "1000000" } : {}), ...options.headers,
      } }, res => {
        let body = "";
        res.setEncoding("utf8"); res.on("data", chunk => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode!, body, headers: res.headers }));
      });
      client.on("error", reject); client.setTimeout(2000, () => client.destroy(new Error("test client deadline")));
      clients.push(client);
      if (options.partial) { client.flushHeaders(); client.write('{"incomplete":"'); }
      else client.end(options.data ?? "{}");
    });
    return { client, response };
  }
  return { send, events, held, parsedCount: () => parsedCount };
}

beforeEach(() => {
  vi.clearAllMocks();
  limiter.mockResolvedValue({ allowed: true, retryAfter: 60 });
  revoked.mockResolvedValue(false);
  userLookup.mockImplementation(async (openId: string) => ({ id: openId.startsWith("native:") ? 1 : openId.startsWith("supabase:") ? 2 : 3, openId, role: "applicant", loginMethod: openId.startsWith("native:") ? "native" : "supabase" }));
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.destroy();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  vi.unstubAllEnvs();
});

describe("shared rate allowance protection", () => {
  it.each([["/api/export/test", "strict"], ["/api/auth/login", "auth"]])("blocked caller cannot drain the shared %s allowance", async (path, scope) => {
    let remainingGlobal = 1;
    limiter.mockImplementation(async (name: string, identity: string) => {
      if (name === `api-${scope}` && identity === "198.51.100.9") return { allowed: false, retryAfter: 42 };
      if (name === `api-global-${scope}`) return { allowed: remainingGlobal-- > 0, retryAfter: 42 };
      return { allowed: true, retryAfter: 42 };
    });
    const server = await appServer();
    for (let n = 0; n < 12; n++) {
      const result = await server.send(path, { headers: { "x-forwarded-for": "198.51.100.9" } }).response;
      expect(result.status).toBe(429);
      expect(result.headers["retry-after"]).toBe("42");
    }
    expect(limiter.mock.calls.filter(([name]) => name === `api-global-${scope}`)).toHaveLength(0);
    expect((await server.send(path, { headers: { "x-forwarded-for": "198.51.100.10" } }).response).status).toBe(200);
    expect(remainingGlobal).toBe(0);
  });

  it("retains shared-limit and accounting-unavailable fail-closed responses", async () => {
    const server = await appServer();
    limiter.mockImplementation(async (name: string) => ({ allowed: name === "api-strict", retryAfter: 17 }));
    expect((await server.send("/api/export/test").response).status).toBe(429);
    limiter.mockResolvedValue({ allowed: false, unavailable: true, retryAfter: 60 });
    expect((await server.send("/api/export/test").response).status).toBe(503);
  });
});

describe("upload admission before request-body parsing", () => {
  it("rejects two anonymous unfinished bodies immediately while a valid applicant can upload", async () => {
    const server = await appServer();
    const first = server.send(UPLOAD_PATH, { partial: true });
    const second = server.send(UPLOAD_PATH, { partial: true });
    expect((await first.response).status).toBe(401);
    expect((await second.response).status).toBe(401);
    expect(server.parsedCount()).toBe(0);
    const cookie = await sdk.createSessionToken("native:applicant");
    expect((await server.send(UPLOAD_PATH, { cookie }).response).status).toBe(200);
    expect(server.parsedCount()).toBe(1);
  });

  it("accepts native and Supabase platform cookies and preserves final MFA assurance checks", async () => {
    const server = await appServer();
    const native = await sdk.createSessionToken("native:applicant");
    const supabase = await sdk.createSessionToken("supabase:staff", { authLevel: "aal2" });
    expect((await server.send(UPLOAD_PATH, { cookie: native }).response).status).toBe(200);
    const verified = await server.send(UPLOAD_PATH, { cookie: supabase, data: JSON.stringify({ staffAccess: true }) }).response;
    expect(verified.status).toBe(200);
    expect(JSON.parse(verified.body).authLevel).toBe("aal2");
    expect((await server.send(UPLOAD_PATH, { cookie: native, data: JSON.stringify({ staffAccess: true }) }).response).status).toBe(403);
    revoked.mockResolvedValue(true);
    expect((await server.send(UPLOAD_PATH, { cookie: supabase, partial: true }).response).status).toBe(401);
  });

  it("allows only one in-flight upload per account and restores capacity after response completion", async () => {
    const server = await appServer();
    const cookie = await sdk.createSessionToken("native:applicant");
    const ready = once(server.events, "held");
    const holding = server.send(UPLOAD_PATH, { cookie, data: JSON.stringify({ hold: true }) });
    await ready;
    expect((await server.send(UPLOAD_PATH, { cookie }).response).status).toBe(429);
    const otherCookie = await sdk.createSessionToken("supabase:applicant");
    expect((await server.send(UPLOAD_PATH, { cookie: otherCookie }).response).status).toBe(200);
    server.held[0].json({ complete: true }); await holding.response;
    expect((await server.send(UPLOAD_PATH, { cookie }).response).status).toBe(200);
  });

  it("keeps the two-account ceiling and releases an aborted upload slot", async () => {
    const server = await appServer();
    const cookies = await Promise.all(["native:first", "supabase:second", "third"].map(id => sdk.createSessionToken(id)));
    const readyOne = once(server.events, "admitted");
    const first = server.send(UPLOAD_PATH, { cookie: cookies[0], partial: true });
    const firstDone = first.response.catch(() => null); await readyOne;
    const readyTwo = once(server.events, "admitted");
    const second = server.send(UPLOAD_PATH, { cookie: cookies[1], partial: true });
    const secondDone = second.response.catch(() => null); await readyTwo;
    expect((await server.send(UPLOAD_PATH, { cookie: cookies[2] }).response).status).toBe(503);
    first.client.destroy(); await firstDone;
    // Socket close is processed before a subsequent request can be admitted.
    await new Promise(resolve => setImmediate(resolve));
    expect((await server.send(UPLOAD_PATH, { cookie: cookies[2] }).response).status).toBe(200);
    second.client.destroy(); await secondDone;
  });

  it("ends slow authenticated bodies at the dedicated deadline and reclaims their account slot", async () => {
    const server = await appServer(40);
    const cookie = await sdk.createSessionToken("native:applicant");
    expect((await server.send(UPLOAD_PATH, { cookie, partial: true }).response).status).toBe(408);
    expect((await server.send(UPLOAD_PATH, { cookie }).response).status).toBe(200);
  });

  it("preserves CORS preflight without authenticating or parsing its unfinished body", async () => {
    const server = await appServer();
    const result = await server.send(UPLOAD_PATH, { method: "OPTIONS", partial: true }).response;
    expect(result.status).toBe(204);
    expect(result.headers["access-control-allow-origin"]).toBe("https://public.example");
    expect(result.headers["access-control-allow-credentials"]).toBe("true");
    expect(userLookup).not.toHaveBeenCalled();
    expect(server.parsedCount()).toBe(0);
  });

  it("rejects bad origins and oversized declared bodies early without changing other API routes", async () => {
    const server = await appServer();
    expect((await server.send(UPLOAD_PATH, { partial: true, headers: { origin: "https://evil.example" } }).response).status).toBe(403);
    expect((await server.send(UPLOAD_PATH, { partial: true, headers: { "content-length": String(22 * 1024 * 1024) } }).response).status).toBe(413);
    expect((await server.send("/api/ordinary", { method: "GET", data: "" }).response).status).toBe(200);
    expect(userLookup).not.toHaveBeenCalled();
  });
});
