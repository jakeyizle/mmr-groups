import type { CoverageMutant, CoverageTest } from "./stryker-coverage.ts";

/** A Vitest test with its scenario tags (a `describe`'s tags included). */
export interface TaggedTest {
  file: string;
  line: number;
  tags: string[];
}

/** A source file a scenario's tests cover; `share` is their part of all tests covering it. */
export interface FileRank {
  file: string;
  share: number;
  tests: number;
  mutants: number;
}

const at = (t: { file: string; line: number }) => `${t.file}:${String(t.line)}`;

/**
 * Joins per-test coverage with scenario tags (PLAN §10 "Attribution"): per scenario, the files
 * its tests cover, most specific first. Static mutants are skipped: every test "covers" them.
 * `unmatched` are Stryker tests with no Vitest test at the same file and line.
 */
export function attribute(
  coverage: {
    tests: CoverageTest[];
    mutants: Pick<CoverageMutant, "file" | "static" | "coveredBy">[];
  },
  tagged: TaggedTest[],
) {
  const tagsAt = new Map(tagged.map((t) => [at(t), t.tags]));
  const unmatched: CoverageTest[] = [];
  const testsOf = new Map<string, string[]>();
  for (const test of coverage.tests) {
    const tags = tagsAt.get(at(test));
    if (!tags) unmatched.push(test);
    for (const tag of tags ?? [])
      testsOf.set(tag, [...(testsOf.get(tag) ?? []), test.id]);
  }

  const byFile = new Map<string, typeof coverage.mutants>();
  for (const m of coverage.mutants)
    if (!m.static) byFile.set(m.file, [...(byFile.get(m.file) ?? []), m]);

  const byScenario = new Map<string, FileRank[]>();
  for (const [scenario, ids] of testsOf) {
    const mine = new Set(ids);
    const ranks: FileRank[] = [];
    for (const [file, list] of byFile) {
      const covering = new Set(list.flatMap((m) => m.coveredBy));
      const tests = [...covering].filter((id) => mine.has(id)).length;
      if (tests === 0) continue;
      ranks.push({
        file,
        share: tests / covering.size,
        tests,
        mutants: list.filter((m) => m.coveredBy.some((id) => mine.has(id)))
          .length,
      });
    }
    ranks.sort(
      (a, b) =>
        b.share - a.share ||
        b.mutants - a.mutants ||
        a.file.localeCompare(b.file),
    );
    byScenario.set(scenario, ranks);
  }
  return { byScenario, unmatched };
}
