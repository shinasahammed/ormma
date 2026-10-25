import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8")) as { version: string };

// Tauri 2 + Vite: fixed dev port, strict port, ignore env files that
// could leak into the WebView on Linux packaging.
// Multi-page build: main dashboard (index.html) + companion popup entry
// (popup.html, loaded by the borderless `reminder-popup` window).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        popup: resolve(root, "popup.html"),
      },
    },
  },
});
