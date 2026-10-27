import { describe, expect, it } from "vitest";

import {
  batchSchema,
  type MatchInput,
  matchInputSchema,
  type MatchSettings,
  validateMatch,
} from "./match";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const doubles: MatchSettings = {
  teamFormat: { kind: "fixed", teams: 2, size: 2 },
  scoringMode: "optional",
  allowTies: false,
};
const flexible: MatchSettings = {
  ...doubles,
  teamFormat: { kind: "flexible" },
};

type TeamInput = MatchInput["teams"][number];
const team = (ids: string, extra: Partial<TeamInput> = {}): TeamInput => ({
  playerIds: ids.split(""),
  ...extra,
});

function input(
  teams: TeamInput[],
  extra: Partial<MatchInput> = {},
): MatchInput {
  return { playedAt: "2026-06-01T10:00:00.000Z", teams, ...extra };
}

function check(m: MatchInput, settings = doubles) {
  return validateMatch(matchInputSchema.parse(m), settings, NOW);
}

const codes = (m: MatchInput, settings = doubles) => {
  const r = check(m, settings);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

const won = [team("ab", { rank: 1 }), team("cd", { rank: 2 })];

describe("MATCH-007: team format is enforced", { tags: ["MATCH-007"] }, () => {
  it("accepts 2 teams of 2 in a 2×2 group", () => {
    expect(check(input(won)).ok).toBe(true);
  });

  it.each([
    [
      "a team of 1",
      [team("a", { rank: 1 }), team("cd", { rank: 2 })],
      "team_size",
    ],
    [
      "a team of 3",
      [team("abe", { rank: 1 }), team("cd", { rank: 2 })],
      "team_size",
    ],
    [
      "3 teams",
      [
        team("ab", { rank: 1 }),
        team("cd", { rank: 2 }),
        team("ef", { rank: 3 }),
      ],
      "team_count",
    ],
  ])("rejects %s", (_, teams, code) => {
    expect(codes(input(teams))).toContain(code);
  });
});

describe(
  "MATCH-008: flexible groups accept uneven teams",
  { tags: ["MATCH-008"] },
  () => {
    it("accepts A vs B & C", () => {
      const r = check(
        input([team("a", { rank: 1 }), team("bc", { rank: 2 })]),
        flexible,
      );
      expect(r.ok).toBe(true);
    });
  },
);

describe(
  "GROUP-003: team format can be fixed or flexible",
  { tags: ["GROUP-003"] },
  () => {
    it("fixed format binds every match; flexible allows ≥2 teams of ≥1", () => {
      const threeWay = input([
        team("a", { rank: 1 }),
        team("b", { rank: 2 }),
        team("cde", { rank: 3 }),
      ]);
      expect(check(threeWay, flexible).ok).toBe(true);
      expect(check(threeWay).ok).toBe(false);
      expect(
        matchInputSchema.safeParse(input([team("a", { rank: 1 })])).success,
      ).toBe(false);
    });
  },
);

describe(
  "MATCH-022: flexible matches have at most 8 teams of 8 players",
  { tags: ["MATCH-022"] },
  () => {
    it("accepts 8 teams of 8, rejects 9 teams or a team of 9", () => {
      const ids = (t: number, n: number) =>
        Array.from({ length: n }, (_, p) => `t${String(t)}p${String(p)}`);
      const teams = (count: number, size: number) =>
        Array.from({ length: count }, (_, t) => ({
          playerIds: ids(t, size),
          rank: t + 1,
        }));
      expect(check(input(teams(8, 8)), flexible).ok).toBe(true);
      expect(matchInputSchema.safeParse(input(teams(9, 1))).success).toBe(
        false,
      );
      expect(matchInputSchema.safeParse(input(teams(2, 9))).success).toBe(
        false,
      );
    });
  },
);

describe(
  "MATCH-009: a player can appear only once per match",
  { tags: ["MATCH-009"] },
  () => {
    it.each([
      ["on the same team", [team("aa", { rank: 1 }), team("cd", { rank: 2 })]],
      [
        "on different teams",
        [team("ab", { rank: 1 }), team("ad", { rank: 2 })],
      ],
    ])("rejects a player %s", (_, teams) => {
      expect(codes(input(teams))).toContain("duplicate_player");
    });
  },
);

describe("MATCH-010: required scoring", { tags: ["MATCH-010"] }, () => {
  const required = { ...doubles, scoringMode: "required" } as const;
  it("rejects a match without scores for every team", () => {
    expect(codes(input(won), required)).toContain("scores_required");
    expect(
      codes(input([team("ab", { score: 3 }), team("cd")]), required),
    ).toEqual(["scores_required"]);
  });
  it("accepts a fully scored match", () => {
    expect(
      check(
        input([team("ab", { score: 3 }), team("cd", { score: 1 })]),
        required,
      ).ok,
    ).toBe(true);
  });
});

describe("MATCH-017: optional scoring", { tags: ["MATCH-017"] }, () => {
  it("accepts matches with and without scores", () => {
    expect(check(input(won)).ok).toBe(true);
    expect(
      check(input([team("ab", { score: 3 }), team("cd", { score: 1 })])).ok,
    ).toBe(true);
  });
  it("but not scores for only some teams", () => {
    expect(
      codes(
        input([team("ab", { score: 3, rank: 1 }), team("cd", { rank: 2 })]),
      ),
    ).toEqual(["scores_incomplete"]);
  });
});

describe("MATCH-018: no scoring", { tags: ["MATCH-018"] }, () => {
  it("rejects a match with scores", () => {
    const none = { ...doubles, scoringMode: "none" } as const;
    expect(
      codes(input([team("ab", { score: 3 }), team("cd", { score: 1 })]), none),
    ).toEqual(["scores_not_allowed"]);
    expect(check(input(won), none).ok).toBe(true);
  });
});

describe(
  "MATCH-023: scores are whole numbers from 0 to 999",
  { tags: ["MATCH-023"] },
  () => {
    it.each([-1, 1.5, 1000])("rejects %s", (score) => {
      expect(
        matchInputSchema.safeParse(
          input([team("ab", { score }), team("cd", { score: 0 })]),
        ).success,
      ).toBe(false);
    });
    it.each([0, 999])("accepts %s", (score) => {
      expect(
        check(input([team("ab", { score }), team("cd", { score: 500 })])).ok,
      ).toBe(true);
    });
  },
);

describe(
  "MATCH-011: placement is derived from scores",
  { tags: ["MATCH-011"] },
  () => {
    it("ranks teams by score, highest first, with any number of teams", () => {
      const r = check(
        input([
          team("a", { score: 5, rank: 1 }),
          team("b", { score: 9 }),
          team("c", { score: 7 }),
          team("d", { score: 0 }),
        ]),
        flexible,
      );
      expect(r.ok && r.match.teams.map((t) => t.rank)).toEqual([3, 1, 2, 4]);
    });
  },
);

describe(
  "MATCH-012: placement is chosen when there are no scores",
  { tags: ["MATCH-012"] },
  () => {
    it("uses the chosen winner or placements", () => {
      const r = check(
        input([team("ab", { rank: 2 }), team("cd", { rank: 1 })]),
      );
      expect(r.ok && r.match.teams.map((t) => t.rank)).toEqual([2, 1]);
      const four = check(
        input([
          team("a", { rank: 4 }),
          team("b", { rank: 1 }),
          team("c", { rank: 3 }),
          team("d", { rank: 2 }),
        ]),
        flexible,
      );
      expect(four.ok && four.match.teams.map((t) => t.rank)).toEqual([
        4, 1, 3, 2,
      ]);
    });

    it("requires a placement for every team, and placements that add up", () => {
      expect(codes(input([team("ab"), team("cd")]))).toEqual([
        "rank_required",
        "rank_required",
      ]);
      expect(
        codes(
          input([team("a", { rank: 1 }), team("b", { rank: 3 })]),
          flexible,
        ),
      ).toEqual(["invalid_ranks"]);
    });
  },
);

describe(
  "MATCH-013: ties are rejected when not allowed",
  { tags: ["MATCH-013"] },
  () => {
    it.each([
      ["equal scores", [team("ab", { score: 4 }), team("cd", { score: 4 })]],
      ["equal placements", [team("ab", { rank: 1 }), team("cd", { rank: 1 })]],
    ])("rejects %s", (_, teams) => {
      expect(codes(input(teams))).toEqual(["tie_not_allowed"]);
    });
  },
);

describe(
  "MATCH-019: ties are accepted when allowed",
  { tags: ["MATCH-019"] },
  () => {
    it("tied teams share a rank", () => {
      const r = check(
        input([
          team("a", { score: 4 }),
          team("b", { score: 4 }),
          team("c", { score: 1 }),
        ]),
        { ...flexible, allowTies: true },
      );
      expect(r.ok && r.match.teams.map((t) => t.rank)).toEqual([1, 1, 3]);
    });
  },
);

describe(
  "MATCH-020: date-times are local and cannot be far in the future",
  { tags: ["MATCH-020"] },
  () => {
    it("stores a local date-time as the equivalent UTC instant", () => {
      const r = check(input(won, { playedAt: "2026-06-01T08:30:00-04:00" }));
      expect(r.ok && r.match.playedAt).toBe("2026-06-01T12:30:00.000Z");
    });

    it("accepts up to 24 hours ahead, rejects beyond", () => {
      expect(check(input(won, { playedAt: "2026-06-02T12:00:00Z" })).ok).toBe(
        true,
      );
      expect(codes(input(won, { playedAt: "2026-06-02T12:00:01Z" }))).toEqual([
        "too_far_in_future",
      ]);
    });

    it("rejects a date-time without an offset", () => {
      expect(
        matchInputSchema.safeParse(input(won, { playedAt: "2026-06-01T10:00" }))
          .success,
      ).toBe(false);
    });
  },
);

describe(
  "MATCH-021: a batch has at most 50 matches",
  { tags: ["MATCH-021"] },
  () => {
    it("accepts 50, rejects 51 and 0", () => {
      const batch = (n: number) => ({
        matches: Array.from({ length: n }, () => input(won)),
      });
      expect(batchSchema.safeParse(batch(50)).success).toBe(true);
      expect(batchSchema.safeParse(batch(51)).success).toBe(false);
      expect(batchSchema.safeParse(batch(0)).success).toBe(false);
    });
  },
);
