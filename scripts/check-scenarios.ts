import { parseScenarios, scanTests } from "./scenarios.ts";

const strict = process.argv.includes("--strict");
const { scenarios, errors } = parseScenarios();
const ids = new Set(scenarios.map((s) => s.id));
const refs = scanTests();

for (const ref of refs) {
  if (!ids.has(ref.id))
    errors.push(`${ref.file}:${String(ref.line)}: unknown scenario ${ref.id}`);
}

const covered = new Set(refs.map((r) => r.id));
const uncovered = scenarios.filter((s) => !s.stretch && !covered.has(s.id));
for (const file of new Set(uncovered.map((s) => s.file))) {
  const list = uncovered
    .filter((s) => s.file === file)
    .map((s) => s.id)
    .sort();
  const line = `uncovered ${file}: ${list.join(" ")}`;
  if (strict) errors.push(line);
  else console.warn(`warn: ${line}`);
}

for (const e of errors) console.error(`error: ${e}`);
const required = scenarios.filter((s) => !s.stretch).length;
console.log(
  `${String(scenarios.length)} scenarios, ${String(required - uncovered.length)}/${String(required)} required covered, ${String(errors.length)} errors`,
);
process.exitCode = errors.length ? 1 : 0;
