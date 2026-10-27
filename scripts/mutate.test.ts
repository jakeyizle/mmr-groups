import { describe, expect, it } from "vitest";

import {
  addedDisables,
  changedRanges,
  isMutable,
  mutateArgs,
} from "./mutate.ts";

const diff = [
  "diff --git a/packages/core/src/a.ts b/packages/core/src/a.ts",
  "--- a/packages/core/src/a.ts",
  "+++ b/packages/core/src/a.ts",
  "@@ -3 +3 @@ export",
  "-old",
  "+new",
  "@@ -10,2 +10,0 @@",
  "-gone",
  "-gone",
  "@@ -20,0 +19,3 @@",
  "+// Stryker disable next-line StringLiteral: label only",
  "+// Stryker disable next-line all",
  "+x",
  "diff --git a/packages/core/src/a.test.ts b/packages/core/src/a.test.ts",
  "+++ b/packages/core/src/a.test.ts",
  "@@ -1 +1,2 @@",
  "+// Stryker disable next-line all",
  "diff --git a/packages/api/src/new.ts b/packages/api/src/new.ts",
  "--- /dev/null",
  "+++ b/packages/api/src/new.ts",
  "@@ -0,0 +1,4 @@",
  "diff --git a/packages/api/src/old.ts b/packages/api/src/old.ts",
  "--- a/packages/api/src/old.ts",
  "+++ /dev/null",
  "@@ -1,4 +0,0 @@",
].join("\n");

describe("isMutable", () => {
  it("covers core and api source, not tests, types or the Drizzle schema", () => {
    expect(isMutable("packages/core/src/rating.ts")).toBe(true);
    expect(isMutable("packages/api/src/groups/routes.ts")).toBe(true);
    expect(isMutable("packages/core/src/rating.test.ts")).toBe(false);
    expect(isMutable("packages/api/src/env.d.ts")).toBe(false);
    expect(isMutable("packages/api/src/db/schema.ts")).toBe(false);
    expect(isMutable("packages/api/migrations/0001_x.sql")).toBe(false);
    expect(isMutable("scripts/mutate.ts")).toBe(false);
  });
});

describe("changedRanges", () => {
  it("maps hunks to new-side ranges, skipping deletions and unmutated files", () => {
    expect(mutateArgs(changedRanges(diff))).toEqual([
      "packages/core/src/a.ts:3-3",
      "packages/core/src/a.ts:19-21",
      "packages/api/src/new.ts:1-4",
    ]);
  });

  it("is empty for an empty diff", () => {
    expect(changedRanges("").size).toBe(0);
  });
});

describe("addedDisables", () => {
  it("finds added disables in mutable files and whether each has a reason", () => {
    expect(addedDisables(diff)).toEqual([
      {
        file: "packages/core/src/a.ts",
        text: "// Stryker disable next-line StringLiteral: label only",
        reason: true,
      },
      {
        file: "packages/core/src/a.ts",
        text: "// Stryker disable next-line all",
        reason: false,
      },
    ]);
  });
});
