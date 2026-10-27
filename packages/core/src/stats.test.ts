import { describe, expect, it } from "vitest";

import { DEFAULT_RATING_CONFIG as config, type ReplayMatch } from "./rating";
import {
  activity,
  bestDuos,
  biggestUpsets,
  longestStreaks,
  playerStats,
  ratingHistogram,
  ratingSeries,
} from "./stats";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-03-02T12:00:00.000Z"); // a Monday
const at = (days: number) => new Date(T0 + days * DAY).toISOString();

let seq = 0;
/** Teams as player-ID strings ("ab" = a & b), in placement order unless ranks given. */
function m(days: number, teams: string[], ranks?: number[]): ReplayMatch {
  seq += 1;
  return {
    id: `M${String(seq).padStart(4, "0")}`,
    playedAt: at(days),
    teams: teams.map((ids, i) => ({
      playerIds: ids.split(""),
      score: null,
      rank: ranks?.[i] ?? i + 1,
    })),
  };
}

/** Monday 00:00 UTC of the instant's week. */
const mondayUtc = (d: Date) => {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day),
  );
};

describe(
  "STATS-002: player record and streaks",
  { tags: ["STATS-002"] },
  () => {
    it("counts W/L/T, win rate with ties as half, current and longest win streak", () => {
      const history = [
        m(0, ["a", "b"]), // W
        m(1, ["a", "b"]), // W
        m(2, ["a", "b"]), // W
        m(3, ["b", "a"]), // L
        m(4, ["a", "b"], [1, 1]), // T
        m(5, ["a", "b"]), // W
        m(6, ["a", "b", "c"]), // W (ranked first of 3)
        m(7, ["c", "a", "b"]), // L (2nd of 3)
      ];
      const s = playerStats(history, "a");
      expect(s.record).toEqual({
        matches: 8,
        wins: 5,
        losses: 2,
        ties: 1,
        winRate: 5.5 / 8,
      });
      expect(s.longestWinStreak).toBe(3);
      expect(s.currentStreak).toEqual({ outcome: "loss", length: 1 });
    });

    it("a tie ends a win streak", () => {
      const s = playerStats(
        [m(0, ["a", "b"]), m(1, ["a", "b"], [1, 1]), m(2, ["a", "b"])],
        "a",
      );
      expect(s.longestWinStreak).toBe(1);
      expect(s.currentStreak).toEqual({ outcome: "win", length: 1 });
    });
  },
);

describe("STATS-003: best and worst partners", { tags: ["STATS-003"] }, () => {
  it("up to 3 each with ≥3 shared matches; ties by more matches then name", () => {
    const history = [
      // with b: 3-0
      ...[0, 1, 2].map((d) => m(d, ["ab", "xy"])),
      // with c: 2-1
      m(3, ["ac", "xy"]),
      m(4, ["ac", "xy"]),
      m(5, ["xy", "ac"]),
      // with d: 0-3
      ...[6, 7, 8].map((d) => m(d, ["xy", "ad"])),
      // with e: 2 shared only (excluded)
      m(9, ["ae", "xy"]),
      m(10, ["ae", "xy"]),
      // with f: 2-1-1 (2.5/4 = 0.625) vs g: 2-1 over 3 (0.667)
      m(11, ["af", "xy"]),
      m(12, ["af", "xy"]),
      m(13, ["xy", "af"]),
      m(14, ["af", "xy"], [1, 1]),
    ];
    const { partners } = playerStats(history, "a");
    expect(partners.best.map((p) => p.playerId)).toEqual(["b", "c", "f"]);
    expect(partners.worst.map((p) => p.playerId)).toEqual(["d"]);
    expect(partners.best[0]).toMatchObject({ matches: 3, wins: 3, winRate: 1 });
  });
});

describe("partner lists", { tags: ["STATS-003"] }, () => {
  it("keep the 3 best, then the 3 worst of the rest, each in order", () => {
    // Three matches with each partner; wins in insertion order b..i.
    const wins: Record<string, number> = {
      b: 1,
      c: 3,
      d: 0,
      e: 2,
      f: 3,
      g: 1,
      h: 2,
      i: 0,
    };
    const history = Object.entries(wins).flatMap(([p, w], n) =>
      [0, 1, 2].map((d) =>
        m(n * 3 + d, d < w ? [`a${p}`, "xy"] : ["xy", `a${p}`]),
      ),
    );
    const { partners } = playerStats(history, "a");
    expect(partners.best.map((p) => p.playerId)).toEqual(["c", "f", "e"]);
    expect(partners.worst.map((p) => p.playerId)).toEqual(["d", "i", "b"]);
  });

  it("rank equal win rates by more shared matches", () => {
    const history = [3, 4, 5].flatMap((n, k) =>
      Array.from({ length: n }, (_, d) =>
        m(k * 10 + d, [`a${"bcd"[k] ?? ""}`, "xy"]),
      ),
    );
    const { partners } = playerStats(history, "a");
    expect(partners.best.map((p) => p.playerId)).toEqual(["d", "c", "b"]);
  });
});

describe("STATS-004: head-to-head records", { tags: ["STATS-004"] }, () => {
  it("lists opponents by matches played, then name", () => {
    const history = [
      ...[0, 1, 2].map((d) => m(d, ["a", "p"])),
      ...[3, 4, 5, 6].map((d) => m(d, ["a", "q"])),
      ...[7, 8, 9, 10, 11].map((d) => m(d, ["r", "a"])),
      ...[12, 13, 14, 15].map((d) => m(d, ["a", "s"])),
    ];
    expect(playerStats(history, "a").headToHead.map((h) => h.playerId)).toEqual(
      ["r", "q", "s", "p"],
    );
  });

  it("wins, losses and ties against each opponent by relative placement", () => {
    const history = [
      m(0, ["a", "b"]),
      m(1, ["b", "a"]),
      m(2, ["a", "b"], [1, 1]),
      m(3, ["c", "a", "b"]), // vs c: loss, vs b: win
      m(4, ["a", "c"]),
      m(5, ["a", "c"]),
    ];
    const { headToHead } = playerStats(history, "a");
    expect(
      headToHead.map((h) => [h.playerId, h.wins, h.losses, h.ties]),
    ).toEqual([
      ["b", 2, 1, 1],
      ["c", 2, 1, 0],
    ]);
  });
});

describe(
  "STATS-001: player rating over time",
  { tags: ["STATS-001", "STATS-006"] },
  () => {
    it("has each player's displayed rating after each of their matches, in order", () => {
      const history = [m(2, ["a", "b"]), m(0, ["a", "c"]), m(1, ["b", "c"])];
      const series = ratingSeries(history, config, at(3));
      expect(series.get("a")?.map((p) => p.at)).toEqual([at(0), at(2)]);
      expect(series.get("b")?.map((p) => p.at)).toEqual([at(1), at(2)]);
      const [first, second] = series.get("a") ?? [];
      // a won both: rising.
      expect(second?.rating).toBeGreaterThan(first?.rating ?? Infinity);
    });
  },
);

describe("STATS-007: group activity", { tags: ["STATS-007"] }, () => {
  it("matches per week for 12 weeks, and the 5 most active in 30 days", () => {
    const now = new Date(at(7 * 11 + 2)); // Wednesday of the 12th week
    const history = [
      m(0, ["a", "b"]), // week 1
      m(1, ["a", "c"]), // week 1
      m(7 * 5, ["a", "b"]), // week 6
      m(7 * 11, ["a", "b"]), // week 12
      m(7 * 11 + 1, ["c", "d"]), // week 12
      m(7 * 11 + 1, ["e", "f"]),
      m(-7, ["a", "b"]), // before the window
    ];
    const { weeks, mostActive } = activity(history, now, mondayUtc);
    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toEqual({
      week: new Date(T0 - 12 * 60 * 60 * 1000).toISOString(),
      matches: 2,
    });
    expect(weeks.map((w) => w.matches)).toEqual([
      2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3,
    ]);
    expect(mostActive.map((p) => [p.playerId, p.matches])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 1],
      ["d", 1],
      ["e", 1],
    ]);
  });
});

describe("STATS-008: best duos", { tags: ["STATS-008"] }, () => {
  it("teammate pairs with the best win rate together, ≥3 shared matches", () => {
    const history = [
      ...[0, 1, 2].map((d) => m(d, ["ab", "cd"])), // ab 3-0, cd 0-3
      m(3, ["ac", "bd"]),
      m(4, ["ac", "bd"]),
      m(5, ["bd", "ac"]), // ac 2-1, bd 1-2
    ];
    const duos = bestDuos(history);
    expect(duos.map((d) => [d.playerIds.join(""), d.wins, d.losses])).toEqual([
      ["ab", 3, 0],
      ["ac", 2, 1],
      ["bd", 1, 2],
      ["cd", 0, 3],
    ]);
  });
});

describe("STATS-009: biggest upsets", { tags: ["STATS-009"] }, () => {
  it("2-team wins sorted by the winner's pre-match win probability", () => {
    const setup = [0, 1, 2, 3].map((d) => m(d, ["s", "w"])); // s is strong
    const upset = m(4, ["w", "s"]);
    const expected = m(5, ["s", "w"]);
    const three = m(6, ["w", "s", "x"]); // not a 2-team match
    const ups = biggestUpsets(
      [...setup, upset, expected, three],
      config,
      at(7),
    );
    expect(ups[0]).toMatchObject({ matchId: upset.id, winner: 0 });
    expect(ups[0]?.probability).toBeLessThan(0.5);
    expect(ups.map((u) => u.matchId)).not.toContain(three.id);
    const probs = ups.map((u) => u.probability);
    expect([...probs].sort((a, b) => a - b)).toEqual(probs);
  });
});

describe("STATS-010: longest streaks", { tags: ["STATS-010"] }, () => {
  it("each player's longest win streak, longest first", () => {
    const history = [
      m(0, ["a", "b"]),
      m(1, ["a", "b"]),
      m(2, ["a", "b"]),
      m(3, ["b", "a"]),
      m(4, ["c", "a"]),
      m(5, ["c", "b"]),
    ];
    expect(longestStreaks(history)).toEqual([
      { playerId: "a", length: 3 },
      { playerId: "c", length: 2 },
      { playerId: "b", length: 1 },
    ]);
  });
});

describe("STATS-011: rating distribution", { tags: ["STATS-011"] }, () => {
  it("buckets of 50 with no gaps", () => {
    expect(ratingHistogram([1000, 1049, 1050, 1180, 951])).toEqual([
      { from: 950, count: 1 },
      { from: 1000, count: 2 },
      { from: 1050, count: 1 },
      { from: 1100, count: 0 },
      { from: 1150, count: 1 },
    ]);
    expect(ratingHistogram([])).toEqual([]);
  });
});

describe(
  "playerStats edges",
  { tags: ["STATS-002", "STATS-003", "STATS-004"] },
  () => {
    it("reads history in date order and skips matches without the player", () => {
      const history = [
        m(2, ["b", "a"]),
        m(0, ["a", "b"]),
        m(1, ["a", "b"]),
        m(3, ["c", "d"]),
      ];
      const s = playerStats(history, "a");
      expect(s.record.matches).toBe(3);
      expect(s.longestWinStreak).toBe(2);
      expect(s.currentStreak).toEqual({ outcome: "loss", length: 1 });
    });

    it("extends the current streak", () => {
      const s = playerStats(
        [m(0, ["b", "a"]), m(1, ["a", "b"]), m(2, ["a", "b"])],
        "a",
      );
      expect(s.currentStreak).toEqual({ outcome: "win", length: 2 });
    });

    it("orders partners by win rate, then shared matches, then name; worst excludes best", () => {
      // Partners of a (3+ shared each): b 3/3, c 2/3, g 2/6 and f 1/3 (equal rates: more matches first), e 0/3.
      const games = (p: string, results: number[]) =>
        results.map((rank, i) =>
          m(i, [`a${p}`, "xy"], [rank, rank === 3 ? 1 : 3 - rank]),
        );
      const history = [
        ...games("b", [1, 1, 1]),
        ...games("c", [1, 1, 2]),
        ...games("g", [1, 1, 2, 2, 2, 2]),
        ...games("e", [2, 2, 2]),
        ...games("f", [1, 2, 2]),
      ];
      const s = playerStats(history, "a");
      expect(s.partners.best.map((p) => p.playerId)).toEqual(["b", "c", "g"]);
      expect(s.partners.worst.map((p) => p.playerId)).toEqual(["e", "f"]);
    });

    it("breaks partner ties by shared matches, then name", () => {
      const history = [
        ...[0, 1, 2, 3].map((d) => m(d, ["az", "xy"])),
        ...[4, 5, 6].map((d) => m(d, ["ay", "xw"])),
        ...[7, 8, 9].map((d) => m(d, ["ab", "xw"])),
      ];
      const names: Record<string, string> = { z: "Zed", y: "Bea", b: "Cal" };
      expect(
        playerStats(history, "a", (id) => names[id] ?? id).partners.best.map(
          (p) => p.playerId,
        ),
      ).toEqual(["z", "y", "b"]);
    });

    it("counts head-to-head ties, and lists opponents with 3+ matches, most first, then by name", () => {
      const history = [
        m(0, ["a", "b"], [1, 1]),
        m(1, ["a", "b"]),
        m(2, ["b", "a"]),
        m(3, ["a", "b"]),
        m(4, ["a", "c"]),
        m(5, ["a", "c"]),
        m(6, ["c", "a"]),
        m(7, ["a", "d"]),
        m(8, ["a", "d"]),
      ];
      const names: Record<string, string> = { c: "Ann" };
      const h2h = playerStats(history, "a", (id) => names[id] ?? id).headToHead;
      expect(h2h.map((p) => [p.playerId, p.wins, p.losses, p.ties])).toEqual([
        ["b", 2, 1, 1],
        ["c", 2, 1, 0],
      ]);
      const tied = playerStats(
        history
          .slice(4, 7)
          .concat([m(9, ["a", "e"]), m(10, ["a", "e"]), m(11, ["a", "e"])]),
        "a",
        (id) => names[id] ?? id,
      );
      expect(tied.headToHead.map((p) => p.playerId)).toEqual(["c", "e"]);
    });
  },
);

describe("activity edges", { tags: ["STATS-007"] }, () => {
  const now = new Date(at(40));
  it("counts the last 30 days inclusive, nothing ahead of now, and no matches outside the weeks", () => {
    const history = [
      m(10, ["a", "b"]), // exactly 30 days ago
      m(9.99, ["c", "d"]), // just before
      m(40, ["e", "f"]), // exactly now
      m(40.01, ["g", "h"]), // ahead
      m(-200, ["i", "j"]), // before the 12 weeks
    ];
    const r = activity(history, now, mondayUtc);
    expect(r.mostActive.map((p) => p.playerId).sort()).toEqual([
      "a",
      "b",
      "e",
      "f",
    ]);
    expect(r.weeks.reduce((n, w) => n + w.matches, 0)).toBe(4);
  });

  it("ranks the most active by matches, then by name, top five", () => {
    const history = [
      m(35, ["ab", "cd"]),
      m(36, ["a", "c"]),
      m(37, ["a", "e"]),
      m(38, ["f", "g"]),
    ];
    const names: Record<string, string> = { b: "Zed", d: "Amy" };
    const r = activity(history, now, mondayUtc, (id) => names[id] ?? id);
    expect(r.mostActive).toEqual([
      { playerId: "a", matches: 3 },
      { playerId: "c", matches: 2 },
      { playerId: "d", matches: 1 },
      { playerId: "e", matches: 1 },
      { playerId: "f", matches: 1 },
    ]);
  });
});

describe("bestDuos edges", { tags: ["STATS-008"] }, () => {
  it("merges a duo listed in either order, needs 3 matches, and ranks by win rate, matches, then names", () => {
    const history = [
      m(0, ["ab", "cd"]),
      m(1, ["ba", "cd"]),
      m(2, ["ab", "dc"], [2, 1]),
      m(3, ["ef", "gh"]),
      m(4, ["fe", "gh"]),
      m(5, ["ef", "gh"], [2, 1]),
      m(6, ["ef", "gh"]),
      m(7, ["ij", "kl"]),
      m(8, ["ij", "kl"]),
    ];
    const duos = bestDuos(history);
    expect(duos.map((d) => [d.playerIds, d.matches])).toEqual([
      [["e", "f"], 4],
      [["a", "b"], 3],
      [["c", "d"], 3],
      [["g", "h"], 4],
    ]);
  });

  it("breaks win-rate ties by matches together", () => {
    const history = [
      ...[0, 1, 2].map((d) => m(d, ["pq", "xy"])),
      ...[3, 4, 5, 6].map((d) => m(d, ["rs", "xy"])),
    ];
    expect(
      bestDuos(history)
        .slice(0, 2)
        .map((d) => d.playerIds),
    ).toEqual([
      ["r", "s"],
      ["p", "q"],
    ]);
  });

  it("breaks full ties by the names", () => {
    const history = [0, 1, 2].flatMap((d) => [
      m(d, ["yz", "ab"]),
      m(d + 10, ["cd", "wx"]),
    ]);
    const names: Record<string, string> = {
      y: "Ann",
      z: "Bo",
      c: "Zoe",
      d: "Al",
    };
    const duos = bestDuos(history, (id) => names[id] ?? id);
    expect(duos.slice(0, 2).map((d) => d.playerIds)).toEqual([
      ["c", "d"],
      ["y", "z"],
    ]);
  });
});

describe("list limits", () => {
  it(
    "keeps the top 5 duos, upsets and streaks",
    { tags: ["STATS-008", "STATS-009", "STATS-010"] },
    () => {
      const pairs = ["ab", "cd", "ef", "gh", "ij", "kl"];
      const history = pairs.flatMap((p, k) =>
        [0, 1, 2].map((d) => m(k * 10 + d, [p, "yz"])),
      );
      expect(bestDuos(history)).toHaveLength(5);
      expect(longestStreaks(history)).toHaveLength(5);
      // Every decisive 2-team match is a candidate.
      expect(biggestUpsets(history, config, at(1000))).toHaveLength(5);
    },
  );
});

describe("default names", () => {
  it("break ties by ID", { tags: ["STATS-008", "STATS-010"] }, () => {
    const history = [0, 1, 2].flatMap((d) => [
      m(d, ["yz", "ab"]),
      m(d + 10, ["cd", "wx"]),
    ]);
    expect(
      bestDuos(history)
        .slice(0, 2)
        .map((d) => d.playerIds),
    ).toEqual([
      ["c", "d"],
      ["y", "z"],
    ]);
    expect(
      longestStreaks([m(0, ["z", "b"]), m(1, ["c", "d"])]).map(
        (s) => s.playerId,
      ),
    ).toEqual(["c", "z"]);
  });

  it("separate names in a duo's label", { tags: ["STATS-008"] }, () => {
    const names: Record<string, string> = { r: "AB", s: "C", p: "A", q: "BC" };
    const history = [0, 1, 2].flatMap((d) => [
      m(d, ["rs", "wx"]),
      m(d + 10, ["pq", "wx"]),
    ]);
    expect(
      bestDuos(history, (id) => names[id] ?? id)
        .slice(0, 2)
        .map((d) => d.playerIds),
    ).toEqual([
      ["p", "q"],
      ["r", "s"],
    ]);
  });
});

describe("biggestUpsets edges", { tags: ["STATS-009"] }, () => {
  it("finds the winner on either side, skips ties, and orders by probability then match", () => {
    const history = [
      m(0, ["a", "b"]),
      m(1, ["a", "b"]),
      m(2, ["b", "a"]), // upset: b was the underdog
      m(3, ["a", "b"], [1, 1]), // tie: never an upset
      m(4, ["c", "d"]),
      m(5, ["e", "f"]),
    ];
    const upsets = biggestUpsets(history, config, at(10));
    const third = history[2];
    expect(upsets[0]).toMatchObject({ matchId: third?.id, winner: 0 });
    expect(upsets.map((u) => u.matchId)).not.toContain(history[3]?.id);
    // Even matches have equal odds: ordered by match ID.
    const even = upsets
      .filter((u) => u.probability === 0.5)
      .map((u) => u.matchId);
    expect(even).toEqual([...even].sort());
    expect(even).toHaveLength(3);
    const flipped = biggestUpsets(
      history.map((x) => ({ ...x, teams: [...x.teams].reverse() })),
      config,
      at(10),
    );
    expect(flipped[0]).toMatchObject({ matchId: third?.id, winner: 1 });
  });
});

describe("longestStreaks edges", { tags: ["STATS-010"] }, () => {
  it("reads history in date order, leaves out players without wins, and breaks ties by name", () => {
    const history = [
      m(2, ["a", "b"]),
      m(0, ["b", "a"]),
      m(1, ["a", "b"]),
      m(3, ["c", "d"]),
    ];
    const names: Record<string, string> = { c: "Al" };
    expect(longestStreaks(history, (id) => names[id] ?? id)).toEqual([
      { playerId: "a", length: 2 },
      { playerId: "c", length: 1 },
      { playerId: "b", length: 1 },
    ]);
  });
});

describe("ratingHistogram edges", { tags: ["STATS-011"] }, () => {
  it("is empty without ratings", () => {
    expect(ratingHistogram([])).toEqual([]);
  });
});
