import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// `base: "./"` keeps asset URLs relative so the build works on GitHub Pages
// (served from /<repo>/) as well as any static host root.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 3000, host: true },
});
