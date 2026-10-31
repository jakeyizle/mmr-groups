import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import type { DryRunCompletedEvent } from "@stryker-mutator/api/report";
import type { MutationTestingPlanReadyEvent } from "@stryker-mutator/api/report";
import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

/**
 * Stryker reporter for `scenarios:attribution` (PLAN §10): once the dry run has measured per-test
 * coverage and the mutants are planned, writes both to `COVERAGE_FILE` and exits, so no mutant runs.
 * `e2e:strength` reads the mutants back to apply them itself.
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
  mutator: string;
  replacement: string;
  /** 0-based [line, column], end exclusive. */
  start: [number, number];
  end: [number, number];
}
export interface Coverage {
  tests: CoverageTest[];
  mutants: CoverageMutant[];
  /** sha1 of each mutated file as Stryker saw it, to detect stale positions. */
  hashes: Record<string, string>;
}

export const sha1 = (text: string) =>
  createHash("sha1").update(text).digest("hex");

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
      const mutants = mutantPlans.map(({ mutant }) => ({
        file: repoPath(mutant.fileName, root),
        line: mutant.location.start.line + 1,
        static: mutant.static ?? false,
        coveredBy: mutant.coveredBy ?? [],
        mutator: mutant.mutatorName,
        replacement: mutant.replacement,
        start: [mutant.location.start.line, mutant.location.start.column],
        end: [mutant.location.end.line, mutant.location.end.column],
      })) satisfies CoverageMutant[];
      const hashes = Object.fromEntries(
        [...new Set(mutants.map((m) => m.file))].map((f) => [
          f,
          sha1(readFileSync(join(root, f), "utf8")),
        ]),
      );
      const coverage: Coverage = { tests, mutants, hashes };
      mkdirSync(dirname(COVERAGE_FILE), { recursive: true });
      writeFileSync(COVERAGE_FILE, JSON.stringify(coverage));
      process.exit(0);
    },
  }),
];
