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
    ],
  },
});
