import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "./scenarios.ts";

/**
 * The persistent worktree that `scenarios:mutants` and `e2e:strength` patch (PLAN §10). Beside
 * Stryker's temp dir, which Stryker deletes: same ignores, own lifetime. One run at a time.
 */
export const WT = join(ROOT, ".stryker-tmp-mutants");

export const run = (
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

/** Resets the worktree to HEAD (install once, then reuse); returns that commit. */
export function prepareWorktree() {
  const head = run("git", ["rev-parse", "HEAD"], ROOT).out.trim();
  if (!existsSync(WT))
    run("git", ["worktree", "add", "--detach", WT, head], ROOT);
  run("git", ["checkout", "-q", "--detach", "--force", head]);
  run("git", ["clean", "-fdq"]);
  const install = run("pnpm", ["install", "--frozen-lockfile", "--offline"]);
  if (!install.ok) throw new Error(`worktree install failed:\n${install.out}`);
  return head;
}

/** Undoes a patch. */
export function resetWorktree() {
  run("git", ["checkout", "-q", "--", "."]);
  run("git", ["clean", "-fdq"]);
}

/** Playwright on one phone; CI=1 so a server already on :4173 (the unpatched build) isn't reused. */
export const playwright = (argv: string[] = []) =>
  run(
    "pnpm",
    [
      "--filter",
      "@mmr/e2e",
      "exec",
      "playwright",
      "test",
      "--project",
      "pixel-7",
      ...argv,
    ],
    WT,
    { CI: "1" },
  ).ok;
