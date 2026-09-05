import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "vite";
import { PUBLIC_PAGES, PLATFORM_FAQS, getPageMetadata, getPublicSiteOrigin } from "../shared/seo";
import { GUIDELINE_DOCS } from "../shared/guidelineDocs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist/public");
const original = await readFile(path.join(output, "index.html"), "utf8");
const origin = getPublicSiteOrigin(process.env.VITE_PUBLIC_SITE_URL || loadEnv("production", root, "VITE_").VITE_PUBLIC_SITE_URL);
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");
await writeFile(path.join(output, "workspace.html"), original);
for (const page of PUBLIC_PAGES) {
  const metadata = getPageMetadata(page.path);
  let html = original.replace(/<title>[^<]*<\/title>/, `<title>${escape(metadata.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escape(metadata.description)}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/, `<meta name="robots" content="${origin ? metadata.robots : "noindex, nofollow"}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escape(metadata.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escape(metadata.description)}" />`);
  const canonical = origin ? `${origin}${page.path}` : null;
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: page.titleEn, description: page.descriptionEn, inLanguage: ["en", "ar"], ...(canonical ? { url: canonical } : {}) };
  html = html.replace("</head>", `${canonical ? `<link rel="canonical" href="${escape(canonical)}"/><meta property="og:url" content="${escape(canonical)}"/>` : ""}<script data-page-schema type="application/ld+json">${json(schema)}</script></head>`);
  const guideline = GUIDELINE_DOCS.find(doc => page.path === `/resources/guideline/${doc.slug}`);
  const sections = guideline?.sections.map(section => `<section><h2>${escape(section.titleEn)}</h2>${section.bodyEn.map(body => `<p>${escape(body)}</p>`).join("")}<div dir="rtl" lang="ar"><h2>${escape(section.titleAr)}</h2>${section.bodyAr.map(body => `<p>${escape(body)}</p>`).join("")}</div></section>`).join("") || "";
  const faqs = ["/", "/resources"].includes(page.path) ? PLATFORM_FAQS.map(f => `<section><h2>${escape(f.qEn)}</h2><p>${escape(f.aEn)}</p><div dir="rtl" lang="ar"><h2>${escape(f.qAr)}</h2><p>${escape(f.aAr)}</p></div></section>`).join("") : "";
  const nav = PUBLIC_PAGES.filter(p => !p.path.includes("guideline")).map(p => `<a href="${escape(p.path)}">${escape(p.titleEn)}</a>`).join(" · ");
  const content = `<main style="max-width:72rem;margin:auto;padding:2rem;font-family:system-ui;line-height:1.7"><nav aria-label="Public pages">${nav}</nav><h1>${escape(page.titleEn)}</h1><p>${escape(page.descriptionEn)}</p><div dir="rtl" lang="ar"><h2>${escape(page.titleAr)}</h2><p>${escape(page.descriptionAr)}</p></div>${sections}${faqs}<p><a href="/auth">Sign in / تسجيل الدخول</a></p></main>`;
  html = html.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
  const directory = page.path === "/" ? output : path.join(output, page.path);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html);
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? PUBLIC_PAGES.map(p => `<url><loc>${escape(origin + p.path)}</loc></url>`).join("") : ""}</urlset>\n`;
await writeFile(path.join(output, "sitemap.xml"), sitemap);
const robots = `User-agent: *\n${["/api/", "/uploads/", "/auth", "/admin", "/dashboard", "/apply/", "/application/", "/profile", "/reviews", "/chat-apply", "/registry", "/statistics", "/verify/", "/workspace.html"].map(p => `Disallow: ${p}`).join("\n")}\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : "Disallow: /\n"}`;
await writeFile(path.join(output, "robots.txt"), robots);
console.log(`Generated ${PUBLIC_PAGES.length} public pages; canonical origin ${origin ? "configured" : "missing (noindex)"}.`);
