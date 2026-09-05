import { readFile, writeFile } from "node:fs/promises";
import { PUBLIC_PAGES } from "../shared/seo";
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const upstream = config.rewrites.filter((row: { source: string }) => ["/api/:path*", "/uploads/:path*", "/.well-known/mcp.json"].includes(row.source));
const fallback = config.rewrites.at(-1);
config.rewrites = [...upstream, ...PUBLIC_PAGES.map(page => ({ source: page.path, destination: page.path === "/" ? "/index.html" : `${page.path}/index.html` })), fallback];
await writeFile("vercel.json", JSON.stringify(config, null, 2) + "\n");
console.log(`Configured ${PUBLIC_PAGES.length} edge public routes.`);
