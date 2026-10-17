import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useT } from "@/contexts/LanguageContext";
import { PUBLIC_PATHS, getWorkspaceMetadata } from "@shared/publicPaths";

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  );
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
  const firstEffect = useRef(true);
  useEffect(() => {
    let active = true;
    const barePath = location.split(/[?#]/, 1)[0] || "/";
    const initialCanonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );
    const keepStaticMetadata =
      firstEffect.current &&
      PUBLIC_PATHS.includes(barePath) &&
      initialCanonical != null &&
      new URL(initialCanonical.href).pathname === barePath;
    firstEffect.current = false;
    const apply = (
      page: ReturnType<typeof getWorkspaceMetadata>,
      origin: string | null
    ) => {
      document.title = page.title;
      setMeta("name", "description", page.description);
      setMeta("name", "robots", page.robots);
      setMeta("property", "og:title", page.title);
      setMeta("property", "og:description", page.description);
      setMeta("property", "og:locale", lang === "ar" ? "ar_SA" : "en_US");
      setMeta(
        "property",
        "og:locale:alternate",
        lang === "ar" ? "en_US" : "ar_SA"
      );
      setMeta("name", "twitter:title", page.title);
      setMeta("name", "twitter:description", page.description);
      let canonical = document.head.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]'
      );
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
    };
    // Keep the matching initial static page; never carry its discovery tags to
    // another route while rich public metadata is still downloading. Private
    // metadata clears synchronously, regardless of download availability.
    if (!keepStaticMetadata) {
      document.head
        .querySelectorAll("script[data-page-schema]")
        .forEach(element => element.remove());
      apply(getWorkspaceMetadata(location, lang), null);
    }
    if (PUBLIC_PATHS.includes(barePath)) {
      // Static public HTML already contains full search metadata. Private pages
      // do not need to download all bilingual guide descriptions at startup.
      void import("@shared/seo")
        .then(({ getPageMetadata, getPublicSiteOrigin }) => {
          if (active)
            apply(
              getPageMetadata(location, lang),
              getPublicSiteOrigin(import.meta.env.VITE_PUBLIC_SITE_URL)
            );
        })
        .catch(() => {
          // Matching initial static metadata is retained; navigated routes stay
          // conservatively noindex rather than displaying another page's tags.
        });
    }
    return () => {
      active = false;
    };
  }, [location, lang]);
  return null;
}
