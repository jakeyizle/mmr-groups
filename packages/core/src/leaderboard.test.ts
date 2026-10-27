import { describe, expect, it } from "vitest";

import { leaderboard } from "./leaderboard";
import { DEFAULT_RATING_CONFIG as config, type ReplayMatch } from "./rating";

// Every match at the same instant, so no decay muddies the standings.
const T = "2026-03-01T12:00:00.000Z";
let seq = 0;
function match(teams: string[][], ranks?: number[]): ReplayMatch {
  seq += 1;
  return {
    id: `M${String(seq).padStart(4, "0")}`,
    playedAt: T,
    teams: teams.map((playerIds, i) => ({
      playerIds,
      score: null,
      rank: ranks?.[i] ?? i + 1,
    })),
  };
}

describe(
  "BOARD-001: leaderboard ranks players by displayed rating",
  { tags: ["BOARD-001"] },
  () => {
    it("orders by displayed rating with matches and W/L/T", () => {
      const history = [
        match([["a"], ["b"]]),
        match([["a"], ["c"]]),
        match([["b"], ["c"]]),
        match([["a"], ["b"]], [1, 1]),
      ];
      const board = leaderboard(history, config, T);
      expect(board.map((e) => e.playerId)).toEqual(["a", "b", "c"]);
      const ratings = board.map((e) => e.rating);
      expect([...ratings].sort((x, y) => y - x)).toEqual(ratings);
      expect(
        board.map((e) => [e.rank, e.matches, e.wins, e.losses, e.ties]),
      ).toEqual([
        [1, 3, 2, 0, 1],
        [2, 3, 1, 1, 1],
        [3, 2, 0, 2, 0],
      ]);
      expect(board.every((e) => e.provisional)).toBe(true);
    });

    it("a multi-team 2nd place is a loss; equal ratings share a rank", () => {
      const board = leaderboard([match([["a"], ["b"], ["c"]])], config, T);
      expect(board.find((e) => e.playerId === "b")).toMatchObject({
        wins: 0,
        losses: 1,
      });
      const twin = leaderboard([match([["x"], ["y"]], [1, 1])], config, T);
      expect(twin.map((e) => e.rank)).toEqual([1, 1]);
    });
  },
);

describe(
  "BOARD-002: players who haven't played are listed separately",
  { tags: ["BOARD-002"] },
  () => {
    it("only players with matches are ranked", () => {
      const board = leaderboard([match([["a"], ["b"]])], config, T);
      expect(board.map((e) => e.playerId).sort()).toEqual(["a", "b"]);
    });
  },
);

describe(
  "BOARD-003: leaderboard shows rank change from each player's latest match",
  { tags: ["BOARD-003"] },
  () => {
    it("is the rank just before minus the rank just after that match", () => {
      // One six-way game places p1 … p6 in order.
      const prefix = [match([["p1"], ["p2"], ["p3"], ["p4"], ["p5"], ["p6"]])];
      const before = leaderboard(prefix, config, T);
      const rankOf = (b: typeof before, id: string) =>
        b.find((e) => e.playerId === id)?.rank;
      expect(rankOf(before, "p5")).toBe(5);

      const upset = match([["p5"], ["p1"]]);
      const after = leaderboard([...prefix, upset], config, T);
      const change = (id: string) =>
        after.find((e) => e.playerId === id)?.rankChange;
      expect(rankOf(after, "p5")).toBe(1);
      expect(change("p5")).toBe(4);
      expect(change("p1")).toBe(
        (rankOf(before, "p1") ?? 0) - (rankOf(after, "p1") ?? 0),
      );
      expect(change("p1")).toBeLessThan(0);
    });

    it("is null when the latest match was the player's first", () => {
      const board = leaderboard([match([["a"], ["b"]])], config, T);
      expect(board.map((e) => e.rankChange)).toEqual([null, null]);
    });
  },
);

describe("ordering ties", { tags: ["BOARD-001"] }, () => {
  it("orders equal ratings by ID, whatever order they first played in", () => {
    // z and y tie twice: identical ratings.
    const history = [
      match([["z"], ["y"]], [1, 1]),
      match([["y"], ["z"]], [1, 1]),
    ];
    const board = leaderboard(history, config, T);
    expect(board.map((e) => [e.playerId, e.rank])).toEqual([
      ["y", 1],
      ["z", 1],
    ]);
    const reversed = leaderboard([...history].reverse(), config, T);
    expect(reversed.map((e) => e.playerId)).toEqual(["y", "z"]);
  });
});
