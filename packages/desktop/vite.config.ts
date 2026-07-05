import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8")
);

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@user-docs": path.resolve(__dirname, "../../user-docs"),
    },
  },
  server: {
    // Dedicated port (not Vite's default 5173) so Promptwright can run
    // alongside other local Vite apps (e.g. framecast) without colliding.
    port: 5273,
    strictPort: true,
  },
});
