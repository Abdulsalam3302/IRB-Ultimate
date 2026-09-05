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

const origin = new URL(rawUrl);
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected an HTTPS backend origin without credentials or a path.");
const base = origin.origin;
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
  rewrites: existing.rewrites.map(row => {
    if (row.source === "/api/:path*") return { ...row, destination: `${base}/api/:path*` };
    if (row.source === "/uploads/:path*") return { ...row, destination: `${base}/uploads/:path*` };
    if (row.source === "/.well-known/mcp.json") return { ...row, destination: `${base}/.well-known/mcp.json` };
    return row;
  }),
  redirects: existing.redirects ?? [
    { source: "/sign-in", destination: "/auth", permanent: false },
    { source: "/login", destination: "/auth", permanent: false },
  ],
};

fs.writeFileSync(vercelPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Updated ${vercelPath} → API origin ${base}`);
