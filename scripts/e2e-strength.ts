import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { sample, spliceMutant } from "./mutants.ts";
import {
  type Coverage,
  COVERAGE_FILE,
  type CoverageMutant,
  sha1,
} from "./stryker-coverage.ts";
import {
  playwright,
  prepareWorktree,
  resetWorktree,
  run,
  WT,
} from "./worktree.ts";

// Usage: pnpm e2e:strength [--sample 50] [--seed 1]. PLAN §10 "E2E seam".
// Random Stryker mutants (from `pnpm scenarios:attribution`'s coverage.json) against Playwright
// alone: the share it kills estimates how much the E2E suite checks on its own. No LLM.
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const size = Number(flag("--sample") ?? 50);
const seed = Number(flag("--seed") ?? 1);

type Status = "killed" | "survived" | "invalid";
interface Result extends Pick<
  CoverageMutant,
  "file" | "line" | "mutator" | "replacement"
> {
  status: Status;
  seconds: number;
}

const coverage = JSON.parse(readFileSync(COVERAGE_FILE, "utf8")) as Coverage;
const commit = prepareWorktree();

// Positions are only valid for the file contents Stryker saw.
const stale = Object.entries(coverage.hashes)
  .filter(([file, hash]) => sha1(readFileSync(join(WT, file), "utf8")) !== hash)
  .map(([file]) => file);
if (stale.length)
  console.warn(
    `warn: ${String(stale.length)} file(s) changed since coverage.json; their mutants are skipped. Rerun pnpm scenarios:attribution`,
  );
const picked = sample(
  coverage.mutants.filter((m) => !stale.includes(m.file)),
  size,
  seed,
);

if (!playwright()) {
  console.error("Playwright fails unpatched; nothing to measure");
  process.exit(1);
}

const out = join(dirname(COVERAGE_FILE), "e2e-strength.json");
const results: Result[] = [];
for (const [i, m] of picked.entries()) {
  const path = join(WT, m.file);
  writeFileSync(path, spliceMutant(readFileSync(path, "utf8"), m));
  const started = Date.now();
  let status: Status = "killed";
  // Stryker doesn't type-check its mutants; a survivor that doesn't compile isn't a real gap.
  if (playwright())
    status = run("pnpm", ["typecheck"]).ok ? "survived" : "invalid";
  resetWorktree();
  const { file, line, mutator, replacement } = m;
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ file, line, mutator, replacement, status, seconds });
  console.log(
    `${String(i + 1)}/${String(picked.length)} ${status}: ${file}:${String(line)} ${mutator}`,
  );
  // Per mutant, so an interrupted run keeps what's done.
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ commit, seed, results }, null, 1));
}

const count = (s: Status) => results.filter((r) => r.status === s).length;
const valid = count("killed") + count("survived");
console.log(
  `E2E killed ${String(count("killed"))} of ${String(valid)} mutants (${String(Math.round((100 * count("killed")) / Math.max(valid, 1)))}%); ${String(count("invalid"))} didn't type-check`,
);
for (const r of results.filter((x) => x.status === "survived"))
  console.log(
    `  survived: ${r.file}:${String(r.line)} ${r.mutator} → ${JSON.stringify(r.replacement)}`,
  );
console.log("wrote reports/fidelity/e2e-strength.json");
