import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FileRank } from "./attribution.ts";
import {
  applyEdits,
  type Mutant,
  MUTANTS_SCHEMA,
  mutantsPrompt,
  scenarioSection,
  type Status,
  VERDICT_SCHEMA,
  verdictPrompt,
} from "./mutants.ts";
import { parseScenarios, ROOT, scanTests } from "./scenarios.ts";

// Usage: pnpm scenarios:mutants <IDs…> [--count 3] [--model sonnet] [--no-e2e] [--patches file.json]
// PLAN §10 "Scenario mutants". Patches apply to HEAD in a persistent worktree: commit first.
// --patches takes `{ "<ID>": Mutant[] }` and skips generation (no LLM).
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const count = Number(flag("--count") ?? 3);
const model = flag("--model") ?? "sonnet";
const patchesFile = flag("--patches");
const e2e = !args.includes("--no-e2e");
const ids = args.filter((a) => !a.startsWith("--"));
if (!ids.length) {
  console.error("usage: pnpm scenarios:mutants <IDs…>");
  process.exit(1);
}

// Beside Stryker's temp dir, which Stryker deletes: same ignores, own lifetime.
const WT = join(ROOT, ".stryker-tmp-mutants");
const FIDELITY = join(ROOT, "reports", "fidelity");
const MAX_CONTEXT = 60_000;

const run = (
  cmd: string,
  argv: string[],
  cwd = WT,
  env: Record<string, string> = {},
) => {
  const res = spawnSync(cmd, argv, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 26,
    env: { ...process.env, ...env },
    shell: process.platform === "win32" && cmd !== "claude",
  });
  return { ok: res.status === 0, out: `${res.stdout}${res.stderr}` };
};

/** Structured output of a headless Claude Code call (the developer's subscription). */
function claude(prompt: string, schema: object): unknown {
  const res = spawnSync(
    "claude",
    [
      "-p",
      "--model",
      model,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(schema),
      "--tools",
      "",
      "--no-session-persistence",
    ],
    { input: prompt, encoding: "utf8", maxBuffer: 1 << 26 },
  );
  const out = JSON.parse(res.stdout || "{}") as {
    is_error?: boolean;
    structured_output?: unknown;
    result?: string;
  };
  if (res.status !== 0 || out.is_error || !out.structured_output)
    throw new Error(`claude -p failed: ${out.result ?? res.stderr}`);
  return out.structured_output;
}

// One worktree, reused: install once, then reset to HEAD per run and per patch.
const head = run("git", ["rev-parse", "HEAD"], ROOT).out.trim();
if (!existsSync(WT))
  run("git", ["worktree", "add", "--detach", WT, head], ROOT);
run("git", ["checkout", "-q", "--detach", "--force", head]);
run("git", ["clean", "-fdq"]);
const install = run("pnpm", ["install", "--frozen-lockfile", "--offline"]);
if (!install.ok) throw new Error(`worktree install failed:\n${install.out}`);
const reset = () => {
  run("git", ["checkout", "-q", "--", "."]);
  run("git", ["clean", "-fdq"]);
};

const { scenarios } = parseScenarios();
const refs = scanTests();
const attribution = existsSync(join(FIDELITY, "attribution.json"))
  ? (JSON.parse(
      readFileSync(join(FIDELITY, "attribution.json"), "utf8"),
    ) as Record<string, FileRank[]>)
  : undefined;
const supplied = patchesFile
  ? (JSON.parse(readFileSync(patchesFile, "utf8")) as Record<string, Mutant[]>)
  : undefined;

/** Runs the scenario's tagged tests in the worktree; which level failed, if any. */
function testsFail(id: string, withE2e: boolean) {
  // Only files carrying the tag: collecting the whole suite costs minutes.
  const files = [
    ...new Set(
      refs
        .filter((r) => r.id === id && !r.file.startsWith("e2e/"))
        .map((r) => r.file),
    ),
  ];
  if (
    !run("pnpm", ["exec", "vitest", "run", ...files, `--tags-filter=${id}`]).ok
  )
    return "vitest";
  // CI=1: never reuse a server already on :4173 (it would serve the unpatched build).
  if (
    withE2e &&
    !run(
      "pnpm",
      [
        "--filter",
        "@mmr/e2e",
        "exec",
        "playwright",
        "test",
        "--grep",
        `@${id}`,
        "--project",
        "pixel-7",
      ],
      WT,
      { CI: "1" },
    ).ok
  )
    return "e2e";
  return undefined;
}

interface Result extends Mutant {
  status: Status;
  by?: string;
  reason?: string;
}
const report: Record<string, Result[]> = {};

for (const id of ids) {
  const meta = scenarios.find((s) => s.id === id);
  if (!meta) throw new Error(`unknown scenario ${id}`);
  const section = scenarioSection(
    readFileSync(join(ROOT, "scenarios", meta.file), "utf8"),
    id,
  );
  if (!section) throw new Error(`no section for ${id}`);
  const withE2e =
    e2e && refs.some((r) => r.id === id && r.file.startsWith("e2e/"));

  const baseline = testsFail(id, withE2e);
  if (baseline) {
    console.error(`${id}: tagged ${baseline} tests fail unpatched; skipped`);
    continue;
  }

  // The scenario's most specific files first, within a context budget.
  const files = new Map<string, string>();
  let size = 0;
  for (const { file } of attribution?.[id] ?? []) {
    const text = readFileSync(join(WT, file), "utf8");
    if (files.size >= 6 || size + text.length > MAX_CONTEXT) break;
    files.set(file, text);
    size += text.length;
  }
  let mutants = supplied?.[id];
  if (!mutants) {
    if (!files.size) {
      console.error(
        `${id}: no attributed files; rerun pnpm scenarios:attribution. Skipped`,
      );
      continue;
    }
    mutants = (
      claude(mutantsPrompt(section, files, count), MUTANTS_SCHEMA) as {
        mutants: Mutant[];
      }
    ).mutants;
  }

  const results: Result[] = [];
  for (const mutant of mutants) {
    const touched = new Map(
      mutant.edits.map((e) => [
        e.file,
        existsSync(join(WT, e.file))
          ? readFileSync(join(WT, e.file), "utf8")
          : "",
      ]),
    );
    const applied = applyEdits(touched, mutant.edits);
    if ("error" in applied) {
      results.push({
        ...mutant,
        status: "apply-failed",
        reason: applied.error,
      });
      continue;
    }
    for (const [file, text] of applied.files)
      writeFileSync(join(WT, file), text);
    const by = testsFail(id, withE2e);
    let result: Result;
    if (by) result = { ...mutant, status: "killed", by };
    else if (!run("pnpm", ["typecheck"]).ok)
      result = { ...mutant, status: "invalid", reason: "does not type-check" };
    else if (supplied) result = { ...mutant, status: "gap" };
    else {
      const verdict = claude(
        verdictPrompt(section, mutant),
        VERDICT_SCHEMA,
      ) as {
        breaksClause: boolean;
        reason: string;
      };
      result = {
        ...mutant,
        status: verdict.breaksClause ? "gap" : "equivalent",
        reason: verdict.reason,
      };
    }
    reset();
    results.push(result);
  }
  report[id] = results;
  // Per scenario, so a later failure keeps what's done.
  mkdirSync(FIDELITY, { recursive: true });
  writeFileSync(
    join(FIDELITY, "mutants.json"),
    JSON.stringify(report, null, 1),
  );

  const tally = (s: Status) => results.filter((r) => r.status === s).length;
  console.log(
    `${id}: ${String(tally("killed"))} killed, ${String(tally("gap"))} gap, ${String(tally("equivalent"))} equivalent, ${String(tally("invalid") + tally("apply-failed"))} unusable`,
  );
  for (const r of results.filter((x) => x.status === "gap"))
    console.log(`  gap: "${r.clause}": ${r.rationale}`);
}

console.log("wrote reports/fidelity/mutants.json");
