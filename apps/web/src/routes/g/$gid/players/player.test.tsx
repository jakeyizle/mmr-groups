import {
  leaderboard,
  playerStats,
  ratingSeries,
  resolveRatingConfig,
} from "@mmr/core";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SERIES } from "@/lib/charts";
import type { GroupData } from "@/lib/groups";

import { match, PLAYERS, snapshot } from "../../../../../test/fixtures";
import { renderRoute, stubApi } from "../../../../../test/render";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const D = {
  id: "d",
  displayName: "Dee",
  role: "viewer",
  linked: false,
} as const;

// Recharts draws nothing in jsdom: render the props instead.
vi.mock("@/components/charts/rating-chart", () => ({
  RatingChart: (p: { label: string; series: unknown }) => (
    <pre aria-label={p.label}>{JSON.stringify(p.series)}</pre>
  ),
}));

function open(pid: string, data: GroupData) {
  stubApi({
    "GET /api/me": () => ({ user: { id: "u1", name: "Ann" } }),
    "GET /api/groups/g1": () => data,
  });
  return renderRoute(`/g/g1/players/${pid}`);
}

// Doubles: a wins, wins, ties, loses.
const MATCHES = [
  match("m1", 0, [
    [["a", "b"], 1],
    [["c", "d"], 2],
  ]),
  match("m2", 1, [
    [["a", "c"], 1],
    [["b", "gone"], 2],
  ]),
  match("m3", 2, [
    [["a", "b"], 1],
    [["c", "d"], 1],
  ]),
  match("m4", 3, [
    [["b", "c"], 1],
    [["a", "d"], 2],
  ]),
];
const data = (matches = MATCHES) =>
  snapshot({
    group: { teamFormat: { kind: "fixed", teams: 2, size: 2 } },
    players: [...PLAYERS, D],
    matches,
  });

// Three shared matches each, so every pair qualifies (MIN_SHARED).
const PAIRS = [
  ...[1, 1, 2].map((rank, i) =>
    match(`p${String(i)}`, i, [
      [["a", "b"], rank],
      [["c", "gone"], 3 - rank],
    ]),
  ),
  ...[1, 2, 2].map((rank, i) =>
    match(`q${String(i)}`, 10 + i, [
      [["a", "d"], rank],
      [["c", "gone"], 3 - rank],
    ]),
  ),
];

afterEach(() => {
  vi.useRealTimers();
});

describe(
  "player profile",
  { tags: ["STATS-002", "STATS-003", "STATS-004"] },
  () => {
    it("shows rank and rating", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open("a", data());
      expect(await screen.findByRole("heading", { name: "Ann" })).toBeTruthy();
      const entry = leaderboard(
        MATCHES,
        resolveRatingConfig(undefined),
        NOW.toISOString(),
      ).find((e) => e.playerId === "a");
      expect(
        screen.getByText(`#${String(entry?.rank)} on the leaderboard`),
      ).toBeTruthy();
      expect(screen.getByText(String(entry?.rating))).toBeTruthy();
      expect(screen.getByText("Provisional")).toBeTruthy();
    });

    it("summarises the record and streaks", async () => {
      open("a", data());
      const record = within(
        await screen.findByRole("region", { name: "Record" }),
      );
      const value = (label: string) =>
        record.getByText(label).nextElementSibling?.textContent;
      const stats = playerStats(MATCHES, "a", (id) => id);
      expect(value("Record")).toBe("2–1–1");
      expect(value("Win rate")).toBe(
        `${String(Math.round(stats.record.winRate * 100))}%`,
      );
      expect(value("Matches")).toBe("4");
      expect(value("Streak")).toBe("L1");
      expect(value("Best streak")).toBe("W2");
    });

    it("charts the player's rating", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open("a", data());
      const chart = await screen.findByLabelText("Ann's rating over time");
      expect(JSON.parse(chart.textContent)).toEqual([
        {
          id: "a",
          name: "Ann",
          color: SERIES[0],
          points: ratingSeries(
            MATCHES,
            resolveRatingConfig(undefined),
            NOW.toISOString(),
          ).get("a"),
        },
      ]);
    });

    it("updates when the snapshot does", async () => {
      const { queryClient } = open("a", data());
      const record = within(
        await screen.findByRole("region", { name: "Record" }),
      );
      const next = data([
        ...MATCHES,
        match("m5", 4, [
          [["a", "b"], 1],
          [["c", "d"], 2],
        ]),
      ]);
      next.players = next.players.map((p) =>
        p.id === "b" ? { ...p, displayName: "Bobby" } : p,
      );
      queryClient.setQueryData(["group", "g1"], next);
      await waitFor(() => {
        expect(
          record.getByText("Matches").nextElementSibling?.textContent,
        ).toBe("5");
      });
      expect(screen.getAllByText("Bobby").length).toBeGreaterThan(0);
    });

    it("shows ties only when there are some", async () => {
      open("b", data(MATCHES.slice(0, 2)));
      const record = within(
        await screen.findByRole("region", { name: "Record" }),
      );
      expect(record.getByText("Record").nextElementSibling?.textContent).toBe(
        "1–1",
      );
      expect(record.getByText("Streak").nextElementSibling?.textContent).toBe(
        "L1",
      );
    });

    it("lists partners and opponents by record, naming removed players", async () => {
      open("a", data(PAIRS));
      await screen.findByRole("heading", { name: "Ann" });
      const stats = playerStats(PAIRS, "a", (id) => id);
      const names: Record<string, string> = {
        b: "Bob",
        c: "Cy",
        d: "Dee",
        gone: "Removed player",
      };
      const rows = (title: string) =>
        within(screen.getByRole("list", { name: title }))
          .getAllByRole("listitem")
          .map((li) => li.textContent);
      const fmt = (p: (typeof stats.headToHead)[number]) =>
        `${names[p.playerId] ?? ""}${String(p.wins)}–${String(p.losses)}${p.ties ? `–${String(p.ties)}` : ""} · ${String(Math.round(p.winRate * 100))}%`;
      expect(rows("Head to head")).toEqual(stats.headToHead.map(fmt));
      expect(
        rows("Head to head").some((r) => r.startsWith("Removed player")),
      ).toBe(true);
      expect(rows("Best partners")).toEqual(stats.partners.best.map(fmt));
      // Both partners are among the best three, so none is "toughest".
      expect(stats.partners.worst).toEqual([]);
      expect(
        screen.queryByRole("list", { name: "Toughest partnerships" }),
      ).toBeNull();
    });

    it("omits empty pair lists", async () => {
      const singles = [0, 1, 2].map((h) =>
        match(`m${String(h)}`, h, [
          [["a"], 1],
          [["b"], 2],
        ]),
      );
      open("a", snapshot({ matches: singles }));
      await screen.findByRole("region", { name: "Record" });
      expect(screen.queryByRole("list", { name: "Best partners" })).toBeNull();
      expect(screen.getByRole("list", { name: "Head to head" })).toBeTruthy();
    });

    it("links the ten latest matches, newest first, and the full history", async () => {
      const many = Array.from({ length: 12 }, (_, i) =>
        match(`m${String(i + 1)}`, i, [
          [["a"], 1],
          [["b"], 2],
        ]),
      );
      open(
        "a",
        snapshot({
          matches: [
            ...many,
            match("x", 20, [
              [["b"], 1],
              [["c"], 2],
            ]),
          ],
        }),
      );
      const recent = await screen.findByRole("list", {
        name: "Recent matches",
      });
      expect(
        within(recent)
          .getAllByRole("link")
          .map((a) => a.getAttribute("href"))
          .filter((href) => href?.includes("/matches/"))
          .map((href) => href?.split("/").pop()),
      ).toEqual([
        "m12",
        "m11",
        "m10",
        "m9",
        "m8",
        "m7",
        "m6",
        "m5",
        "m4",
        "m3",
      ]);
      expect(within(recent).getAllByText(/^[+−]\d+$/).length).toBeGreaterThan(
        0,
      );
      expect(
        screen.getByRole("link", { name: "All matches" }).getAttribute("href"),
      ).toBe("/g/g1/matches?player=a");
    });

    it("shows unrated players without stats", async () => {
      open("c", snapshot());
      expect(await screen.findByRole("heading", { name: "Cy" })).toBeTruthy();
      expect(screen.getByText("Unrated")).toBeTruthy();
      expect(screen.getByText("No matches yet.")).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Record" })).toBeNull();
      expect(screen.queryByText("Provisional")).toBeNull();
    });

    it("explains an unknown player", async () => {
      open("zzz", snapshot());
      expect(await screen.findByText("No such player.")).toBeTruthy();
    });
  },
);
