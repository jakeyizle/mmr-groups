import { describe, expect, it } from "vitest";

import { ago, plural, validateBrowseSearch } from "./public-groups";

describe("validateBrowseSearch", { tags: ["VIS-010", "VIS-011"] }, () => {
  it("keeps valid params as given", () => {
    expect(
      validateBrowseSearch({ q: " Chess ", sort: "matches", dir: "asc" }),
    ).toEqual({ q: " Chess ", sort: "matches", dir: "asc" });
  });

  it("keeps either direction", () => {
    expect(validateBrowseSearch({ dir: "desc" })).toEqual({ dir: "desc" });
    expect(validateBrowseSearch({ dir: "asc" })).toEqual({ dir: "asc" });
  });

  it("drops blank, unknown or mistyped params", () => {
    expect(
      validateBrowseSearch({ q: "  ", sort: "rating", dir: "up", x: 1 }),
    ).toEqual({});
    expect(validateBrowseSearch({ q: 5, sort: ["name"], dir: null })).toEqual(
      {},
    );
  });
});

describe("ago", { tags: ["VIS-009"] }, () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it("uses days, then weeks, months and years", () => {
    expect(ago(daysAgo(0), now)).toBe("today");
    expect(ago(daysAgo(1), now)).toBe("yesterday");
    expect(ago(daysAgo(6), now)).toBe("6 days ago");
    expect(ago(daysAgo(7), now)).toBe("last week");
    expect(ago(daysAgo(59), now)).toBe("8 weeks ago");
    expect(ago(daysAgo(60), now)).toBe("2 months ago");
    expect(ago(daysAgo(729), now)).toBe("24 months ago");
    expect(ago(daysAgo(730), now)).toBe("2 years ago");
  });

  it("rounds to the nearest day, a half day towards now", () => {
    expect(ago(new Date(now - 36 * 3_600_000).toISOString(), now)).toBe(
      "yesterday",
    );
    expect(ago(new Date(now - 36 * 3_600_000 - 1).toISOString(), now)).toBe(
      "2 days ago",
    );
  });
});

describe("plural", () => {
  it("picks the singular only for exactly one", () => {
    expect(plural(1, "player")).toBe("1 player");
    expect(plural(0, "player")).toBe("0 players");
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });
});
