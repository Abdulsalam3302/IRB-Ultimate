import { defineConfig } from "vitest/config";
import path from "path";
// Tests never load developer .env: it may point at the production research database.
const databaseUrl = process.env.DATABASE_URL || "";
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !/_test$/.test(target.pathname)) {
    throw new Error("Tests require an isolated loopback database whose name ends with _test.");
  }
}

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/**/*.test.ts", "shared/**/*.test.ts"],
    maxWorkers: 4,
    env: {
      ...process.env as Record<string, string>,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: "isolated-vitest-session-secret-not-production",
      VITE_APP_ID: "irb-test",
      LLM_API_KEY: "", BUILT_IN_FORGE_API_KEY: "", BUILT_IN_FORGE_API_URL: "",
      SMTP_HOST: "", SENTRY_DSN: "", S3_BUCKET: "", OAUTH_SERVER_URL: "",
      SUPABASE_URL: "", VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "",
      SUPABASE_SECRET_KEY: "", SUPABASE_STORAGE_BUCKET: "", STORAGE_PROVIDER: "auto",
    },
  },
});
