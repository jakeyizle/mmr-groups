import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { scenarioTags } from "./scripts/scenarios.ts";

export default defineConfig({
  // By path, not through node_modules: Stryker's sandbox links node_modules back to the
  // original tree, so cross-package imports would otherwise run unmutated code.
  resolve: {
    alias: {
      "@mmr/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    tags: scenarioTags(),
    projects: [
      {
        extends: true,
        test: { name: "core", include: ["packages/core/src/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "scripts", include: ["scripts/**/*.test.ts"] },
      },
      {
        extends: true,
        plugins: [react()],
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
          },
        },
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/src/**/*.test.{ts,tsx}"],
          setupFiles: ["./apps/web/test/setup.ts"],
        },
      },
      {
        extends: true,
        // The Worker entry is loaded as in production: no test-login route.
        define: { __TEST_LOGIN__: "false" },
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./apps/web/wrangler.jsonc" },
            miniflare: {
              bindings: {
                GOOGLE_CLIENT_ID: "test-client",
                GOOGLE_CLIENT_SECRET: "test-secret",
                SITE_ADMIN_EMAILS: "Admin@Example.com, other@example.com",
                TEST_MIGRATIONS: await readD1Migrations(
                  "./packages/api/migrations",
                ),
              },
            },
          })),
        ],
        test: {
          name: "api",
          include: ["packages/api/src/**/*.test.ts"],
          setupFiles: ["./packages/api/test/setup.ts"],
        },
      },
    ],
  },
});
