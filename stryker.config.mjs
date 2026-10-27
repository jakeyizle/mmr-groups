import { MUTATE } from "./scripts/mutate.ts";

/** PLAN §10. A full run audits everything; `pnpm mutate:changed` narrows `mutate` to a diff. */
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // pnpm's layout hides plugins from Stryker's auto-discovery.
  plugins: ["@stryker-mutator/vitest-runner", "./scripts/stryker-noise.ts"],
  ignorers: ["noise"],
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  mutate: MUTATE,
  // Each api mutant boots workerd; more runners than this starve each other into timeouts.
  concurrency: 4,
  timeoutMS: 30_000,
  reporters: ["clear-text", "json", "html"],
  clearTextReporter: { allowColor: false, logTests: false },
  tempDirName: ".stryker-tmp",
};
