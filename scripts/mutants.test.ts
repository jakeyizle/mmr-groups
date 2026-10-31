import { describe, expect, it } from "vitest";

import {
  applyEdits,
  sample,
  scenarioSection,
  spliceMutant,
} from "./mutants.ts";

describe("scenarioSection", () => {
  const text = [
    "# Foo",
    "",
    "### FOO-001: First",
    "",
    "- **Given** a",
    "",
    "### FOO-002: Second",
    "",
    "- **Then** b",
    "",
    "## Stretch",
    "",
    "### FOO-003: Third",
  ].join("\r\n");

  it("returns a scenario's heading and body, up to the next heading", () => {
    expect(scenarioSection(text, "FOO-001")).toBe(
      "### FOO-001: First\n\n- **Given** a",
    );
    expect(scenarioSection(text, "FOO-002")).toBe(
      "### FOO-002: Second\n\n- **Then** b",
    );
    expect(scenarioSection(text, "FOO-003")).toBe("### FOO-003: Third");
    expect(scenarioSection(text, "FOO-004")).toBeUndefined();
  });
});

describe("applyEdits", () => {
  const files = new Map([["a.ts", "const x = 1;\nconst y = 1;\n"]]);

  it("replaces text that occurs exactly once, in order", () => {
    const result = applyEdits(files, [
      { file: "a.ts", find: "x = 1", replace: "x = 2" },
      { file: "a.ts", find: "x = 2;\nconst y", replace: "x = $&;\nconst z" },
    ]);
    expect(result).toEqual({
      files: new Map([["a.ts", "const x = $&;\nconst z = 1;\n"]]),
    });
    expect(files.get("a.ts")).toBe("const x = 1;\nconst y = 1;\n");
  });

  it("rejects missing, repeated and unknown targets", () => {
    expect(
      applyEdits(files, [{ file: "a.ts", find: "= 1", replace: "" }]),
    ).toEqual({ error: "a.ts: find text occurs 2 times" });
    expect(
      applyEdits(files, [{ file: "a.ts", find: "z", replace: "" }]),
    ).toEqual({ error: "a.ts: find text occurs 0 times" });
    expect(
      applyEdits(files, [{ file: "b.ts", find: "x", replace: "" }]),
    ).toEqual({ error: "unknown file b.ts" });
  });
});

describe("spliceMutant", () => {
  it("replaces a 0-based line/column range, across lines and CRLF", () => {
    const text = "if (a) {\r\n  b();\r\n}\r\n";
    expect(
      spliceMutant(text, { start: [0, 4], end: [0, 5], replacement: "true" }),
    ).toBe("if (true) {\r\n  b();\r\n}\r\n");
    expect(
      spliceMutant(text, { start: [0, 7], end: [2, 1], replacement: "{}" }),
    ).toBe("if (a) {}\r\n");
    expect(() =>
      spliceMutant(text, { start: [9, 0], end: [9, 0], replacement: "" }),
    ).toThrow("no line 9");
  });
});

describe("sample", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);

  it("picks n distinct items, the same ones for the same seed", () => {
    const a = sample(items, 10, 1);
    expect(a).toHaveLength(10);
    expect(new Set(a).size).toBe(10);
    expect(sample(items, 10, 1)).toEqual(a);
    expect(sample(items, 10, 2)).not.toEqual(a);
    expect(sample(items.slice(0, 3), 10, 1).sort()).toEqual([0, 1, 2]);
  });
});
