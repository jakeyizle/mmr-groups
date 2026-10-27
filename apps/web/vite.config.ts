import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The Cloudflare plugin runs worker/ in workerd during `vite dev`.
// Build for an environment with CLOUDFLARE_ENV=preview.
// `--mode e2e` (E2E only): includes the test-login route and uses its own local D1.
export default defineConfig(({ mode }) => {
  const e2e = mode === "e2e";
  return {
    define: { __TEST_LOGIN__: JSON.stringify(e2e) },
    // Never leave a test-login build where `wrangler deploy` would pick it up.
    build: { outDir: e2e ? "dist-e2e" : "dist" },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    plugins: [
      // Must run before the React plugin.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      VitePWA({
        // Tests run against a build without a service worker, so nothing is cached.
        disable: e2e,
        registerType: "autoUpdate",
        includeAssets: ["icon.svg", "apple-touch-icon.png"],
        manifest: {
          name: "MMR Groups",
          short_name: "MMR",
          description: "Ratings and match history for your regular group.",
          theme_color: "#0b0b0b",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // App shell only: API responses are never cached, so data and auth stay live.
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [],
        },
      }),
      cloudflare(
        e2e
          ? {
              persistState: { path: ".wrangler/e2e" },
              config: { vars: { ENABLE_TEST_LOGIN: "true" } },
            }
          : {},
      ),
    ],
  };
});
