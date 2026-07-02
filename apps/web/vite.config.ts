import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [
    // Must run before @vitejs/plugin-react so generated route files are picked up correctly.
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // ── Build optimizations ────────────────────────────────────────────
  build: {
    // Inline gambar kecil (<4KB) sebagai data URI — zero HTTP request
    assetsInlineLimit: 4096,
    // Pisahkan CSS per-route agar hanya load CSS yang dibutuhkan
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Manual chunk splitting — vendor libraries di-cache terpisah
        // sehingga update app code tidak invalidate cache vendor
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-router": [
            "@tanstack/react-router",
            "@tanstack/react-query",
          ],
          "vendor-ui": ["framer-motion", "lucide-react"],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the local worker during development (wrangler dev default port).
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
