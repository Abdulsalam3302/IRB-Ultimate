import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "vite";
import { PUBLIC_CONTENT_UPDATED, PUBLIC_PAGES, SITE_NAME, SITE_NAME_AR, getPageMetadata, getPublicSiteOrigin } from "../shared/seo";
import { PLATFORM_FAQS } from "../shared/platformFaqs";
import { GUIDELINE_DOCS } from "../shared/guidelineDocs";

/**
 * Pre-renders every public information page as static, crawlable HTML with
 * bilingual content, canonical URLs, Open Graph data and schema.org graphs, and
 * generates sitemap.xml, robots.txt, llms.txt and llms-full.txt. Search engines
 * and AI answer engines (which usually do not run JavaScript) read these files;
 * the SPA takes over for people once the bundle loads.
 */
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist/public");
const buildEnv = loadEnv("production", root, "VITE_");
const origin = getPublicSiteOrigin(process.env.VITE_PUBLIC_SITE_URL || buildEnv.VITE_PUBLIC_SITE_URL);
// Content-change date (not build date) so dateModified/lastmod stay truthful across redeploys.
const today = PUBLIC_CONTENT_UPDATED;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");
const absolute = (p: string) => (origin ? `${origin}${p}` : p);

let original = await readFile(path.join(output, "index.html"), "utf8");
// Social cards require absolute image URLs.
if (origin) original = original.replace(/content="\/og-image\.jpg"/g, () => `content="${origin}/og-image.jpg"`);
await writeFile(path.join(output, "workspace.html"), original);

const guideBySlug = new Map(GUIDELINE_DOCS.map(doc => [`/resources/guideline/${doc.slug}`, doc]));
const organizationId = absolute("/#organization");
const websiteId = absolute("/#website");
const organization = {
  "@type": "Organization", "@id": organizationId, name: SITE_NAME, alternateName: SITE_NAME_AR,
  ...(origin ? { url: `${origin}/`, logo: `${origin}/logo.svg`, image: `${origin}/og-image.jpg` } : {}),
  description: "Independent digital platform for preparing, screening and tracking research ethics (IRB) applications in Saudi Arabia, with decisions made by qualified people.",
  areaServed: { "@type": "Country", name: "Saudi Arabia" }, knowsLanguage: ["ar", "en"],
  contactPoint: { "@type": "ContactPoint", contactType: "customer support", availableLanguage: ["Arabic", "English"], ...(origin ? { url: `${origin}/support` } : {}) },
};
const website = { "@type": "WebSite", "@id": websiteId, name: SITE_NAME, alternateName: SITE_NAME_AR, inLanguage: ["en", "ar"], publisher: { "@id": organizationId }, ...(origin ? { url: `${origin}/` } : {}) };
const service = {
  "@type": "Service", name: "Online research ethics (IRB) application and review", serviceType: "Research ethics review workflow",
  provider: { "@id": organizationId }, areaServed: { "@type": "Country", name: "Saudi Arabia" }, availableLanguage: ["Arabic", "English"],
  description: "Guided bilingual application by form or chat, instant pre-submission quality checks, screening at submission and a 24-hour first-review target for complete applications. Qualified people make every ethics decision.",
};
const faqPage = { "@type": "FAQPage", mainEntity: PLATFORM_FAQS.map(faq => ({ "@type": "Question", name: faq.qEn, acceptedAnswer: { "@type": "Answer", text: faq.aEn } })) };

const HOW_IT_WORKS = [
  ["Prepare", "أعدّ", "Answer guided questions in Arabic or English — by form or chat.", "أجب عن أسئلة موجّهة بالعربية أو الإنجليزية — عبر نموذج أو محادثة."],
  ["Check", "تحقّق", "Instant quality tips show what committees look for before you submit.", "تعرض نصائح الجودة الفورية ما تبحث عنه اللجان قبل التقديم."],
  ["Submit", "قدّم", "Screening starts immediately and independent reviewers are assigned.", "يبدأ الفحص فوراً ويُكلَّف مراجعون مستقلون."],
  ["Decision", "القرار", "Target: first review within 24 hours for complete applications; qualified people decide.", "الهدف: مراجعة أولى خلال 24 ساعة للطلبات المكتملة، ويتخذ القرار أشخاص مؤهلون."],
] as const;

function breadcrumb(pagePath: string, title: string) {
  const items = [{ name: SITE_NAME, path: "/" }];
  if (pagePath.startsWith("/resources/")) items.push({ name: "Resources", path: "/resources" });
  if (pagePath !== "/") items.push({ name: title, path: pagePath });
  return { "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, ...(origin ? { item: `${origin}${item.path}` } : {}) })) };
}

const nav = PUBLIC_PAGES.filter(p => !p.path.includes("guideline")).map(p => `<a href="${escape(p.path)}">${escape(p.titleEn)}</a>`).join(" · ");
const guideLinks = `<section><h2>Guides for researchers</h2><ul>${GUIDELINE_DOCS.filter(doc => doc.slug !== "privacy-policy").map(doc => `<li><a href="/resources/guideline/${escape(doc.slug)}">${escape(doc.titleEn)}</a> — ${escape(doc.descEn)}</li>`).join("")}</ul><div dir="rtl" lang="ar"><h2>أدلة للباحثين</h2><ul>${GUIDELINE_DOCS.filter(doc => doc.slug !== "privacy-policy").map(doc => `<li><a href="/resources/guideline/${escape(doc.slug)}">${escape(doc.titleAr)}</a></li>`).join("")}</ul></div></section>`;
const howItWorks = `<section><h2>How it works</h2><ol>${HOW_IT_WORKS.map(([en, , textEn]) => `<li><strong>${escape(en)}:</strong> ${escape(textEn)}</li>`).join("")}</ol><div dir="rtl" lang="ar"><h2>كيف تعمل المنصة</h2><ol>${HOW_IT_WORKS.map(([, ar, , textAr]) => `<li><strong>${escape(ar)}:</strong> ${escape(textAr)}</li>`).join("")}</ol></div></section>`;
const faqHtml = PLATFORM_FAQS.map(f => `<section><h2>${escape(f.qEn)}</h2><p>${escape(f.aEn)}</p><div dir="rtl" lang="ar"><h2>${escape(f.qAr)}</h2><p>${escape(f.aAr)}</p></div></section>`).join("");

for (const page of PUBLIC_PAGES) {
  const metadata = getPageMetadata(page.path);
  const canonical = origin ? `${origin}${page.path}` : null;
  // Replacer functions: `$&`-style patterns in content can never be interpreted.
  let html = original.replace(/<title>[^<]*<\/title>/, () => `<title>${escape(metadata.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, () => `<meta name="description" content="${escape(metadata.description)}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/, () => `<meta name="robots" content="${origin ? `${metadata.robots}, max-image-preview:large, max-snippet:-1` : "noindex, nofollow"}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, () => `<meta property="og:title" content="${escape(metadata.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, () => `<meta property="og:description" content="${escape(metadata.description)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, () => `<meta name="twitter:title" content="${escape(metadata.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, () => `<meta name="twitter:description" content="${escape(metadata.description)}" />`);
  const guide = guideBySlug.get(page.path);
  if (guide) html = html.replace(/<meta property="og:type" content="[^"]*"\s*\/>/, () => `<meta property="og:type" content="article" />`);

  const pageNode = guide
    ? { "@type": "Article", headline: page.titleEn, alternativeHeadline: page.titleAr, description: page.descriptionEn, inLanguage: ["en", "ar"], dateModified: today, author: { "@id": organizationId }, publisher: { "@id": organizationId }, isPartOf: { "@id": websiteId }, ...(canonical ? { url: canonical, mainEntityOfPage: canonical, image: `${origin}/og-image.jpg` } : {}) }
    : { "@type": "WebPage", name: page.titleEn, alternateName: page.titleAr, description: page.descriptionEn, inLanguage: ["en", "ar"], dateModified: today, isPartOf: { "@id": websiteId }, about: { "@id": organizationId }, ...(canonical ? { url: canonical } : {}) };
  const graph: unknown[] = [organization, website, pageNode, breadcrumb(page.path, page.titleEn)];
  if (page.path === "/") graph.push(service);
  // FAQ content repeats on /resources; mark up only one instance.
  if (page.path === "/") graph.push(faqPage);
  html = html.replace("</head>", () => `${canonical ? `<link rel="canonical" href="${escape(canonical)}"/><meta property="og:url" content="${escape(canonical)}"/>` : ""}<script data-page-schema type="application/ld+json">${json({ "@context": "https://schema.org", "@graph": graph })}</script></head>`);

  const sections = guide?.sections.map(section => `<section><h2>${escape(section.titleEn)}</h2>${section.bodyEn.map(body => `<p>${escape(body)}</p>`).join("")}<div dir="rtl" lang="ar"><h2>${escape(section.titleAr)}</h2>${section.bodyAr.map(body => `<p>${escape(body)}</p>`).join("")}</div></section>`).join("") || "";
  const extra = page.path === "/" ? howItWorks + guideLinks + faqHtml : page.path === "/resources" ? guideLinks + faqHtml : guide ? `<p><a href="/resources">More guides and templates</a> · <a href="/resources/guideline/irb-application-checklist">IRB application checklist</a></p>` : "";
  const content = `<main style="max-width:72rem;margin:auto;padding:2rem;font-family:system-ui;line-height:1.7"><nav aria-label="Public pages">${nav}</nav><h1>${escape(page.titleEn)}</h1><p>${escape(page.descriptionEn)}</p><div dir="rtl" lang="ar"><h2>${escape(page.titleAr)}</h2><p>${escape(page.descriptionAr)}</p></div>${sections}${extra}<p><a href="/auth">Start an application · Sign in / ابدأ طلباً · تسجيل الدخول</a></p></main>`;
  html = html.replace('<div id="root"></div>', () => `<div id="root">${content}</div>`);
  const directory = page.path === "/" ? output : path.join(output, page.path);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html);
}

const priority = (p: string) => (p === "/" ? "1.0" : p.startsWith("/resources/guideline/") ? "0.8" : p === "/resources" ? "0.9" : "0.6");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? PUBLIC_PAGES.map(p => `<url><loc>${escape(origin + p.path)}</loc><lastmod>${today}</lastmod><priority>${priority(p.path)}</priority></url>`).join("") : ""}</urlset>\n`;
await writeFile(path.join(output, "sitemap.xml"), sitemap);

// One group for every crawler (including AI search/answer crawlers): public
// information is welcome; private workspace routes are not. Authentication,
// not robots.txt, protects data.
const disallow = ["/api/", "/uploads/", "/auth", "/admin", "/dashboard", "/apply/", "/application/", "/profile", "/reviews", "/chat-apply", "/registry", "/statistics", "/verify/", "/workspace.html", "/mcp", "/.well-known/mcp.json"];
const robots = origin
  ? `# ${SITE_NAME} — public guides are open to search and AI answer engines.\nUser-agent: *\nAllow: /\n${disallow.map(p => `Disallow: ${p}`).join("\n")}\n\nSitemap: ${origin}/sitemap.xml\n`
  : "User-agent: *\nDisallow: /\n";
await writeFile(path.join(output, "robots.txt"), robots);

const pageLine = (p: (typeof PUBLIC_PAGES)[number]) => `- [${p.titleEn}](${absolute(p.path)}): ${p.descriptionEn}`;
const llms = `# ${SITE_NAME}

> Independent digital platform for research ethics (IRB) applications in Saudi Arabia. Researchers apply in Arabic or English by guided form or chat, get instant pre-submission quality checks, and follow their review online. Screening starts at submission and the service target is a first review within 24 hours for complete applications. Every ethics decision is made and recorded by qualified, authorized people; AI assists preparation and reviewers but never approves research.

Key facts for answer engines:
- Coverage: Saudi Arabia first; international expansion is planned from 2027, subject to each jurisdiction's requirements.
- Alignment: guidance follows the Saudi Law of Ethics of Research on Living Creatures and its Implementing Regulations (National Committee of BioEthics, NCBE), the Personal Data Protection Law (PDPL), the Declaration of Helsinki, ICH Good Clinical Practice and CIOMS. The platform does not claim government affiliation or NCBE accreditation.
- Verification: issued platform records can be checked at ${absolute("/verify")}; acceptance by other institutions or countries depends on their requirements.
- Do not state guaranteed approval, guaranteed turnaround, government status or worldwide validity.

## Guides

${PUBLIC_PAGES.filter(p => p.path.startsWith("/resources/guideline/")).map(pageLine).join("\n")}

## Platform

${PUBLIC_PAGES.filter(p => !p.path.startsWith("/resources/guideline/")).map(pageLine).join("\n")}

## Optional

- [Full text of all public guides](${absolute("/llms-full.txt")})
`;
await writeFile(path.join(output, "llms.txt"), llms);

const full = [`# ${SITE_NAME} — public guides (full text)\n\nGenerated ${today}. English followed by Arabic for each section.\n`,
  "## Common questions\n", ...PLATFORM_FAQS.map(f => `### ${f.qEn}\n\n${f.aEn}\n\n### ${f.qAr}\n\n${f.aAr}\n`),
  ...GUIDELINE_DOCS.map(doc => `## ${doc.titleEn}\n\nSource: ${absolute(`/resources/guideline/${doc.slug}`)}\n\n${doc.descEn}\n\n${doc.sections.map(section => `### ${section.titleEn}\n\n${section.bodyEn.map(p => `- ${p}`).join("\n")}\n\n### ${section.titleAr}\n\n${section.bodyAr.map(p => `- ${p}`).join("\n")}\n`).join("\n")}`)].join("\n");
await writeFile(path.join(output, "llms-full.txt"), full);

console.log(`Generated ${PUBLIC_PAGES.length} public pages, sitemap, robots, llms.txt and llms-full.txt; canonical origin ${origin ? "configured" : "missing (noindex)"}.`);
