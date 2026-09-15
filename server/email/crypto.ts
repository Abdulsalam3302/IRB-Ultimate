import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { normalizedEmail, type MailConfig } from "./config";

export function recipientHash(email: string, config: MailConfig): string {
  return createHmac("sha256", config.key)
    .update(`recipient:${normalizedEmail(email)}`)
    .digest("hex");
}
export function encryptMail(
  payload: unknown,
  id: string,
  config: MailConfig
): string {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", config.key, nonce);
  cipher.setAAD(Buffer.from(`irb-email-v1:${id}`));
  const plain = Buffer.from(JSON.stringify(payload));
  try {
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return [
      "v1",
      nonce.toString("base64"),
      encrypted.toString("base64"),
      cipher.getAuthTag().toString("base64"),
    ].join(".");
  } finally {
    plain.fill(0);
  }
}
export function decryptMail(
  payload: string,
  id: string,
  config: MailConfig
): unknown {
  const [version, nonce, body, tag, extra] = payload.split(".");
  if (version !== "v1" || !nonce || !body || !tag || extra)
    throw new Error("Invalid encrypted email");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    config.key,
    Buffer.from(nonce, "base64")
  );
  decipher.setAAD(Buffer.from(`irb-email-v1:${id}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(body, "base64")),
    decipher.final(),
  ]);
  try {
    return JSON.parse(plain.toString("utf8"));
  } finally {
    plain.fill(0);
  }
}
export function unsubscribeToken(hash: string, config: MailConfig): string {
  return `${hash}.${createHmac("sha256", config.key).update(`unsubscribe-v1:${hash}`).digest("hex")}`;
}
export function verifyUnsubscribeToken(
  token: string,
  config: MailConfig
): string | null {
  if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) return null;
  const [hash, signature] = token.split(".");
  return timingSafeEqual(
    Buffer.from(unsubscribeToken(hash, config).split(".")[1], "hex"),
    Buffer.from(signature, "hex")
  )
    ? hash
    : null;
}
