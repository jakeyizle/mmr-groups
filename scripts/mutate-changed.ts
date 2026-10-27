import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  addedDisables,
  changedRanges,
  isMutable,
  mutateArgs,
} from "./mutate.ts";

// Usage: pnpm mutate:changed [stryker args…]; base branch from MUTATE_BASE (default origin/main).
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 26 });

const base = git(
  "merge-base",
  process.env.MUTATE_BASE ?? "origin/main",
  "HEAD",
).trim();
// Against the working tree, so uncommitted edits count locally; untracked files count as added.
let diff = git(
  "diff",
  "-U0",
  "-M",
  "--diff-filter=AMR",
  "--no-color",
  "--no-ext-diff",
  base,
);
for (const file of git("ls-files", "--others", "--exclude-standard").split(
  "\n",
)) {
  if (!isMutable(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  diff += `\n+++ b/${file}\n@@ -0,0 +1,${String(lines.length)} @@\n${lines.map((l) => `+${l}`).join("\n")}`;
}
const ranges = changedRanges(diff);

const disables = addedDisables(diff);
for (const d of disables)
  console.log(
    `${d.reason ? "disable" : "error: disable without a reason"}: ${d.file}: ${d.text}`,
  );
if (disables.some((d) => !d.reason)) process.exit(1);

interface Mutant {
  status: string;
  mutatorName: string;
  replacement?: string;
  location: { start: { line: number; column: number }; end: { line: number } };
}
interface Report {
  files: Record<string, { mutants: Mutant[] }>;
}

/** Runs Stryker on the given ranges; returns the mutants it couldn't kill. */
function run(mutate: string[]) {
  const res = spawnSync(
    "pnpm",
    [
      "exec",
      "stryker",
      "run",
      "--mutate",
      mutate.join(","),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (res.status !== 0) process.exit(res.status ?? 1);
  const report = JSON.parse(
    readFileSync("reports/mutation/mutation.json", "utf8"),
  ) as Report;
  return Object.entries(report.files).flatMap(([file, { mutants }]) =>
    mutants
      .filter((m) => m.status === "Survived" || m.status === "NoCoverage")
      .map((m) => ({ file: file.replaceAll("\\", "/"), ...m })),
  );
}

const args = mutateArgs(ranges);
if (args.length === 0) {
  console.log("mutate:changed: no mutable lines changed");
  process.exit(0);
}
let left = run(args);
if (left.length) {
  // One rerun of just the surviving lines absorbs workerd flakiness.
  console.log(
    `mutate:changed: rerunning ${String(left.length)} surviving mutant(s)`,
  );
  left = run([
    ...new Set(
      left.map(
        (m) =>
          `${m.file}:${String(m.location.start.line)}-${String(m.location.end.line)}`,
      ),
    ),
  ]);
}
for (const m of left)
  console.error(
    `error: ${m.status} ${m.mutatorName} ${m.file}:${String(m.location.start.line)}:${String(m.location.start.column)} → ${m.replacement ?? ""}`,
  );
console.log(
  left.length
    ? `mutate:changed: ${String(left.length)} mutant(s) not killed; add a test or a reasoned Stryker disable`
    : "mutate:changed: all mutants killed",
);
process.exitCode = left.length ? 1 : 0;
