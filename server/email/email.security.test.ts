import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const smtp = vi.hoisted(() => ({
  create: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
}));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }));
import { mailConfig, normalizedEmail } from "./config";
import {
  encryptMail,
  decryptMail,
  recipientHash,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "./crypto";
import { brandedMail, validatePdfAttachment } from "./templates";
import { sendMail, transportHash } from "./transport";

beforeEach(() => {
  vi.stubEnv("MAIL_PROVIDER", "resend");
  vi.stubEnv("MAIL_ENCRYPTION_KEY", "12".repeat(32));
  vi.stubEnv("RESEND_API_KEY", "synthetic-api-key");
  vi.stubEnv("PUBLIC_APP_URL", "https://irb.example.test");
  vi.stubEnv("MAIL_FROM", "committee@irb-sa.org");
  smtp.create.mockReturnValue({ sendMail: smtp.send, close: smtp.close });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const payload = () =>
  brandedMail(
    {
      to: "recipient@example.test",
      subjectEn: "Test",
      subjectAr: "اختبار",
      titleEn: "Private account update",
      titleAr: "تحديث خاص بالحساب",
      bodyEn: "Synthetic account notice",
      bodyAr: "إشعار تجريبي للحساب",
      link: "https://irb.example.test/dashboard",
    },
    mailConfig()!
  );
const id = "d269887d-dc3e-4012-a478-91835f717e56";

describe("encrypted private email and bilingual branding", () => {
  it("defaults disabled and refuses missing encryption or invalid provider configuration", () => {
    vi.stubEnv("MAIL_PROVIDER", "disabled");
    expect(mailConfig()).toBeNull();
    vi.stubEnv("MAIL_PROVIDER", "resend");
    vi.stubEnv("MAIL_ENCRYPTION_KEY", "");
    expect(() => mailConfig()).toThrow();
  });
  it.each([
    "a@example.test\r\nBcc:other@example.test",
    "x\0@example.test",
    "Name <user@example.test>",
  ])("rejects mailbox header injection %j", value => {
    expect(() => normalizedEmail(value)).toThrow();
  });
  it("encrypts address, reset link and attachments, binding ciphertext to one outbox ID", () => {
    const config = mailConfig()!,
      secret = {
        to: "recipient@example.test",
        reset: "https://irb.example.test/reset-password?token=private",
        pdf: "synthetic",
      };
    const encrypted = encryptMail(secret, id, config);
    expect(encrypted).not.toContain("recipient");
    expect(encrypted).not.toContain("token");
    expect(decryptMail(encrypted, id, config)).toEqual(secret);
    expect(() => decryptMail(encrypted, "another-id", config)).toThrow();
    expect(() =>
      decryptMail(encrypted, id, { ...config, key: Buffer.alloc(32, 8) })
    ).toThrow();
    const parts = encrypted.split(".");
    parts[3] = Buffer.alloc(16).toString("base64");
    expect(() => decryptMail(parts.join("."), id, config)).toThrow();
  });
  it("hashes normalized recipients and accepts only authentic non-identifying unsubscribe tokens", () => {
    const config = mailConfig()!,
      hash = recipientHash("RECIPIENT@example.test", config),
      token = unsubscribeToken(hash, config);
    expect(hash).toBe(recipientHash("recipient@example.test", config));
    expect(token).not.toContain("@");
    expect(verifyUnsubscribeToken(token, config)).toBe(hash);
    expect(
      verifyUnsubscribeToken(`${hash}.${"00".repeat(32)}`, config)
    ).toBeNull();
    expect(verifyUnsubscribeToken("garbage", config)).toBeNull();
  });
  it("escapes supplied content and includes Arabic direction, English, logo, signature and plain text", () => {
    const mail = brandedMail(
      {
        to: "recipient@example.test",
        subjectEn: "Hello",
        subjectAr: "مرحباً",
        titleEn: "<script>bad</script>",
        titleAr: "عنوان",
        bodyEn: '<a href="https://hostile.test">click</a>',
        bodyAr: "نص الرسالة",
      },
      mailConfig()!
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain('lang="ar" dir="rtl"');
    expect(mail.html).toContain("/email-logo.png");
    expect(mail.html).toContain("committee@irb-sa.org");
    expect(mail.text).toContain("نص الرسالة");
  });
  it("rejects off-platform action links and injected subjects", () => {
    const input = {
      to: "recipient@example.test",
      subjectEn: "Safe",
      subjectAr: "عنوان",
      titleEn: "Title",
      titleAr: "عنوان",
      bodyEn: "Body",
      bodyAr: "نص",
    };
    expect(() =>
      brandedMail(
        { ...input, link: "https://attacker.test/reset" },
        mailConfig()!
      )
    ).toThrow();
    expect(() =>
      brandedMail({ ...input, subjectEn: "x\r\nBcc: injected" }, mailConfig()!)
    ).toThrow();
  });
  it("accepts bounded actual PDF bytes only, never remote paths or HTML renamed PDF", () => {
    expect(
      validatePdfAttachment({
        filename: "decision.pdf",
        contentType: "application/pdf",
        content: Buffer.from("%PDF-1.4\nsynthetic"),
      })
    ).toMatchObject({ filename: "decision.pdf" });
    for (const content of [
      Buffer.from("<html>fake</html>"),
      Buffer.alloc(4 * 1024 * 1024 + 1),
    ])
      expect(() =>
        validatePdfAttachment({
          filename: "decision.pdf",
          contentType: "application/pdf",
          content,
        })
      ).toThrow();
    expect(() =>
      validatePdfAttachment({
        filename: "../decision.pdf",
        contentType: "application/pdf",
        content: Buffer.from("%PDF-1.4\nsynthetic"),
      })
    ).toThrow();
  });
});
describe("bounded provider transports and delivery evidence", () => {
  it("sends one private recipient and an idempotency key, reports acceptance only", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "provider-id" }), { status: 200 })
      );
    const result = await sendMail(payload(), id, mailConfig()!);
    expect(result).toEqual({ outcome: "accepted", providerId: "provider-id" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options!.redirect).toBe("error");
    expect(options!.headers).toMatchObject({
      "Idempotency-Key": `irb-email/${id}`,
    });
    const body = JSON.parse(String(options!.body));
    expect(body.to).toEqual(["recipient@example.test"]);
    expect(body).not.toHaveProperty("cc");
    expect(body).not.toHaveProperty("bcc");
  });
  it.each([
    [429, "retry"],
    [500, "retry"],
    [401, "failed"],
    [422, "failed"],
  ])(
    "classifies HTTP%s without exposing provider body",
    async (status, outcome) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ message: "private-provider-secret" }), {
          status: Number(status),
        })
      );
      const result = await sendMail(payload(), id, mailConfig()!);
      expect(result.outcome).toBe(outcome);
      expect(JSON.stringify(result)).not.toContain("private-provider-secret");
    }
  );
  it("keeps timeout and malformed acceptance uncertain for idempotent reconciliation", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("synthetic timeout"));
    expect(await sendMail(payload(), id, mailConfig()!)).toMatchObject({
      outcome: "retry",
      ambiguous: true,
    });
    fetch.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendMail(payload(), id, mailConfig()!)).toMatchObject({
      outcome: "retry",
      ambiguous: true,
    });
  });
  it("binds an outbox to the exact configured provider credentials and sender", () => {
    const config = mailConfig()!,
      hash = transportHash(config);
    expect(
      transportHash({ ...config, apiKey: "different-account-key" })
    ).not.toBe(hash);
    expect(transportHash({ ...config, from: "another@example.test" })).not.toBe(
      hash
    );
  });
  it.each([
    ["DATA", undefined, "unknown"],
    ["CONN", undefined, "retry"],
    ["DATA", 451, "retry"],
    ["RCPT TO", 550, "failed"],
  ])("handles SMTP %s/%s safely", async (command, responseCode, outcome) => {
    vi.stubEnv("MAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "synthetic");
    vi.stubEnv("SMTP_PASSWORD", "synthetic");
    smtp.send.mockRejectedValue(
      Object.assign(new Error("private provider text"), {
        command,
        responseCode,
      })
    );
    expect(await sendMail(payload(), id, mailConfig()!)).toMatchObject({
      outcome,
    });
    expect(smtp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        tls: expect.objectContaining({ rejectUnauthorized: true }),
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      })
    );
    expect(smtp.close).toHaveBeenCalled();
  });
});
