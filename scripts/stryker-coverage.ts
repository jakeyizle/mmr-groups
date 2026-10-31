import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import type { DryRunCompletedEvent } from "@stryker-mutator/api/report";
import type { MutationTestingPlanReadyEvent } from "@stryker-mutator/api/report";
import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

/**
 * Stryker reporter for `scenarios:attribution` (PLAN §10): once the dry run has measured per-test
 * coverage and the mutants are planned, writes both to `COVERAGE_FILE` and exits, so no mutant runs.
 */
export const COVERAGE_FILE = join(
  import.meta.dirname,
  "..",
  "reports",
  "fidelity",
  "coverage.json",
);

export interface CoverageTest {
  id: string;
  name: string;
  file: string;
  line: number;
}
export interface CoverageMutant {
  file: string;
  line: number;
  static: boolean;
  coveredBy: string[];
}
export interface Coverage {
  tests: CoverageTest[];
  mutants: CoverageMutant[];
}

/** Repo-relative POSIX path; Stryker reports test files inside its sandbox copy. */
export function repoPath(file: string, root: string) {
  const rel = relative(root, file).split(sep).join("/");
  return rel.replace(/^\.stryker-tmp[^/]*\/sandbox[^/]*\//, "");
}

const root = join(import.meta.dirname, "..");
let tests: CoverageTest[] = [];

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Reporter, "coverage", {
    onDryRunCompleted({ result }: DryRunCompletedEvent) {
      tests = result.tests.map((t) => ({
        id: t.id,
        name: t.name,
        file: t.fileName ? repoPath(t.fileName, root) : "",
        // Stryker positions are 0-based.
        line: (t.startPosition?.line ?? -1) + 1,
      }));
    },
    onMutationTestingPlanReady({ mutantPlans }: MutationTestingPlanReadyEvent) {
      const coverage: Coverage = {
        tests,
        mutants: mutantPlans.map(({ mutant }) => ({
          file: repoPath(mutant.fileName, root),
          line: mutant.location.start.line + 1,
          static: mutant.static ?? false,
          coveredBy: mutant.coveredBy ?? [],
        })),
      };
      mkdirSync(dirname(COVERAGE_FILE), { recursive: true });
      writeFileSync(COVERAGE_FILE, JSON.stringify(coverage));
      process.exit(0);
    },
  }),
];
