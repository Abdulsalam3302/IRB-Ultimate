import express from "express";
import type { Server } from "node:http";
import { Webhook } from "svix";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const store = vi.hoisted(() => ({ event: vi.fn(), suppress: vi.fn() }));
vi.mock("./outbox", () => ({
  recordDeliveryEvent: store.event,
  suppressRecipient: store.suppress,
}));
import { registerEmailRoutes } from "./routes";
import { mailConfig } from "./config";
import { recipientHash, unsubscribeToken } from "./crypto";
let server: Server, base: string;
const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
beforeAll(async () => {
  const app = express();
  registerEmailRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MAIL_PROVIDER", "resend");
  vi.stubEnv("MAIL_ENCRYPTION_KEY", "78".repeat(32));
  vi.stubEnv("RESEND_API_KEY", "synthetic");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  vi.stubEnv("PUBLIC_APP_URL", "https://irb.example.test");
  store.event.mockResolvedValue(undefined);
  store.suppress.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
});
async function webhook(
  options: { tamper?: boolean; stale?: boolean; unsigned?: boolean } = {}
) {
  const id = "msg_synthetic",
    timestamp = new Date(Date.now() - (options.stale ? 3600000 : 0)),
    body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "synthetic-email-id" },
    });
  const signature = new Webhook(secret).sign(id, timestamp, body);
  return fetch(`${base}/api/email/webhook/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.unsigned
        ? {}
        : {
            "svix-id": id,
            "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
            "svix-signature": signature,
          }),
    },
    body: options.tamper ? body.replace("delivered", "bounced") : body,
  });
}
describe("signed email callbacks and deliberate unsubscribe", () => {
  it("accepts authentic raw bytes and persists only bounded event identity", async () => {
    expect((await webhook()).status).toBe(200);
    expect(store.event).toHaveBeenCalledExactlyOnceWith(
      "msg_synthetic",
      "synthetic-email-id",
      "email.delivered"
    );
  });
  it.each([{ tamper: true }, { stale: true }, { unsigned: true }])(
    "rejects invalid callbacks %j before storage",
    async options => {
      expect((await webhook(options)).status).toBe(400);
      expect(store.event).not.toHaveBeenCalled();
    }
  );
  it("returns retryable unavailable when durable callback storage fails", async () => {
    store.event.mockRejectedValue(new Error("private database detail"));
    const response = await webhook();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database detail");
  });
  it("never unsubscribes on a link scanner GET, but accepts deliberate one-click POST", async () => {
    const config = mailConfig()!,
      hash = recipientHash("synthetic@example.test", config),
      token = unsubscribeToken(hash, config),
      url = `${base}/api/email/unsubscribe/${token}`;
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await page.text()).toContain('method="post"');
    expect(store.suppress).not.toHaveBeenCalled();
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        })
      ).status
    ).toBe(200);
    expect(store.suppress).toHaveBeenCalledExactlyOnceWith(
      hash,
      false,
      "unsubscribed"
    );
  });
  it("rejects forged unsubscribe tokens without disclosing a recipient", async () => {
    const response = await fetch(
      `${base}/api/email/unsubscribe/${"00".repeat(32)}.${"11".repeat(32)}`,
      { method: "POST" }
    );
    expect(response.status).toBe(400);
    expect(store.suppress).not.toHaveBeenCalled();
  });
});
