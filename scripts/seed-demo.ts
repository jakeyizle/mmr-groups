// `pnpm db:seed:demo [--local | --remote] [--env preview] [--persist-to <dir>]`:
// inserts the demo group if missing (idempotent). Arguments go to `wrangler d1 execute`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { demoSql, generateDemo, mondayUtc } from "./demo.ts";

const dir = mkdtempSync(join(tmpdir(), "mmr-demo-"));
const file = join(dir, "demo.sql");
try {
  writeFileSync(file, demoSql(generateDemo(mondayUtc(new Date()))));
  const args = process.argv.slice(2);
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--file",
      file,
      "--yes",
      ...args,
    ],
    {
      cwd: join(import.meta.dirname, "..", "apps", "web"),
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
