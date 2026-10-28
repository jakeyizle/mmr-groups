import type { MatchSettings } from "@mmr/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  blankRow,
  clearDraft,
  duplicateRow,
  fromMatch,
  loadDraft,
  type MatchRow,
  matchChanges,
  needsPlacement,
  nextMinute,
  rowIssues,
  saveDraft,
  toLocalInput,
  toMatchInput,
} from "./batch";

const local = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi);

const row = (
  teams: [string[], string, string][],
  playedAt = "2026-10-12T18:05",
): MatchRow => ({
  playedAt,
  teams: teams.map(([playerIds, score, rank]) => ({ playerIds, score, rank })),
});

const settings = (s: Partial<MatchSettings> = {}): MatchSettings => ({
  teamFormat: { kind: "fixed", teams: 2, size: 1 },
  scoringMode: "optional",
  allowTies: false,
  ...s,
});

describe("datetime-local values", { tags: ["MATCH-005"] }, () => {
  it("formats local time with zero padding", () => {
    expect(toLocalInput(local(2026, 3, 4, 5, 6))).toBe("2026-03-04T05:06");
    expect(toLocalInput(local(2026, 12, 31, 23, 59))).toBe("2026-12-31T23:59");
  });

  it("steps one minute, across hours and days", () => {
    expect(nextMinute("2026-03-04T05:06")).toBe("2026-03-04T05:07");
    expect(nextMinute("2026-12-31T23:59")).toBe("2027-01-01T00:00");
  });

  it("falls back to now for an unparseable value", () => {
    vi.useFakeTimers({ now: local(2026, 5, 6, 7, 8) });
    expect(nextMinute("nope")).toBe("2026-05-06T07:08");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe("rows", { tags: ["MATCH-004", "MATCH-007", "MATCH-008"] }, () => {
  it("starts blank rows from the team format", () => {
    expect(blankRow({ kind: "fixed", teams: 3, size: 2 }, "t")).toEqual({
      playedAt: "t",
      teams: Array.from({ length: 3 }, () => ({
        playerIds: ["", ""],
        score: "",
        rank: "",
      })),
    });
    expect(blankRow({ kind: "flexible" }, "t").teams).toEqual([
      { playerIds: [""], score: "", rank: "" },
      { playerIds: [""], score: "", rank: "" },
    ]);
  });

  it("duplicates players a minute later, without results", () => {
    const prev = row([
      [["a", "b"], "11", ""],
      [["c", "d"], "7", "2"],
    ]);
    const next = duplicateRow(prev);
    expect(next).toEqual(
      row(
        [
          [["a", "b"], "", ""],
          [["c", "d"], "", ""],
        ],
        "2026-10-12T18:06",
      ),
    );
    next.teams[0]?.playerIds.push("x");
    expect(prev.teams[0]?.playerIds).toEqual(["a", "b"]);
  });
});

describe(
  "toMatchInput",
  { tags: ["MATCH-020", "MATCH-011", "MATCH-012"] },
  () => {
    it("converts the local time to UTC and form strings to values", () => {
      expect(
        toMatchInput(
          row([
            [["a", ""], " 11 ", ""],
            [["b"], "  ", "2"],
          ]),
        ),
      ).toEqual({
        playedAt: new Date(2026, 9, 12, 18, 5).toISOString(),
        teams: [
          { playerIds: ["a"], score: 11 },
          { playerIds: ["b"], score: null, rank: 2 },
        ],
      });
    });

    it("passes an unparseable date through for validation to reject", () => {
      expect(toMatchInput(row([], "")).playedAt).toBe("");
    });
  },
);

describe("fromMatch", () => {
  it("shows scores, or placements for unscored teams", () => {
    const playedAt = new Date(2026, 9, 12, 18, 5, 30).toISOString();
    const teams = [
      { playerIds: ["a"], score: 0, rank: 1 },
      { playerIds: ["b"], score: null, rank: 2 },
    ];
    const r = fromMatch({ playedAt, teams });
    expect(r).toEqual(
      row([
        [["a"], "0", ""],
        [["b"], "", "2"],
      ]),
    );
    r.teams[0]?.playerIds.push("x");
    expect(teams[0]?.playerIds).toEqual(["a"]);
  });
});

describe("matchChanges", { tags: ["EDIT-011"] }, () => {
  const original = {
    playedAt: new Date(2026, 9, 12, 18, 5, 30).toISOString(),
    teams: [
      { playerIds: ["a"], score: 11, rank: 1 },
      { playerIds: ["b"], score: 7, rank: 2 },
    ],
    notes: "good game",
  };
  const same = () =>
    row([
      [["a"], "11", ""],
      [["b"], "7", ""],
    ]);

  it("is empty when nothing changed (seconds and derived ranks ignored)", () => {
    expect(matchChanges(original, same(), " good game ")).toEqual({});
  });

  it("sends just the changed fields", () => {
    const r = same();
    r.playedAt = "2026-10-12T18:06";
    expect(matchChanges(original, r, "good game")).toEqual({
      playedAt: new Date(2026, 9, 12, 18, 6).toISOString(),
    });
    const s = same();
    if (s.teams[1]) s.teams[1].score = "8";
    expect(matchChanges(original, s, "good game")).toEqual({
      teams: [
        { playerIds: ["a"], score: 11 },
        { playerIds: ["b"], score: 8 },
      ],
    });
    expect(matchChanges(original, same(), "great game")).toEqual({
      notes: "great game",
    });
  });

  it("compares placements for unscored matches", () => {
    const unscored = {
      ...original,
      teams: [
        { playerIds: ["a"], score: null, rank: 1 },
        { playerIds: ["b"], score: null, rank: 2 },
      ],
    };
    const r = row([
      [["a"], "", "1"],
      [["b"], "", "2"],
    ]);
    expect(matchChanges(unscored, r, "good game")).toEqual({});
    if (r.teams[1]) r.teams[1].rank = "1";
    expect(matchChanges(unscored, r, "good game").teams).toEqual([
      { playerIds: ["a"], score: null, rank: 1 },
      { playerIds: ["b"], score: null, rank: 1 },
    ]);
  });
});

describe("needsPlacement", { tags: ["MATCH-012", "MATCH-010"] }, () => {
  const unscored = row([
    [["a"], "", ""],
    [["b"], "", ""],
  ]);
  it("asks for placements only without scores, unless scores are required", () => {
    expect(needsPlacement(unscored, settings())).toBe(true);
    expect(needsPlacement(unscored, settings({ scoringMode: "none" }))).toBe(
      true,
    );
    expect(
      needsPlacement(unscored, settings({ scoringMode: "required" })),
    ).toBe(false);
    const scored = row([
      [["a"], "", ""],
      [["b"], "3", ""],
    ]);
    expect(needsPlacement(scored, settings())).toBe(false);
  });
});

describe("rowIssues", { tags: ["MATCH-009", "MATCH-010", "MATCH-013"] }, () => {
  const now = new Date(2026, 9, 12, 20, 0);

  it("is empty for a valid row", () => {
    expect(
      rowIssues(
        row([
          [["a"], "11", ""],
          [["b"], "7", ""],
        ]),
        settings(),
        now,
      ),
    ).toEqual([]);
  });

  it("explains schema problems in words, once each", () => {
    expect(
      rowIssues(
        row(
          [
            [[""], "1.5", ""],
            [[""], "-1", ""],
          ],
          "",
        ),
        settings(),
        now,
      ),
    ).toEqual([
      "Enter a date and time",
      "Pick players for every team",
      "Scores are whole numbers from 0 to 999",
    ]);
  });

  it("passes other schema messages through", () => {
    const issues = rowIssues(row([[["a"], "", ""]]), settings(), now);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/2/);
  });

  it("reports the group's rules", () => {
    expect(
      rowIssues(
        row([
          [["a"], "5", ""],
          [["a"], "5", ""],
        ]),
        settings(),
        now,
      ),
    ).toEqual([
      "A player can only appear once",
      "This group doesn't allow ties",
    ]);
  });
});

describe("drafts", { tags: ["MATCH-014"] }, () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  const draft = { rows: [row([])] };

  it("round-trips a draft and clears it", () => {
    saveDraft("k", draft);
    expect(loadDraft("k")).toEqual(draft);
    clearDraft("k");
    expect(loadDraft("k")).toBeNull();
  });

  it("ignores missing, empty or malformed drafts", () => {
    expect(loadDraft("none")).toBeNull();
    saveDraft("k", { rows: [] });
    expect(loadDraft("k")).toBeNull();
    saveDraft("k", { rows: "x" });
    expect(loadDraft("k")).toBeNull();
    saveDraft("k", null);
    expect(loadDraft("k")).toBeNull();
    localStorage.setItem("k", "{not json");
    expect(loadDraft("k")).toBeNull();
  });

  it("survives unavailable storage", () => {
    const fail = () => {
      throw new Error("denied");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(fail);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(fail);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(fail);
    expect(() => {
      saveDraft("k", draft);
      clearDraft("k");
    }).not.toThrow();
    expect(loadDraft("k")).toBeNull();
  });
});
