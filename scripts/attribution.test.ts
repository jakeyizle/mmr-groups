import { describe, expect, it } from "vitest";

import { attribute } from "./attribution.ts";

const test = (id: string, line: number) => ({
  id,
  name: id,
  file: "a.test.ts",
  line,
});
const mutant = (file: string, coveredBy: string[], isStatic = false) => ({
  file,
  line: 1,
  static: isStatic,
  coveredBy,
});

describe("attribute", () => {
  it("ranks a scenario's files by how few other tests cover them", () => {
    const { byScenario, unmatched } = attribute(
      {
        tests: [test("0", 10), test("1", 20), test("2", 30), test("9", 99)],
        mutants: [
          // Covered by everything: the layout.
          mutant("layout.ts", ["0", "1", "2"]),
          // Only FOO-001's test.
          mutant("audit.ts", ["0"]),
          mutant("audit.ts", ["0"]),
          mutant("match.ts", ["0", "1"]),
          mutant("static.ts", ["0"], true),
        ],
      },
      [
        { file: "a.test.ts", line: 10, tags: ["FOO-001"] },
        { file: "a.test.ts", line: 20, tags: ["FOO-002"] },
        { file: "a.test.ts", line: 30, tags: [] },
      ],
    );
    expect(byScenario.get("FOO-001")).toEqual([
      { file: "audit.ts", share: 1, tests: 1, mutants: 2 },
      { file: "match.ts", share: 0.5, tests: 1, mutants: 1 },
      { file: "layout.ts", share: 1 / 3, tests: 1, mutants: 1 },
    ]);
    expect(byScenario.get("FOO-002")?.map((r) => r.file)).toEqual([
      "match.ts",
      "layout.ts",
    ]);
    expect(unmatched.map((t) => t.id)).toEqual(["9"]);
  });

  it("joins a scenario's tests, breaking share ties by mutants", () => {
    const { byScenario } = attribute(
      {
        tests: [test("0", 10), test("1", 20)],
        mutants: [
          mutant("b.ts", ["0"]),
          mutant("a.ts", ["1"]),
          mutant("a.ts", ["1"]),
        ],
      },
      [
        { file: "a.test.ts", line: 10, tags: ["FOO-001"] },
        { file: "a.test.ts", line: 20, tags: ["FOO-001"] },
      ],
    );
    expect(byScenario.get("FOO-001")?.map((r) => r.file)).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });
});
