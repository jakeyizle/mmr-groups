/** Mutation-check helpers (PLAN §10): which files are mutated, and diff → line ranges. */

/** Globs Stryker mutates in a full (audit) run; `isMutable` is the same rule for diffs. */
export const MUTATE = [
  "packages/core/src/**/*.ts",
  "packages/api/src/**/*.ts",
  "apps/web/src/**/*.{ts,tsx}",
  "!**/*.test.{ts,tsx}",
  "!**/*.d.ts",
  "!packages/api/src/db/schema.ts",
  "!apps/web/src/routeTree.gen.ts",
  "!apps/web/src/components/ui/**",
  "!apps/web/src/main.tsx",
];

const INCLUDE = [
  /^packages\/core\/src\/.*\.ts$/,
  /^packages\/api\/src\/.*\.ts$/,
  /^apps\/web\/src\/.*\.tsx?$/,
];
const EXCLUDE = [
  /\.test\.tsx?$/,
  /\.d\.ts$/,
  /^packages\/api\/src\/db\/schema\.ts$/,
  /^apps\/web\/src\/routeTree\.gen\.ts$/,
  /^apps\/web\/src\/components\/ui\//,
  /^apps\/web\/src\/main\.tsx$/,
];

export const isMutable = (file: string) =>
  INCLUDE.some((r) => r.test(file)) && !EXCLUDE.some((r) => r.test(file));

export type Ranges = Map<string, [number, number][]>;

/** New-side line ranges added or changed, from `git diff -U0` output. Pure deletions add none. */
export function changedRanges(diff: string): Ranges {
  const ranges: Ranges = new Map();
  let file: string | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4);
      file = path === "/dev/null" ? undefined : path.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !file || !isMutable(file)) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue;
    const list = ranges.get(file) ?? [];
    list.push([start, start + count - 1]);
    ranges.set(file, list);
  }
  return ranges;
}

/** Stryker `--mutate` arguments, e.g. `packages/core/src/x.ts:4-9`. */
export const mutateArgs = (ranges: Ranges) =>
  [...ranges].flatMap(([file, list]) =>
    list.map(([a, b]) => `${file}:${String(a)}-${String(b)}`),
  );

export interface Disable {
  file: string;
  text: string;
  reason: boolean;
}

/** `Stryker disable` comments added in mutable files; each needs a `: reason`. */
export function addedDisables(diff: string): Disable[] {
  const found: Disable[] = [];
  let file: string | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "");
      continue;
    }
    if (!file || !isMutable(file) || !line.startsWith("+")) continue;
    const m = /Stryker disable\S*(.*)$/.exec(line);
    if (!m) continue;
    found.push({
      file,
      text: line.slice(1).trim(),
      reason: /:\s*\S/.test(m[1] ?? ""),
    });
  }
  return found;
}
