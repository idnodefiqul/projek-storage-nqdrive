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
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Manual chunk splitting — pisah vendor berat agar route Files tidak download chart lib
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-router": [
            "@tanstack/react-router",
            "@tanstack/react-query",
          ],
          "vendor-ui": ["framer-motion", "lucide-react"],
          "vendor-charts": ["recharts"],
          "vendor-echarts": ["echarts", "echarts-for-react"],
          "vendor-apex": ["apexcharts", "react-apexcharts"],
          "vendor-flow": ["@xyflow/react"],
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
