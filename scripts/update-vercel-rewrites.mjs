#!/usr/bin/env node
/**
 * Point Vercel SPA rewrites at the Render API origin.
 * Usage: node scripts/update-vercel-rewrites.mjs https://irb-saudi-arabia.onrender.com
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dir, "..");
const vercelPath = path.join(root, "vercel.json");

const rawUrl = process.argv[2];
if (!rawUrl) {
  console.error("Usage: node scripts/update-vercel-rewrites.mjs <RENDER_API_URL>");
  process.exit(1);
}

const base = rawUrl.replace(/\/$/, "");
let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
} catch {
  /* fresh */
}

const config = {
  ...existing,
  installCommand: existing.installCommand ?? "pnpm install --frozen-lockfile",
  buildCommand: existing.buildCommand ?? "pnpm run build",
  outputDirectory: existing.outputDirectory ?? "dist/public",
  rewrites: [
    { source: "/api/:path*", destination: `${base}/api/:path*` },
    { source: "/uploads/:path*", destination: `${base}/uploads/:path*` },
    {
      source: "/((?!assets/).*)",
      destination: "/index.html",
    },
  ],
  redirects: existing.redirects ?? [
    { source: "/sign-in", destination: "/auth", permanent: false },
    { source: "/login", destination: "/auth", permanent: false },
  ],
};

fs.writeFileSync(vercelPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Updated ${vercelPath} → API origin ${base}`);
