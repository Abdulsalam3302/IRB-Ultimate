# Marketing, SEO, AEO, GEO — IRB Saudi Arabia

Honest discoverability only. No fake backlinks, purchased rankings, invented domains, or paid Okara/Peec seats.

## Live properties (real)

| Surface | URL |
| --- | --- |
| Public SPA | https://irb-saudi-arabia.vercel.app |
| API (Render) | https://irb-saudi-arabia.onrender.com |
| Source | https://github.com/Abdulsalam3302/IRB-Ultimate |

## On-site (shipped)

- `client/index.html` — title, description, Open Graph, JSON-LD Organization + WebApplication
- `/sitemap.xml` and `/robots.txt`
- `/llms.txt` — assistant-oriented summary for AEO/GEO crawlers
- `/.well-known/mcp.json` — WebMCP discovery
- Canonical URL when `VITE_PUBLIC_SITE_URL` is set at build time

## Google Tag Manager (plan only until a real container exists)

Do **not** inject GTM with a placeholder. The client loads GTM **only** when `VITE_GTM_ID` matches `GTM-XXXX`.

1. Create a GTM container for `irb-saudi-arabia.vercel.app` (not a third-party domain).
2. Set `VITE_GTM_ID` on the Vercel production environment (example: `GTM-ABCDEFG`).
3. Set the same value as `VITE_GTM_ID` or `GTM_ID` on Render so CSP `script-src` / `connect-src` / `img-src` allow `https://www.googletagmanager.com` and `https://www.google-analytics.com`.
4. Publish a container version with: page view, scroll, file download (certificates), and form-start on `/auth`. No PII in event parameters (no email, IRB numbers, or protocol titles).
5. Link GA4 only after a real GA4 property exists. Do not fabricate measurement IDs.

## GEO / AEO

- Keep answers in `llms.txt` and JSON-LD aligned with the live product (official NBCE digital IRB, Saudi-based, Dr. Abdulsalam Aleid).
- Public registry and `/verify` are the citation surfaces for issued IRB numbers.
- Do not claim additional country domains, paid directory listings, or third-party “authority” tools that are not contracted.

## Off-site (operator, not code)

- Google Search Console for `irb-saudi-arabia.vercel.app` — submit `/sitemap.xml`.
- Optional: Bing Webmaster Tools with the same sitemap.
- LinkedIn of Dr. Abdulsalam Aleid may link to the live site. No paid link schemes.
