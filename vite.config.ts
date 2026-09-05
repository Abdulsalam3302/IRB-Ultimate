import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Route pages lazy-load; keep one React vendor chunk so Radix/tRPC/etc.
        // share the same React 19 singleton (splitting causes blank-page crashes).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/recharts/") ||
            id.includes("/d3-") ||
            id.includes("/victory-")
          )
            return "vendor-charts";
          if (
            id.includes("/zod/") ||
            id.includes("/superjson/") ||
            id.includes("/date-fns/") ||
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/class-variance-authority/")
          )
            return "vendor-utils";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
