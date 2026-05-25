#!/usr/bin/env node
/**
 * Merge API rewrites into vercel.json so Vercel proxies /api/* to Railway.
 * Usage: node scripts/update-vercel-rewrites.mjs https://your-app.up.railway.app
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dir, "..");
const vercelPath = path.join(root, "vercel.json");

const rawUrl = process.argv[2];
if (!rawUrl) {
  console.error("Usage: node scripts/update-vercel-rewrites.mjs <RAILWAY_API_URL>");
  process.exit(1);
}

const base = rawUrl.replace(/\/$/, "");
const config = {
  experimentalServices: {
    web: {
      routePrefix: "/",
      framework: "vite",
      buildCommand: "npm run build",
    },
  },
  rewrites: [
    { source: "/api/:path*", destination: `${base}/api/:path*` },
    { source: "/uploads/:path*", destination: `${base}/uploads/:path*` },
  ],
};

fs.writeFileSync(vercelPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Updated ${vercelPath} → ${base}`);
