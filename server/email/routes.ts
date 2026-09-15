import express, { type Express } from "express";
import { Webhook } from "svix";
import { mailConfig } from "./config";
import { verifyUnsubscribeToken } from "./crypto";
import { recordDeliveryEvent, suppressRecipient } from "./outbox";

/** Register before JSON parsing: webhook signatures bind the exact raw bytes.
 * These two scoped machine/token endpoints do not use cookie authentication.
 */
export function registerEmailRoutes(app: Express) {
  app.post(
    "/api/email/webhook/resend",
    express.raw({ type: "application/json", limit: "128kb" }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      let event: any;
      try {
        const config = mailConfig();
        if (!config?.webhookSecret) {
          res.status(503).json({ error: "Email callbacks are unavailable" });
          return;
        }
        if (!Buffer.isBuffer(req.body)) throw new Error("Raw body required");
        const id = req.headers["svix-id"],
          timestamp = req.headers["svix-timestamp"],
          signature = req.headers["svix-signature"];
        if (
          typeof id !== "string" ||
          typeof timestamp !== "string" ||
          typeof signature !== "string" ||
          id.length > 255 ||
          signature.length > 1024
        )
          throw new Error("Invalid callback headers");
        new Webhook(config.webhookSecret).verify(req.body.toString("utf8"), {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": signature,
        });
        // Svix2 verifies successfully with a void return by default. Parse only
        // after it authenticates the unchanged bytes; never before verification.
        event = JSON.parse(req.body.toString("utf8"));
        if (
          !event ||
          typeof event.type !== "string" ||
          typeof event.data?.email_id !== "string"
        )
          throw new Error("Invalid event");
      } catch {
        res.status(400).json({ error: "Invalid email callback" });
        return;
      }
      try {
        await recordDeliveryEvent(
          String(req.headers["svix-id"]),
          event.data.email_id,
          event.type
        );
        res.json({ received: true });
      } catch {
        res.status(503).json({ error: "Email callback storage unavailable" });
      }
    }
  );
  app.all(
    "/api/email/unsubscribe/:token",
    express.urlencoded({ extended: false, limit: "1kb" }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Referrer-Policy", "no-referrer");
      let hash: string | null = null;
      try {
        const config = mailConfig();
        if (config)
          hash = verifyUnsubscribeToken(String(req.params.token), config);
      } catch {
        /* Uniform invalid link. */
      }
      if (!hash) {
        res
          .status(400)
          .type("text/plain")
          .send("Invalid unsubscribe link / رابط إلغاء الاشتراك غير صالح");
        return;
      }
      if (req.method === "GET") {
        res
          .type("html")
          .send(
            '<!doctype html><html><body><h1>Optional email updates / التحديثات البريدية الاختيارية</h1><p>Account and research-decision messages are separate. / رسائل الحساب وقرارات البحث مستقلة عن التحديثات الاختيارية.</p><form method="post"><button type="submit">Unsubscribe / إلغاء الاشتراك</button></form></body></html>'
          );
        return;
      }
      if (req.method !== "POST") {
        res.status(405).end();
        return;
      }
      try {
        await suppressRecipient(hash, false, "unsubscribed");
        res
          .type("text/plain")
          .send(
            "You have unsubscribed from optional email updates. / تم إلغاء اشتراكك في التحديثات البريدية الاختيارية."
          );
      } catch {
        res
          .status(503)
          .type("text/plain")
          .send("Please retry later / يرجى المحاولة لاحقاً");
      }
    }
  );
}
