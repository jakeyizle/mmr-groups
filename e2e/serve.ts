// Playwright webServer: fresh local D1 with the demo group, e2e build (test login on), `vite preview`.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const PORT = 4173;
const web = join(import.meta.dirname, "..", "apps", "web");
const state = ".wrangler/e2e";
const run = (cmd: string) => {
  execSync(cmd, { cwd: web, stdio: "inherit" });
};

rmSync(join(web, state), { recursive: true, force: true });
run("pnpm exec vite build --mode e2e");
run(`pnpm exec wrangler d1 migrations apply DB --local --persist-to ${state}`);
run(`node ../../scripts/seed-demo.ts --local --persist-to ${state}`);
run(`pnpm exec vite preview --mode e2e --port ${String(PORT)} --strictPort`);
