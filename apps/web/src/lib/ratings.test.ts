import {
  leaderboard,
  ratingSeries,
  ratingSystem,
  replay,
  resolveRatingConfig,
} from "@mmr/core";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroupData } from "./groups";
import {
  useLeaderboard,
  usePredictWin,
  useRatingSeries,
  useReplay,
} from "./ratings";

const match = (id: string, winner: string, loser: string, day: number) => ({
  id,
  playedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
  teams: [
    { playerIds: [winner], score: null, rank: 1 },
    { playerIds: [loser], score: null, rank: 2 },
  ],
});

const data = (version: number, matches: ReturnType<typeof match>[]) =>
  ({ group: { version, ratingConfig: null }, matches }) as unknown as GroupData;

const NOW = new Date("2026-02-01T12:00:00Z");
const config = resolveRatingConfig(undefined);

afterEach(() => {
  vi.useRealTimers();
});

describe("rating hooks", { tags: ["BOARD-001", "RATE-001"] }, () => {
  it("compute from the snapshot as of now", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const d = data(1, [match("m1", "a", "b", 1), match("m2", "a", "c", 2)]);
    const asOf = NOW.toISOString();
    expect(renderHook(() => useLeaderboard(d)).result.current).toEqual(
      leaderboard(d.matches, config, asOf),
    );
    expect(renderHook(() => useReplay(d)).result.current).toEqual(
      replay(d.matches, config, asOf),
    );
    expect(renderHook(() => useRatingSeries(d)).result.current).toEqual(
      ratingSeries(d.matches, config, asOf),
    );
  });

  it("recompute when the snapshot version or the day changes, not otherwise", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const hooks = [useLeaderboard, useReplay, useRatingSeries] as const;
    for (const hook of hooks) {
      const one = data(1, [match("m1", "a", "b", 1)]);
      const { result, rerender } = renderHook(({ d }) => hook(d), {
        initialProps: { d: one },
      });
      const first = result.current;
      // Same version: the snapshot is the same, whatever the object.
      rerender({ d: data(1, [match("m1", "a", "b", 1)]) });
      expect(result.current).toBe(first);
      vi.setSystemTime(new Date(NOW.getTime() + 3_600_000));
      rerender({ d: one });
      expect(result.current).toBe(first);

      rerender({ d: data(2, [match("m1", "b", "a", 1)]) });
      expect(result.current).not.toBe(first);
      expect(result.current).not.toEqual(first);
      const second = result.current;

      vi.setSystemTime(new Date(NOW.getTime() + 86_400_000));
      rerender({ d: data(2, [match("m1", "b", "a", 1)]) });
      expect(result.current).not.toBe(second);
      vi.setSystemTime(NOW);
    }
  });
});

describe("usePredictWin", { tags: ["MATCH-016"] }, () => {
  it("predicts from current ratings, new players at the initial rating", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const d = data(1, [match("m1", "a", "b", 1), match("m2", "a", "b", 2)]);
    const predict = renderHook(() => usePredictWin(d)).result.current;
    const system = ratingSystem(config);
    const { players } = replay(d.matches, config, NOW.toISOString());
    const rating = (id: string) => players.get(id) ?? system.initial();
    expect(players.has("a") && players.has("b")).toBe(true);
    const [pa, pb] = predict([["a"], ["b"]]);
    expect([pa, pb]).toEqual(system.predictWin([[rating("a")], [rating("b")]]));
    expect(pa).toBeGreaterThan(0.5);
    expect(predict([["new"], ["b"]])).toEqual(
      system.predictWin([[system.initial()], [rating("b")]]),
    );
  });

  it("follows a newer snapshot", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const { result, rerender } = renderHook(({ d }) => usePredictWin(d), {
      initialProps: { d: data(1, [match("m1", "a", "b", 1)]) },
    });
    const [before] = result.current([["a"], ["b"]]);
    rerender({ d: data(2, [match("m1", "b", "a", 1)]) });
    const [after] = result.current([["a"], ["b"]]);
    expect(before).toBeGreaterThan(0.5);
    expect(after).toBeLessThan(0.5);
  });
});
