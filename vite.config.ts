import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// docs/DIRECTIVES.md → public/directives.md on every build and dev start (read at run time by the Guide).
import { directivesPlugin } from "./scripts/directives.mjs";

// Two layers: src/kit (generic) and src/app (this explainer). Kept in step with tsconfig "paths".
const dir = (p: string) => decodeURIComponent(new URL(p, import.meta.url).pathname);

// `base: "./"` keeps every asset reference relative, so the built `dist/`
// can be served from any sub-path (GitHub Pages, a file:// open, an artifact host).
export default defineConfig({
  plugins: [react(), directivesPlugin()],
  resolve: {
    alias: {
      "@kit": dir("./src/kit"),
      "@app": dir("./src/app"),
    },
  },
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Keep each chart backend in its own lazily loaded chunk so the
        // initial page stays small. The switchboard only loads what is used.
        manualChunks(id) {
          if (id.includes("node_modules/echarts") || id.includes("node_modules/zrender")) return "backend-echarts";
          if (id.includes("node_modules/plotly.js")) return "backend-plotly";
          if (id.includes("node_modules/vega")) return "backend-vega";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
