import { describe, expect, it } from "vitest";

import {
  coverageGaps,
  parseScenarioFile,
  parseScenarios,
  scanTestFile,
} from "./scenarios.ts";

describe("parseScenarioFile", () => {
  it("parses headings and marks stretch sections", () => {
    const text = [
      "# Feature",
      "### FOO-001: First",
      "- **Given** x",
      "## Stretch",
      "### FOO-002: Later",
      "## Other",
      "### FOO-003: Back to required",
    ].join("\n");
    expect(parseScenarioFile("foo.md", text)).toEqual({
      scenarios: [
        { id: "FOO-001", title: "First", file: "foo.md", stretch: false },
        { id: "FOO-002", title: "Later", file: "foo.md", stretch: true },
        {
          id: "FOO-003",
          title: "Back to required",
          file: "foo.md",
          stretch: false,
        },
      ],
      errors: [],
    });
  });

  it.each([
    "### FOO-1: short number",
    "### foo-001: lowercase",
    "### FOO-001 no colon",
    "### FOO-001: ",
  ])("rejects malformed heading %j", (heading) => {
    const { scenarios, errors } = parseScenarioFile("foo.md", heading);
    expect(scenarios).toEqual([]);
    expect(errors).toEqual([`foo.md:1: malformed heading: ${heading}`]);
  });

  it("rejects a prefix that differs from the file", () => {
    const { errors } = parseScenarioFile(
      "foo.md",
      "### FOO-001: a\n### BAR-002: b",
    );
    expect(errors).toEqual(["foo.md:2: prefix BAR differs from FOO"]);
  });
});

describe("parseScenarios", () => {
  it("parses the real scenarios without errors or duplicates", () => {
    const { scenarios, errors } = parseScenarios();
    expect(errors).toEqual([]);
    expect(scenarios.length).toBeGreaterThan(0);
  });
});

describe("scanTestFile", () => {
  it("finds Vitest and Playwright tags with line numbers", () => {
    const text = [
      "test('a', { tags: ['FOO-001', 'FOO-002'] }, () => {});",
      "test('b', { tag: '@BAR-003' }, async () => {});",
      'test("c", { tag: ["@BAR-004", "@smoke"] }, async () => {});',
      "test('d', { tags: 'FOO-005' }, () => {});",
      "test('e mentions FOO-006 in its name only', () => {});",
    ].join("\n");
    expect(
      scanTestFile("x.test.ts", text).map((r) => `${r.id}@${String(r.line)}`),
    ).toEqual([
      "FOO-001@1",
      "FOO-002@1",
      "BAR-003@2",
      "BAR-004@3",
      "FOO-005@4",
    ]);
  });

  it("handles tag arrays spanning lines", () => {
    const text =
      "test('a', {\n  tags: [\n    'FOO-001',\n    'FOO-002',\n  ],\n}, () => {});";
    expect(scanTestFile("x.test.ts", text).map((r) => r.id)).toEqual([
      "FOO-001",
      "FOO-002",
    ]);
  });
});

describe("coverageGaps", () => {
  const scenario = (id: string, stretch = false) => ({
    id,
    title: id,
    file: "foo.md",
    stretch,
  });
  const ref = (id: string, file: string) => ({ id, file, line: 1 });

  it("finds required scenarios that are untagged or tagged only in e2e", () => {
    const gaps = coverageGaps(
      [
        scenario("FOO-001"),
        scenario("FOO-002"),
        scenario("FOO-003"),
        scenario("FOO-004"),
        scenario("FOO-005", true),
      ],
      [
        ref("FOO-001", "packages/core/src/a.test.ts"),
        ref("FOO-002", "e2e/a.spec.ts"),
        ref("FOO-002", "e2e/b.spec.ts"),
        ref("FOO-004", "e2e/a.spec.ts"),
        ref("FOO-004", "apps/web/src/a.test.tsx"),
        ref("FOO-005", "e2e/a.spec.ts"),
      ],
    );
    expect(gaps.uncovered.map((s) => s.id)).toEqual(["FOO-003"]);
    expect(gaps.e2eOnly.map((s) => s.id)).toEqual(["FOO-002"]);
  });
});
