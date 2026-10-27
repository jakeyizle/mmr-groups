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

describe("STATS-004: head-to-head records", { tags: ["STATS-004"] }, () => {
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
