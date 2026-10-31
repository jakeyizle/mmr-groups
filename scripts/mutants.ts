/** Scenario-mutant helpers (PLAN §10 "Scenario mutants"): prompts, schemas, edits. */

export interface Edit {
  file: string;
  find: string;
  replace: string;
}

/** A patch meant to break one clause of a scenario. */
export interface Mutant {
  clause: string;
  rationale: string;
  edits: Edit[];
}

export type Status =
  "apply-failed" | "killed" | "invalid" | "equivalent" | "gap";

/** The `### ID: title` section of a scenario file, heading included. */
export function scenarioSection(text: string, id: string) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`### ${id}:`));
  if (start < 0) return undefined;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("##"));
  return lines
    .slice(start, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}

/** Applies edits to file contents; each `find` must occur exactly once. */
export function applyEdits(
  files: Map<string, string>,
  edits: Edit[],
): { files: Map<string, string> } | { error: string } {
  const next = new Map(files);
  for (const { file, find, replace } of edits) {
    const text = next.get(file);
    if (text === undefined) return { error: `unknown file ${file}` };
    const count = text.split(find).length - 1;
    if (count !== 1)
      return { error: `${file}: find text occurs ${String(count)} times` };
    next.set(
      file,
      text.replace(find, () => replace),
    );
  }
  return { files: next };
}

export const MUTANTS_SCHEMA = {
  type: "object",
  properties: {
    mutants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clause: { type: "string" },
          rationale: { type: "string" },
          edits: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                find: { type: "string" },
                replace: { type: "string" },
              },
              required: ["file", "find", "replace"],
            },
          },
        },
        required: ["clause", "rationale", "edits"],
      },
    },
  },
  required: ["mutants"],
};

export const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    breaksClause: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["breaksClause", "reason"],
};

const fence = (path: string, text: string) =>
  `--- ${path}\n\`\`\`ts\n${text}\n\`\`\``;

export function mutantsPrompt(
  scenario: string,
  files: Map<string, string>,
  count: number,
) {
  return [
    "We check whether a test suite really verifies a behavior scenario by planting bugs and seeing if the scenario's tests catch them.",
    `Scenario:\n\n${scenario}`,
    `Implementation files (the scenario's behavior is likely in the first ones):\n\n${[...files].map(([p, t]) => fence(p, t)).join("\n\n")}`,
    [
      `Write up to ${String(count)} bugs. Each must:`,
      "- break exactly one Then/And clause of the scenario (quote it in `clause`), for some reachable input;",
      "- be small and plausible: a mistake a developer could really make, not a deletion of the whole feature;",
      "- still type-check;",
      "- be a list of edits where `find` is copied verbatim from one of the files above and occurs exactly once in it, and `replace` is its new text.",
      "Prefer different clauses and different files. Do not edit tests.",
    ].join("\n"),
  ].join("\n\n");
}

export function verdictPrompt(scenario: string, mutant: Mutant) {
  const edits = mutant.edits
    .map(
      (e) =>
        `${e.file}\n- before:\n\`\`\`ts\n${e.find}\n\`\`\`\n- after:\n\`\`\`ts\n${e.replace}\n\`\`\``,
    )
    .join("\n\n");
  return [
    `Scenario:\n\n${scenario}`,
    `This change was meant to break the clause: "${mutant.clause}"\n\n${edits}`,
    "Does the changed application violate that clause for some input a real user or client could send? Answer false if the change is equivalent, unreachable, or only breaks something the scenario doesn't state.",
  ].join("\n\n");
}

/** Applies a Stryker mutant: `start`/`end` are 0-based [line, column], end exclusive. */
export function spliceMutant(
  text: string,
  m: { start: [number, number]; end: [number, number]; replacement: string },
) {
  const lineStarts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1))
    lineStarts.push(i + 1);
  const at = ([line, column]: [number, number]) => {
    const start = lineStarts[line];
    if (start === undefined) throw new Error(`no line ${String(line)}`);
    return start + column;
  };
  return text.slice(0, at(m.start)) + m.replacement + text.slice(at(m.end));
}

/** `n` items picked uniformly without replacement; the same seed picks the same items. */
export function sample<T>(items: readonly T[], n: number, seed: number) {
  let s = seed >>> 0;
  // mulberry32
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < n && pool.length)
    picked.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return picked;
}
