#!/usr/bin/env node
/**
 * Notify IndexNow search engines (Bing, Yandex, Seznam, Naver and others) that the
 * public pages listed in the live sitemap changed. The key is public by design and
 * is served at /<key>.txt. Usage: node scripts/indexnow-submit.mjs [https://irb-sa.org]
 */
import { readFileSync } from "node:fs";

const origin = (process.argv[2] || process.env.PUBLIC_SITE_URL || "https://irb-sa.org").replace(/\/$/, "");
const key = readFileSync(new URL("./indexnow-key.txt", import.meta.url), "utf8").trim();
if (!/^[0-9a-f]{32}$/.test(key)) throw new Error("Invalid IndexNow key file");
const served = await fetch(`${origin}/${key}.txt`).then(r => (r.ok ? r.text() : "")).catch(() => "");
if (served.trim() !== key) throw new Error(`Key file is not live at ${origin}/${key}.txt yet`);
const sitemap = await fetch(`${origin}/sitemap.xml`).then(r => r.text());
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]).filter(url => url.startsWith(origin));
if (!urlList.length) throw new Error("No sitemap URLs found");
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList }),
});
console.log(JSON.stringify({ status: response.status, submitted: urlList.length }));
if (![200, 202].includes(response.status)) process.exitCode = 1;
