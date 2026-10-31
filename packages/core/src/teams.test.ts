import { describe, expect, it } from "vitest";

import {
  DEFAULT_RATING_CONFIG as config,
  type Rating,
  ratingSystem,
} from "./rating";
import { EXHAUSTIVE_LIMIT, generateTeams, type Suggestion } from "./teams";

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
    // Stryker's instrumented code is slower than the test environment the budget is for.
    if (!("__stryker__" in globalThis)) expect(ms).toBeLessThan(200);
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

// Reference: every partition of `ids` into groups of `size`, canonical (each group led by its smallest id).
function partitions(ids: string[], size: number): string[][][] {
  if (ids.length === 0) return [[]];
  const [first = "", ...rest] = ids;
  const out: string[][][] = [];
  const pick = (from: number, chosen: string[]) => {
    if (chosen.length === size - 1) {
      const left = rest.filter((id) => !chosen.includes(id));
      for (const tail of partitions(left, size))
        out.push([[first, ...chosen], ...tail]);
      return;
    }
    for (let i = from; i < rest.length; i++)
      pick(i + 1, [...chosen, rest[i] ?? ""]);
  };
  pick(0, []);
  return out;
}

const system = ratingSystem(config);
/** Imbalance of one match: Σ |p − 1/T|, as the generator defines it. */
function score(teams: string[][], ratings: Map<string, Rating>) {
  const p = system.predictWin(
    teams.map((t) => t.map((id) => ratings.get(id) ?? system.initial())),
  );
  return p.reduce((sum, x) => sum + Math.abs(x - 1 / teams.length), 0);
}
/** Every full arrangement's imbalance, best first. */
function reference(
  ids: string[],
  ratings: Map<string, Rating>,
  T: number,
  S: number,
) {
  return partitions(ids, T * S)
    .flatMap((matches) =>
      matches.reduce<string[][][][]>(
        (acc, m) =>
          acc.flatMap((prefix) =>
            partitions(m, S).map((split) => [...prefix, split]),
          ),
        [[]],
      ),
    )
    .map((arr) => arr.reduce((sum, teams) => sum + score(teams, ratings), 0))
    .sort((a, b) => a - b);
}

/** Distinct, uneven ratings so no two arrangements tie. */
const uneven = (ids: string[]) =>
  new Map(
    ids.map((id, i) => [
      id,
      { mu: 20 + ((i * 7) % 11) + i / 10, sigma: 2 + (i % 3) / 5 },
    ]),
  );

describe(
  "exhaustive search",
  { tags: ["TEAMS-001", "TEAMS-002", "TEAMS-004"] },
  () => {
    it("returns the k-th best arrangement for skip = k, across matches", () => {
      const ids = "abcdefgh".split("");
      const ratings = uneven(ids);
      const ref = reference(ids, ratings, 2, 2);
      for (let skip = 0; skip < 6; skip++) {
        const s = ok(
          generateTeams({
            playerIds: ids,
            ratings,
            config,
            format: doubles,
            skip,
          }),
        );
        expect(s.imbalance).toBeCloseTo(ref[skip] ?? -1, 9);
        expect(flat(s)).toEqual(ids);
      }
    });

    it("is exhaustive up to the limit of 12 players", () => {
      expect(EXHAUSTIVE_LIMIT).toBe(12);
      const ids = "abcdefghijkl".split("");
      const ratings = uneven(ids);
      const ref = reference(ids, ratings, 2, 6);
      for (const skip of [0, 1, 2]) {
        const s = ok(
          generateTeams({
            playerIds: ids,
            ratings,
            config,
            format: { teams: 2, size: 6 },
            skip,
          }),
        );
        expect(s.imbalance).toBeCloseTo(ref[skip] ?? -1, 9);
      }
    });

    it("breaks ties in canonical order", () => {
      // Unrated players: every split is equally balanced.
      const at = (skip: number) =>
        ok(
          generateTeams({
            playerIds: ["d", "c", "b", "a"],
            ratings: new Map(),
            config,
            format: doubles,
            skip,
          }),
        ).matches[0]?.teams;
      expect([at(0), at(1), at(2)]).toEqual([
        [
          ["a", "b"],
          ["c", "d"],
        ],
        [
          ["a", "c"],
          ["b", "d"],
        ],
        [
          ["a", "d"],
          ["b", "c"],
        ],
      ]);
    });

    it("wraps around when skipping past the last distinct split", () => {
      const ids = ["a", "b", "c", "d"];
      const ratings = uneven(ids);
      const at = (skip: number) =>
        ok(
          generateTeams({
            playerIds: ids,
            ratings,
            config,
            format: doubles,
            skip,
          }),
        );
      expect(at(5)).toEqual(at(2));
      expect(at(2)).not.toEqual(at(1));
    });

    it("ignores duplicate attendees", () => {
      const s = generateTeams({
        playerIds: ["a", "b", "a", "c"],
        ratings: new Map(),
        config,
        format: doubles,
      });
      expect(s).toEqual({ needed: 1 });
    });

    it("keeps players with look-alike ids apart", () => {
      // "a"+"bc" and "ab"+"c" read the same when joined without a separator.
      const ids = ["a", "ab", "abc", "bc", "c", "ca", "x", "y"];
      const s = ok(
        generateTeams({
          playerIds: ids,
          ratings: uneven(ids),
          config,
          format: doubles,
        }),
      );
      expect(flat(s)).toEqual([...ids].sort());
    });
  },
);

describe("sitting out", { tags: ["TEAMS-003"] }, () => {
  const ids = ["a", "b", "c", "d", "e"];
  const out = (counts?: Map<string, number>) =>
    ok(
      generateTeams({
        playerIds: ids,
        ratings: new Map(),
        config,
        format: doubles,
        sitOutCounts: counts,
      }),
    ).sittingOut;

  it("lists those sitting out by id", () => {
    const s = ok(
      generateTeams({
        playerIds: ids,
        ratings: new Map(),
        config,
        format: { teams: 3, size: 1 },
        sitOutCounts: new Map([
          ["a", 2],
          ["b", 1],
          ["c", 2],
          ["d", 0],
          ["e", 2],
        ]),
      }),
    );
    expect(s.sittingOut).toEqual(["b", "d"]);
  });

  it("sits out whoever has sat out least, ties by id", () => {
    expect(out()).toEqual(["a"]);
    expect(out(new Map([["a", 1]]))).toEqual(["b"]);
    expect(
      out(
        new Map([
          ["a", 2],
          ["b", 1],
          ["c", 1],
          ["d", 1],
        ]),
      ),
    ).toEqual(["e"]);
    expect(
      out(
        new Map([
          ["e", 0],
          ["a", 1],
          ["b", 1],
          ["c", 1],
          ["d", 3],
        ]),
      ),
    ).toEqual(["e"]);
  });
});

describe(
  "local search",
  { tags: ["TEAMS-001", "TEAMS-002", "TEAMS-004"] },
  () => {
    const ids = "abcdefghijklmn".split(""); // 14: over the exhaustive limit
    const ratings = uneven(ids);
    const run = (skip?: number) =>
      ok(
        generateTeams({
          playerIds: ids,
          ratings,
          config,
          format: { teams: 2, size: 7 },
          ...(skip === undefined ? {} : { skip }),
        }),
      );

    it("places everyone once in teams of the right size, near the best possible balance", () => {
      const s = run();
      expect(flat(s)).toEqual(ids);
      expect(s.matches).toHaveLength(1);
      expect(s.matches[0]?.teams.map((t) => t.length)).toEqual([7, 7]);
      const best = reference(ids, ratings, 2, 7)[0] ?? 0;
      expect(s.imbalance).toBeLessThan(best + 0.01);
      expect(s.imbalance).toBeCloseTo(
        score(s.matches[0]?.teams ?? [], ratings),
        9,
      );
    });

    it("splits larger groups into several matches", () => {
      const many = "abcdefghijklmnopqr".split(""); // 18 = 2 matches of 2×4, 2 out
      const r = uneven(many);
      const s = ok(
        generateTeams({
          playerIds: many,
          ratings: r,
          config,
          format: { teams: 2, size: 4 },
        }),
      );
      expect(s.matches).toHaveLength(2);
      expect(s.sittingOut).toEqual(["a", "b"]);
      expect([...flat(s), ...s.sittingOut].sort()).toEqual(many);
      for (const m of s.matches)
        expect(m.teams.map((t) => t.length)).toEqual([4, 4]);
      expect(s.imbalance).toBeCloseTo(
        s.matches.reduce((sum, m) => sum + score(m.teams, r), 0),
        9,
      );
    });

    describe("with several matches", () => {
      const many = "abcdefghijklmnopqr".split(""); // 2 matches of 2×4, 2 out
      const r = uneven(many);
      const gen = (skip = 0, ratings = r) =>
        ok(
          generateTeams({
            playerIds: many,
            ratings,
            config,
            format: { teams: 2, size: 4 },
            skip,
          }),
        );
      const key = (s: ReturnType<typeof ok>) =>
        s.matches
          .map((m) =>
            m.teams
              .map((t) => [...t].sort().join(","))
              .sort()
              .join("|"),
          )
          .sort()
          .join("/");

      it("keeps each match to its own teams, even with nothing to improve", () => {
        const s = gen(0, new Map());
        expect(s.matches).toHaveLength(2);
        for (const m of s.matches)
          expect(m.teams.map((t) => t.length)).toEqual([4, 4]);
        expect([...flat(s), ...s.sittingOut].sort()).toEqual(many);
      });

      it("ends where no swap between two teams lowers the imbalance", () => {
        const s = gen();
        const teams = s.matches.flatMap((m) => m.teams.map((t) => [...t]));
        const total = () =>
          [0, 1].reduce(
            (sum, k) => sum + score(teams.slice(2 * k, 2 * k + 2), r),
            0,
          );
        const best = total();
        expect(s.imbalance).toBeCloseTo(best, 9);
        for (let a = 0; a < teams.length; a++)
          for (let b = a + 1; b < teams.length; b++)
            for (let i = 0; i < 4; i++)
              for (let j = 0; j < 4; j++) {
                const ta = teams[a] ?? [];
                const tb = teams[b] ?? [];
                [ta[i], tb[j]] = [tb[j] ?? "", ta[i] ?? ""];
                expect(total()).toBeGreaterThan(best - 1e-9);
                [ta[i], tb[j]] = [tb[j] ?? "", ta[i] ?? ""];
              }
      });

      it("pairs singles across matches until no swap helps", () => {
        // Singles: only swaps between matches can improve anything.
        const ids14 = many.slice(0, 14);
        const r14 = uneven(ids14);
        const solo = () =>
          ok(
            generateTeams({
              playerIds: ids14,
              ratings: r14,
              config,
              format: { teams: 2, size: 1 },
            }),
          );
        const s = solo();
        expect(s.matches).toHaveLength(7);
        const pairs = s.matches.map((m) => m.teams.flat());
        const total = () =>
          pairs.reduce(
            (sum, p) =>
              sum +
              score(
                p.map((id) => [id]),
                r14,
              ),
            0,
          );
        const best = total();
        expect(s.imbalance).toBeCloseTo(best, 9);
        for (let a = 0; a < pairs.length; a++)
          for (let b = a + 1; b < pairs.length; b++)
            for (let i = 0; i < 2; i++)
              for (let j = 0; j < 2; j++) {
                const pa = pairs[a] ?? [];
                const pb = pairs[b] ?? [];
                [pa[i], pb[j]] = [pb[j] ?? "", pa[i] ?? ""];
                expect(total()).toBeGreaterThan(best - 1e-9);
                [pa[i], pb[j]] = [pb[j] ?? "", pa[i] ?? ""];
              }
      });

      it("counts a reordered arrangement as the same suggestion", () => {
        // Every restart lands on the same pairs here, in various orders.
        const ids14 = many.slice(0, 14);
        const solo = (skip: number) =>
          generateTeams({
            playerIds: ids14,
            ratings: uneven(ids14),
            config,
            format: { teams: 2, size: 1 },
            skip,
          });
        expect(solo(1)).toEqual(solo(0));
      });

      it("keeps swapping until a full pass finds nothing", () => {
        const ids = Array.from(
          { length: 30 },
          (_, i) => `p${String(i).padStart(2, "0")}`,
        );
        const r = new Map(
          ids.map((id, i) => [
            id,
            { mu: 10 + ((i * 13) % 29) * 1.3, sigma: 1 + (i % 4) / 4 },
          ]),
        );
        const s = ok(
          generateTeams({
            playerIds: ids,
            ratings: r,
            config,
            format: { teams: 2, size: 1 },
          }),
        );
        const pairs = s.matches.map((m) => m.teams.flat());
        const total = () =>
          pairs.reduce(
            (sum, p) =>
              sum +
              score(
                p.map((id) => [id]),
                r,
              ),
            0,
          );
        const best = total();
        for (let a = 0; a < pairs.length; a++)
          for (let b = a + 1; b < pairs.length; b++)
            for (let i = 0; i < 2; i++)
              for (let j = 0; j < 2; j++) {
                const pa = pairs[a] ?? [];
                const pb = pairs[b] ?? [];
                [pa[i], pb[j]] = [pb[j] ?? "", pa[i] ?? ""];
                expect(total()).toBeGreaterThan(best - 1e-9);
                [pa[i], pb[j]] = [pb[j] ?? "", pa[i] ?? ""];
              }
      });

      it("offers distinct arrangements on regenerate, then wraps around", () => {
        const keys = [0, 1, 2, 3].map((skip) => key(gen(skip)));
        expect(new Set(keys).size).toBe(4);
        const last = gen(1000);
        expect(last.matches).toHaveLength(2);
        expect(keys.slice(0, 1)).not.toContain(key(last));
      });
    });

    it("treats a missing skip as 0, and regenerates differently", () => {
      expect(run()).toEqual(run(0));
      expect(run(1).matches[0]?.teams).not.toEqual(run(0).matches[0]?.teams);
      expect(run(1)).toEqual(run(1));
    });
  },
);
