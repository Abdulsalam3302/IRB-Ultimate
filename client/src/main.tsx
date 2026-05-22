import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Optional Umami analytics — only injected when both env vars are set.
// Previously the script tag was hardcoded in index.html with literal
// %VITE_ANALYTICS_ENDPOINT% placeholders, which made every page request
// /%VITE_ANALYTICS_ENDPOINT%/umami → 500.
const ANALYTICS_ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const ANALYTICS_WEBSITE_ID = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (
  typeof window !== "undefined" &&
  typeof ANALYTICS_ENDPOINT === "string" &&
  ANALYTICS_ENDPOINT.length > 0 &&
  typeof ANALYTICS_WEBSITE_ID === "string" &&
  ANALYTICS_WEBSITE_ID.length > 0
) {
  const s = document.createElement("script");
  s.defer = true;
  s.src = `${ANALYTICS_ENDPOINT}/umami`;
  s.setAttribute("data-website-id", ANALYTICS_WEBSITE_ID);
  document.head.appendChild(s);
}

// SEO canonical — only when a public site URL is configured at build time.
const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL;
if (typeof window !== "undefined" && typeof PUBLIC_SITE_URL === "string" && PUBLIC_SITE_URL.length > 0) {
  const canonical = PUBLIC_SITE_URL.replace(/\/$/, "") + "/";
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", canonical);
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
