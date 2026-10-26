import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

import { scenarioTags } from "./scripts/scenarios.ts";

export default defineConfig({
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
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./apps/web/wrangler.jsonc" },
            miniflare: {
              bindings: {
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
