import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin runs worker/ in workerd during `vite dev`.
// Build for an environment with CLOUDFLARE_ENV=preview.
// `--mode e2e` (E2E only): includes the test-login route and uses its own local D1.
export default defineConfig(({ mode }) => {
  const e2e = mode === "e2e";
  return {
    define: { __TEST_LOGIN__: JSON.stringify(e2e) },
    // Never leave a test-login build where `wrangler deploy` would pick it up.
    build: { outDir: e2e ? "dist-e2e" : "dist" },
    plugins: [
      react(),
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
