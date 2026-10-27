import { describe, expect, it } from "vitest";

import { DEFAULT_RATING_CONFIG as config, type Rating } from "./rating";
import { generateTeams, type Suggestion } from "./teams";

const doubles = { teams: 2, size: 2 };

/** Ratings by player id: a strong to z weak (μ spread, small σ). */
function ladder(ids: string[]): Map<string, Rating> {
  return new Map(ids.map((id, i) => [id, { mu: 35 - i * 2, sigma: 2 }]));
}

function ok(s: Suggestion) {
  if ("needed" in s) throw new Error(`needed ${String(s.needed)}`);
  return s;
}

const flat = (s: ReturnType<typeof ok>) =>
  s.matches.flatMap((m) => m.teams.flat()).sort();

describe(
  "TEAMS-001: generating balanced teams from attendees",
  { tags: ["TEAMS-001"] },
  () => {
    it("pairs strongest with weakest for 4 players, with probabilities", () => {
      const ids = ["a", "b", "c", "d"];
      const s = ok(
        generateTeams({
          playerIds: ids,
          ratings: ladder(ids),
          config,
          format: doubles,
        }),
      );
      expect(s.matches).toHaveLength(1);
      expect(s.matches[0]?.teams).toEqual([
        ["a", "d"],
        ["b", "c"],
      ]);
      const [p1 = 0, p2 = 0] = s.matches[0]?.probabilities ?? [];
      expect(p1 + p2).toBeCloseTo(1, 6);
      expect(Math.abs(p1 - 0.5)).toBeLessThan(0.1);
      expect(s.sittingOut).toEqual([]);
    });

    it("the chosen split has the lowest imbalance of all three", () => {
      const ids = ["a", "b", "c", "d"];
      const ratings = ladder(ids);
      const all = [0, 1, 2].map(
        (skip) =>
          ok(
            generateTeams({
              playerIds: ids,
              ratings,
              config,
              format: doubles,
              skip,
            }),
          ).imbalance,
      );
      expect([...all].sort((x, y) => x - y)).toEqual(all);
    });
  },
);

describe(
  "TEAMS-002: multiple matches from a larger group",
  { tags: ["TEAMS-002"] },
  () => {
    it("8 players: 2 matches, every player once, lower combined imbalance than a naive split", () => {
      const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ratings = ladder(ids);
      const s = ok(
        generateTeams({ playerIds: ids, ratings, config, format: doubles }),
      );
      expect(s.matches).toHaveLength(2);
      expect(flat(s)).toEqual(ids);
      // Naive: top four in one match, bottom four in the other, each balanced.
      const naive =
        ok(
          generateTeams({
            playerIds: ids.slice(0, 4),
            ratings,
            config,
            format: doubles,
          }),
        ).imbalance +
        ok(
          generateTeams({
            playerIds: ids.slice(4),
            ratings,
            config,
            format: doubles,
          }),
        ).imbalance;
      expect(s.imbalance).toBeLessThanOrEqual(naive + 1e-9);
    });
  },
);

describe(
  "TEAMS-003: extra players sit out, rotating on regenerate",
  { tags: ["TEAMS-003"] },
  () => {
    it("10 players: 2 matches, 2 out, and sit-outs rotate to those who've sat out least", () => {
      const ids = "abcdefghij".split("");
      const ratings = ladder(ids);
      const counts = new Map<string, number>();
      const seen: string[][] = [];
      for (let round = 0; round < 5; round++) {
        const s = ok(
          generateTeams({
            playerIds: ids,
            ratings,
            config,
            format: doubles,
            sitOutCounts: counts,
          }),
        );
        expect(s.matches).toHaveLength(2);
        expect(s.sittingOut).toHaveLength(2);
        const min = Math.min(...ids.map((id) => counts.get(id) ?? 0));
        for (const id of s.sittingOut) expect(counts.get(id) ?? 0).toBe(min);
        expect([...flat(s), ...s.sittingOut].sort()).toEqual(ids);
        for (const id of s.sittingOut)
          counts.set(id, (counts.get(id) ?? 0) + 1);
        seen.push(s.sittingOut);
      }
      // Five rounds of two: everyone sat out exactly once.
      expect(seen.flat().sort()).toEqual(ids);
    });
  },
);

describe(
  "TEAMS-004: regenerating without sit-outs gives the next-best option",
  { tags: ["TEAMS-004"] },
  () => {
    it("skip=1 is a different split with imbalance ≥ the best", () => {
      const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ratings = ladder(ids);
      const best = ok(
        generateTeams({ playerIds: ids, ratings, config, format: doubles }),
      );
      const next = ok(
        generateTeams({
          playerIds: ids,
          ratings,
          config,
          format: doubles,
          skip: 1,
        }),
      );
      expect(next.matches).not.toEqual(best.matches);
      expect(next.imbalance).toBeGreaterThanOrEqual(best.imbalance - 1e-12);
      const third = ok(
        generateTeams({
          playerIds: ids,
          ratings,
          config,
          format: doubles,
          skip: 2,
        }),
      );
      expect(third.imbalance).toBeGreaterThanOrEqual(next.imbalance - 1e-12);
    });

    it("is deterministic", () => {
      const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const run = () =>
        generateTeams({
          playerIds: [...ids].reverse(),
          ratings: ladder(ids),
          config,
          format: doubles,
          skip: 3,
        });
      expect(run()).toEqual(run());
    });
  },
);

describe(
  "TEAMS-005: unrated players are included",
  { tags: ["TEAMS-005"] },
  () => {
    it("a player without a rating plays with the initial rating", () => {
      const ratings = ladder(["a", "b", "c"]);
      const s = ok(
        generateTeams({
          playerIds: ["a", "b", "c", "new"],
          ratings,
          config,
          format: doubles,
        }),
      );
      expect(flat(s)).toEqual(["a", "b", "c", "new"]);
    });
  },
);

describe("TEAMS-006: too few players", { tags: ["TEAMS-006"] }, () => {
  it("says how many more are needed", () => {
    expect(
      generateTeams({
        playerIds: ["a", "b", "c"],
        ratings: new Map(),
        config,
        format: doubles,
      }),
    ).toEqual({ needed: 1 });
    expect(
      generateTeams({
        playerIds: [],
        ratings: new Map(),
        config,
        format: { teams: 3, size: 2 },
      }),
    ).toEqual({ needed: 6 });
  });
});

describe("TEAMS-008: generation is fast", { tags: ["TEAMS-008"] }, () => {
  it("12 players in 2×2 in under 200 ms", () => {
    const ids = "abcdefghijkl".split("");
    const input = {
      playerIds: ids,
      ratings: ladder(ids),
      config,
      format: doubles,
    };
    generateTeams(input); // warm up
    const start = Date.now();
    const s = ok(generateTeams(input));
    const ms = Date.now() - start;
    expect(s.matches).toHaveLength(3);
    expect(ms).toBeLessThan(200);
  });
});

describe("larger groups", () => {
  it("over 12 players: local search still uses everyone once, deterministically", () => {
    const ids = "abcdefghijklmnop".split("");
    const input = {
      playerIds: ids,
      ratings: ladder(ids),
      config,
      format: doubles,
    };
    const s = ok(generateTeams(input));
    expect(s.matches).toHaveLength(4);
    expect(flat(s)).toEqual(ids);
    expect(generateTeams(input)).toEqual(s);
  });
});
