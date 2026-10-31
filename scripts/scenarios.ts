import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface Scenario {
  id: string;
  title: string;
  file: string;
  stretch: boolean;
}

export interface TagRef {
  id: string;
  file: string;
  line: number;
}

export const ROOT = join(import.meta.dirname, "..");
const SCENARIOS_DIR = join(ROOT, "scenarios");

const HEADING = /^### ([A-Z]+)-(\d{3}): (.+)$/;
// `tags: [...]` (Vitest) or `tag: '@ID'` / `tag: [...]` (Playwright)
const TAG_OPTION = /\btags?\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g;
const TAG_ID = /@?\b([A-Z]+-\d{3})\b/g;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".wrangler",
  "scripts",
]);
const TEST_FILE = /\.(test|spec)\.tsx?$/;

export function parseScenarioFile(file: string, text: string) {
  const scenarios: Scenario[] = [];
  const errors: string[] = [];
  let prefix: string | undefined;
  let stretch = false;

  text.split(/\r?\n/).forEach((line, i) => {
    if (line.startsWith("## ")) stretch = line.trim() === "## Stretch";
    if (!line.startsWith("### ")) return;
    const m = HEADING.exec(line);
    if (!m) {
      errors.push(`${file}:${String(i + 1)}: malformed heading: ${line}`);
      return;
    }
    const [, p = "", n = "", title = ""] = m;
    prefix ??= p;
    if (p !== prefix)
      errors.push(
        `${file}:${String(i + 1)}: prefix ${p} differs from ${prefix}`,
      );
    scenarios.push({ id: `${p}-${n}`, title, file, stretch });
  });

  return { scenarios, errors };
}

export function parseScenarios(dir = SCENARIOS_DIR) {
  const scenarios: Scenario[] = [];
  const errors: string[] = [];
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    const result = parseScenarioFile(
      name,
      readFileSync(join(dir, name), "utf8"),
    );
    scenarios.push(...result.scenarios);
    errors.push(...result.errors);
  }

  const seen = new Map<string, string>();
  for (const s of scenarios) {
    const first = seen.get(s.id);
    if (first) errors.push(`duplicate ID ${s.id} in ${first} and ${s.file}`);
    else seen.set(s.id, s.file);
  }

  return { scenarios, errors };
}

/** `test.tags` entries for Vitest. Throws if the scenarios don't parse cleanly. */
export function scenarioTags() {
  const { scenarios, errors } = parseScenarios();
  if (errors.length)
    throw new Error(`Invalid scenarios:\n${errors.join("\n")}`);
  return scenarios.map((s) => ({ name: s.id, description: s.title }));
}

export function scanTestFile(file: string, text: string): TagRef[] {
  const refs: TagRef[] = [];
  for (const option of text.matchAll(TAG_OPTION)) {
    const line = text.slice(0, option.index).split("\n").length;
    for (const [, id = ""] of (option[1] ?? "").matchAll(TAG_ID))
      refs.push({ id, file, line });
  }
  return refs;
}

// scripts/ is skipped: its own tests contain tag fixtures, not scenario coverage.
export function findTestFiles(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return SKIP_DIRS.has(entry.name) ? [] : findTestFiles(path);
    return TEST_FILE.test(entry.name) ? [path] : [];
  });
}

export function scanTests(root = ROOT): TagRef[] {
  return findTestFiles(root).flatMap((path) =>
    scanTestFile(
      relative(root, path).replaceAll(sep, "/"),
      readFileSync(path, "utf8"),
    ),
  );
}

/**
 * Required scenarios with no tagged test, and those tagged only in `e2e/`: Stryker runs Vitest
 * alone, so an E2E-only scenario has no mutation evidence (PLAN §10).
 */
export function coverageGaps(scenarios: Scenario[], refs: TagRef[]) {
  const tagged = new Set(refs.map((r) => r.id));
  const inVitest = new Set(
    refs.filter((r) => !r.file.startsWith("e2e/")).map((r) => r.id),
  );
  const required = scenarios.filter((s) => !s.stretch);
  return {
    uncovered: required.filter((s) => !tagged.has(s.id)),
    e2eOnly: required.filter((s) => tagged.has(s.id) && !inVitest.has(s.id)),
  };
}
