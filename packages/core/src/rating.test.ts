import { rate } from "openskill";
import { describe, expect, it } from "vitest";

import {
  compareMatches,
  DEFAULT_RATING_CONFIG as config,
  decay,
  displayRating,
  isProvisional,
  replay,
  resolveRatingConfig,
  ratingSystem,
  type ReplayMatch,
} from "./rating";
import type { MatchTeam } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-01-01T12:00:00.000Z");
const at = (days: number) => new Date(T0 + days * DAY).toISOString();

let seq = 0;
/** `teams` as player-ID lists in placement order (1st, 2nd, …) unless `ranks` is given. */
function match(
  days: number,
  teams: string[][],
  { ranks, scores }: { ranks?: number[]; scores?: number[] } = {},
): ReplayMatch {
  seq += 1;
  return {
    id: `M${String(seq).padStart(4, "0")}`,
    playedAt: at(days),
    teams: teams.map((playerIds, i): MatchTeam => ({
      playerIds,
      score: scores?.[i] ?? null,
      rank: ranks?.[i] ?? i + 1,
    })),
  };
}

const player = (r: ReturnType<typeof replay>, id: string) => {
  const p = r.players.get(id);
  if (!p) throw new Error(`no rating for ${id}`);
  return p;
};
const change = (r: ReturnType<typeof replay>, mid: string, pid: string) => {
  const c = r.matches.get(mid)?.get(pid);
  if (!c) throw new Error(`no change for ${pid} in ${mid}`);
  return c;
};

describe("RATE-013: default rating settings", { tags: ["RATE-013"] }, () => {
  it("are Plackett-Luce, μ 25, σ 25/3, τ 25/300, d 0.5, provisional σ > 5, no scores", () => {
    expect(resolveRatingConfig({})).toEqual({
      model: "plackett-luce",
      mu: 25,
      sigma: 25 / 3,
      tau: 25 / 300,
      decayPerWeek: 0.5,
      provisionalSigma: 5,
      useScores: false,
    });
  });

  it("group overrides replace only the given fields", () => {
    expect(resolveRatingConfig({ decayPerWeek: 1 })).toEqual({
      ...config,
      decayPerWeek: 1,
    });
  });
});

describe(
  "RATE-001: new players start with the default rating",
  { tags: ["RATE-001"] },
  () => {
    it("a player with no matches has no entry, so starts at μ₀/σ₀", () => {
      const r = replay([], config, at(0));
      expect(r.players.size).toBe(0);
      const m = match(0, [["a"], ["b"]]);
      expect(change(replay([m], config, at(0)), m.id, "a").before).toEqual({
        mu: 25,
        sigma: 25 / 3,
      });
    });
  },
);

describe(
  "RATE-002: ratings are derived from match history",
  { tags: ["RATE-002"] },
  () => {
    it("equal replaying each match with openskill in order", () => {
      const m1 = match(0, [["a"], ["b"]]);
      const m2 = match(0, [["b"], ["a"]]);
      const r = replay([m1, m2], config, m2.playedAt);

      const opts = { mu: 25, sigma: 25 / 3, tau: 25 / 300 };
      const init = { mu: 25, sigma: 25 / 3 };
      const [[a1], [b1]] = rate([[init], [init]], { ...opts, rank: [1, 2] });
      const [[b2], [a2]] = rate([[b1], [a1]], { ...opts, rank: [1, 2] });
      expect(player(r, "a")).toMatchObject(a2);
      expect(player(r, "b")).toMatchObject(b2);
    });

    it("is deterministic and independent of input order", () => {
      const history = [
        match(0, [
          ["a", "b"],
          ["c", "d"],
        ]),
        match(3, [
          ["a", "c"],
          ["b", "d"],
        ]),
        match(9, [
          ["a", "d"],
          ["b", "c"],
        ]),
      ];
      const r1 = replay(history, config, at(20));
      const r2 = replay([...history].reverse(), config, at(20));
      expect(r2).toEqual(r1);
      expect(replay(history, config, at(20))).toEqual(r1);
    });
  },
);

describe(
  "MATCH-006: matches are ordered by date-time",
  { tags: ["MATCH-006"] },
  () => {
    it("applies matches by playedAt, then by creation (ID) order", () => {
      const later = match(5, [["a"], ["b"]]);
      const earlier = match(1, [["b"], ["a"]]);
      // Same playedAt: the first-created one is applied first.
      const sameFirst = match(7, [["a"], ["b"]]);
      const sameSecond = { ...match(7, [["b"], ["a"]]) };
      const r = replay([sameSecond, later, sameFirst, earlier], config, at(7));
      const ordered = replay(
        [earlier, later, sameFirst, sameSecond],
        config,
        at(7),
      );
      expect(r).toEqual(ordered);
      // σ also decays over the 4 days between them; μ carries over exactly.
      expect(change(r, later.id, "a").before.mu).toBe(
        change(r, earlier.id, "a").after.mu,
      );
      expect(change(r, sameSecond.id, "a").before).toEqual(
        change(r, sameFirst.id, "a").after,
      );
    });
  },
);

describe(
  "RATE-003: winning raises and losing lowers skill estimates",
  { tags: ["RATE-003"] },
  () => {
    it("winners gain μ, losers lose μ, everyone's σ shrinks", () => {
      const m = match(0, [
        ["w1", "w2"],
        ["l1", "l2"],
      ]);
      const r = replay([m], config, m.playedAt);
      for (const id of ["w1", "w2"]) {
        const { before, after } = change(r, m.id, id);
        expect(after.mu).toBeGreaterThan(before.mu);
        expect(after.sigma).toBeLessThan(before.sigma);
      }
      for (const id of ["l1", "l2"]) {
        const { before, after } = change(r, m.id, id);
        expect(after.mu).toBeLessThan(before.mu);
        expect(after.sigma).toBeLessThan(before.sigma);
      }
    });
  },
);

describe(
  "RATE-004: upsets move ratings more than expected results",
  { tags: ["RATE-004"] },
  () => {
    it("the weak team beating the strong one moves μ more", () => {
      // "strong" beat "weak" five times to establish the gap.
      const setup = Array.from({ length: 5 }, (_, i) =>
        match(i, [["strong"], ["weak"]]),
      );
      const expected = match(5, [["strong"], ["weak"]]);
      const upset = match(5, [["weak"], ["strong"]]);

      const delta = (m: ReplayMatch) => {
        const c = change(
          replay([...setup, m], config, m.playedAt),
          m.id,
          "weak",
        );
        return Math.abs(c.after.mu - c.before.mu);
      };
      expect(delta(upset)).toBeGreaterThan(delta(expected));
    });
  },
);

describe(
  "RATE-005: multi-team matches use placements",
  { tags: ["RATE-005"] },
  () => {
    it("1st gains most, 4th loses most, in placement order", () => {
      const m = match(0, [["p1"], ["p2"], ["p3"], ["p4"]]);
      const r = replay([m], config, m.playedAt);
      const deltas = ["p1", "p2", "p3", "p4"].map((id) => {
        const c = change(r, m.id, id);
        return c.after.mu - c.before.mu;
      });
      expect(deltas[0]).toBeGreaterThan(0);
      expect(deltas[3]).toBeLessThan(0);
      expect([...deltas].sort((a, b) => b - a)).toEqual(deltas);
    });
  },
);

describe("RATE-006: ties are rated as ties", { tags: ["RATE-006"] }, () => {
  it("equal players who tie keep equal μ; a tie isn't a win", () => {
    const tie = match(0, [["a"], ["b"]], { ranks: [1, 1] });
    const r = replay([tie], config, tie.playedAt);
    expect(player(r, "a").mu).toBeCloseTo(player(r, "b").mu, 10);
    expect(player(r, "a").mu).toBeCloseTo(25, 10);

    const win = match(0, [["a"], ["b"]]);
    const w = replay([win], config, win.playedAt);
    expect(player(w, "a").mu).toBeGreaterThan(player(r, "a").mu);
  });
});

describe(
  "RATE-007: inactivity increases uncertainty",
  { tags: ["RATE-007"] },
  () => {
    it("10 weeks inactive: σ = √(σ² + 10 × 0.5²), μ unchanged", () => {
      const m = match(0, [["a"], ["b"]]);
      const atMatch = player(replay([m], config, m.playedAt), "a");
      const later = player(replay([m], config, at(70)), "a");
      expect(later.mu).toBe(atMatch.mu);
      expect(later.sigma).toBeCloseTo(
        Math.sqrt(atMatch.sigma ** 2 + 10 * 0.5 ** 2),
        10,
      );
    });

    it("is capped at σ₀", () => {
      const d = decay({ mu: 30, sigma: 8 }, at(0), at(7 * 520), config);
      expect(d).toEqual({ mu: 30, sigma: 25 / 3 });
    });
  },
);

describe(
  "RATE-014: inactivity is applied before a player's next match",
  { tags: ["RATE-014"] },
  () => {
    it("the returning player's 'before' rating includes 10 weeks of decay", () => {
      const first = match(0, [["a"], ["b"]]);
      const back = match(70, [["a"], ["c"]]);
      const r = replay([first, back], config, back.playedAt);
      const afterFirst = change(r, first.id, "a").after;
      expect(change(r, back.id, "a").before).toEqual(
        decay(afterFirst, first.playedAt, back.playedAt, config),
      );
      expect(change(r, back.id, "a").before.sigma).toBeGreaterThan(
        afterFirst.sigma,
      );
    });
  },
);

describe(
  "RATE-008: inactive players stay on the leaderboard",
  { tags: ["RATE-008"] },
  () => {
    it("still rated months later, with a lower displayed rating", () => {
      const m = match(0, [["a"], ["b"]]);
      const now = player(replay([m], config, m.playedAt), "a");
      const months = player(replay([m], config, at(120)), "a");
      expect(displayRating(months)).toBeLessThan(displayRating(now));
    });
  },
);

describe(
  "RATE-009: displayed rating is conservative",
  { tags: ["RATE-009"] },
  () => {
    it("is round(1000 + 20 × (μ − 3σ))", () => {
      expect(displayRating({ mu: 25, sigma: 25 / 3 })).toBe(1000);
      expect(displayRating({ mu: 30.12, sigma: 2.5 })).toBe(1452);
    });
  },
);

describe(
  "RATE-010: uncertain ratings are marked provisional",
  { tags: ["RATE-010"] },
  () => {
    it("σ above 5 is provisional, 5 or below isn't", () => {
      expect(isProvisional({ mu: 25, sigma: 5.01 }, config)).toBe(true);
      expect(isProvisional({ mu: 25, sigma: 5 }, config)).toBe(false);
    });
  },
);

describe(
  "RATE-011: scores don't affect ratings",
  { tags: ["RATE-011"] },
  () => {
    it("11–0 and 11–9 give identical ratings", () => {
      const blowout = match(0, [["a"], ["b"]], { scores: [11, 0] });
      const close = {
        ...blowout,
        teams: blowout.teams.map((t, i) => ({
          ...t,
          score: [11, 9][i] ?? null,
        })),
      };
      expect(replay([close], config, at(1))).toEqual(
        replay([blowout], config, at(1)),
      );
    });
  },
);

describe(
  "RATE-012: each match records rating changes",
  { tags: ["RATE-012"] },
  () => {
    it("every participant has before and after", () => {
      const m = match(0, [
        ["a", "b"],
        ["c", "d"],
      ]);
      const r = replay([m], config, m.playedAt);
      expect([...(r.matches.get(m.id)?.keys() ?? [])].sort()).toEqual([
        "a",
        "b",
        "c",
        "d",
      ]);
      expect(change(r, m.id, "a").after).not.toEqual(
        change(r, m.id, "a").before,
      );
    });
  },
);

describe("compareMatches", { tags: ["MATCH-006"] }, () => {
  const m = (id: string, playedAt: string) => ({ id, playedAt, teams: [] });
  it("orders by date-time, then by ID", () => {
    expect(compareMatches(m("B", at(0)), m("A", at(1)))).toBe(-1);
    expect(compareMatches(m("A", at(1)), m("B", at(0)))).toBe(1);
    expect(compareMatches(m("A", at(0)), m("B", at(0)))).toBe(-1);
    expect(compareMatches(m("B", at(0)), m("A", at(0)))).toBe(1);
    expect(compareMatches(m("A", at(0)), m("A", at(0)))).toBe(0);
  });
});

describe("ratingSystem", { tags: ["RATE-013"] }, () => {
  it("rates with the group's settings", () => {
    const custom = resolveRatingConfig({ mu: 30, sigma: 6, tau: 0.5 });
    const system = ratingSystem(custom);
    expect(system.initial()).toEqual({ mu: 30, sigma: 6 });
    const teams = [[system.initial()], [system.initial()]];
    const options = { mu: 30, sigma: 6, tau: 0.5 };
    expect(
      system.rateMatch(teams, [
        { playerIds: ["a"], rank: 1, score: null },
        { playerIds: ["b"], rank: 2, score: null },
      ]),
    ).toEqual(rate(teams, { ...options, rank: [1, 2] }));
    expect(
      system.rateMatch(teams, [
        { playerIds: ["a"], rank: 1, score: null },
        { playerIds: ["b"], rank: 2, score: null },
      ]),
    ).not.toEqual(rate(teams, { rank: [1, 2] }));
    expect(system.predictWin(teams)).toEqual([0.5, 0.5]);
  });
});
