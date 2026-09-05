import { useEffect } from "react";
import { useLocation } from "wouter";
import { useT } from "@/contexts/LanguageContext";
import { getPageMetadata, getPublicSiteOrigin } from "@shared/seo";

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

/** Updates metadata on SPA navigation; static public HTML is generated at build time. */
export function RouteMetadata() {
  const [location] = useLocation();
  const { lang } = useT();
  useEffect(() => {
    const page = getPageMetadata(location, lang);
    document.title = page.title;
    setMeta("name", "description", page.description);
    setMeta("name", "robots", page.robots);
    setMeta("property", "og:title", page.title);
    setMeta("property", "og:description", page.description);
    setMeta("property", "og:locale", lang === "ar" ? "ar_SA" : "en_US");
    setMeta("property", "og:locale:alternate", lang === "ar" ? "en_US" : "ar_SA");
    setMeta("name", "twitter:title", page.title);
    setMeta("name", "twitter:description", page.description);
    const origin = getPublicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (origin && page.indexable) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = `${origin}${page.path}`;
      setMeta("property", "og:url", canonical.href);
    } else {
      canonical?.remove();
      document.head.querySelector('meta[property="og:url"]')?.remove();
    }
    // Build-time page schema must not describe a different route after navigation.
    document.head.querySelectorAll('script[data-page-schema]').forEach(element => element.remove());
  }, [location, lang]);
  return null;
}
