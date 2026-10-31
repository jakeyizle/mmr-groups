import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { createVitest } from "vitest/node";

import { attribute, type TaggedTest } from "./attribution.ts";
import { ROOT } from "./scenarios.ts";
import { type Coverage, COVERAGE_FILE } from "./stryker-coverage.ts";

// Usage: pnpm scenarios:attribution [--reuse] [IDs…]. PLAN §10 "Attribution".
// --reuse skips the Stryker dry run (minutes) and reads the last coverage.json.
const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith("--"));

if (!args.includes("--reuse") || !existsSync(COVERAGE_FILE)) {
  // The coverage reporter exits Stryker once mutants are planned: nothing is mutated.
  const res = spawnSync(
    "pnpm",
    [
      "exec",
      "stryker",
      "run",
      "--plugins",
      "@stryker-mutator/vitest-runner,./scripts/stryker-noise.ts,./scripts/stryker-coverage.ts",
      "--reporters",
      "coverage",
      "--dryRunTimeoutMinutes",
      "30",
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (res.status !== 0) process.exit(res.status ?? 1);
}
const coverage = JSON.parse(readFileSync(COVERAGE_FILE, "utf8")) as Coverage;

// Collecting runs no tests; `tags` include those of enclosing `describe`s.
const vitest = await createVitest("test", {
  watch: false,
  includeTaskLocation: true,
});
const tagged: TaggedTest[] = [];
for (const module of (await vitest.collect()).testModules)
  for (const test of module.children.allTests())
    tagged.push({
      file: relative(ROOT, module.moduleId).split(sep).join("/"),
      line: test.location?.line ?? -1,
      tags: test.tags,
    });
await vitest.close();

const { byScenario, unmatched } = attribute(coverage, tagged);
const out = join(dirname(COVERAGE_FILE), "attribution.json");
writeFileSync(out, JSON.stringify(Object.fromEntries(byScenario), null, 1));

for (const [id, ranks] of [...byScenario].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (ids.length && !ids.includes(id)) continue;
  const top = ranks
    .slice(0, 3)
    .map((r) => `${r.file} ${r.share.toFixed(2)}`)
    .join(", ");
  console.log(`${id}: ${top || "(covers no mutated file)"}`);
}
if (unmatched.length)
  console.warn(
    `warn: ${String(unmatched.length)} Stryker test(s) matched no collected Vitest test`,
  );
console.log(`wrote ${relative(ROOT, out)}`);
