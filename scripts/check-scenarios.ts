import { coverageGaps, parseScenarios, scanTests } from "./scenarios.ts";

const strict = process.argv.includes("--strict");
const { scenarios, errors } = parseScenarios();
const ids = new Set(scenarios.map((s) => s.id));
const refs = scanTests();

for (const ref of refs) {
  if (!ids.has(ref.id))
    errors.push(`${ref.file}:${String(ref.line)}: unknown scenario ${ref.id}`);
}

const { uncovered, e2eOnly } = coverageGaps(scenarios, refs);
for (const [label, gaps] of [
  ["uncovered", uncovered],
  ["e2e-only", e2eOnly],
] as const) {
  for (const file of new Set(gaps.map((s) => s.file))) {
    const list = gaps
      .filter((s) => s.file === file)
      .map((s) => s.id)
      .sort();
    const line = `${label} ${file}: ${list.join(" ")}`;
    if (strict) errors.push(line);
    else console.warn(`warn: ${line}`);
  }
}

for (const e of errors) console.error(`error: ${e}`);
const required = scenarios.filter((s) => !s.stretch).length;
console.log(
  `${String(scenarios.length)} scenarios, ${String(required - uncovered.length)}/${String(required)} required covered, ${String(errors.length)} errors`,
);
process.exitCode = errors.length ? 1 : 0;
