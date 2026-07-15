#!/usr/bin/env node
/**
 * Probe the local (or BASE) server's AI provider via owner login + system.aiStatus.
 * Usage: PORT=3010 node scripts/check-ai.mjs
 * Env: OWNER_EMAIL / OWNER_PASSWORD (defaults match local bootstrap)
 */
const PORT = process.env.PORT ?? "3010";
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;
const email = process.env.OWNER_EMAIL ?? "owner@irb-ultimate.local";
const password = process.env.OWNER_PASSWORD ?? "OwnerAdmin!2026";

const jar = new Map();
function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...(opts.headers || {}),
    },
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return res;
}

const login = await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error("LOGIN_FAIL", login.status, await login.text());
  process.exit(1);
}

const statusRes = await request("/api/trpc/system.aiStatus");
const body = await statusRes.json();
const data = body?.result?.data?.json ?? body?.error?.json ?? body;
console.log(JSON.stringify(data, null, 2));
if (data?.ok) {
  console.log("\nAI_OK");
  process.exit(0);
}
console.log("\nAI_NOT_OK — top up LLM credits or set a working LLM_API_KEY on the host.");
process.exit(2);
