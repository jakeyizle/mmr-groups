import {
  activity,
  bestDuos,
  biggestUpsets,
  leaderboard,
  longestStreaks,
  ratingHistogram,
  ratingSeries,
  resolveRatingConfig,
} from "@mmr/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SERIES } from "@/lib/charts";
import type { GroupData } from "@/lib/groups";

import { match, PLAYERS, snapshot } from "../../../../test/fixtures";
import { renderRoute, stubApi } from "../../../../test/render";

// Recharts draws nothing in jsdom: render the props instead.
vi.mock("@/components/charts/bar-chart", () => ({
  BarChart: (p: { label: string; data: unknown }) => (
    <pre aria-label={p.label}>{JSON.stringify(p.data)}</pre>
  ),
}));
vi.mock("@/components/charts/rating-chart", () => ({
  RatingChart: (p: { label: string; series: unknown }) => (
    <pre aria-label={p.label}>{JSON.stringify(p.series)}</pre>
  ),
}));

const NOW = new Date("2026-10-20T12:00:00.000Z");
const config = resolveRatingConfig(undefined);
const D = {
  id: "d",
  displayName: "Dee",
  role: "viewer",
  linked: false,
} as const;

function open(data: GroupData) {
  stubApi({
    "GET /api/me": () => ({ user: { id: "u1", name: "Ann" } }),
    "GET /api/groups/g1": () => data,
  });
  return renderRoute("/g/g1/stats");
}

const props = (label: string) =>
  JSON.parse(screen.getByLabelText(label).textContent) as unknown;
const ranked = (label: string) =>
  within(screen.getByRole("list", { name: label }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

// Doubles in the last weeks: a & b win often; one upset.
const DOUBLES = [
  ...[0, 1, 2, 3].map((d) =>
    match(`w${String(d)}`, 24 * 14 + d * 24, [
      [["a", "b"], 1],
      [["c", "gone"], 2],
    ]),
  ),
  match("u1", 24 * 18, [
    [["c", "gone"], 1],
    [["a", "b"], 2],
  ]),
];
const data = (matches = DOUBLES) =>
  snapshot({
    group: { teamFormat: { kind: "fixed", teams: 2, size: 2 } },
    players: [...PLAYERS, D],
    matches,
  });
const nameOf = (id: string) =>
  ({ a: "Ann", b: "Bob", c: "Cy", d: "Dee" })[id] ?? "Removed player";

afterEach(() => {
  vi.useRealTimers();
});

describe(
  "group stats",
  { tags: ["STATS-007", "STATS-008", "STATS-009", "STATS-010", "STATS-011"] },
  () => {
    it("says when there are no matches", async () => {
      open(snapshot());
      expect(await screen.findByText("No matches yet.")).toBeTruthy();
    });

    it("charts weekly activity and lists the most active", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open(data());
      await screen.findByRole("heading", { name: "Activity" });
      const local = (d: Date) =>
        new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate() - ((d.getDay() + 6) % 7),
        );
      const expected = activity(DOUBLES, NOW, local, (id) => id);
      const fmt = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      });
      expect(props("Matches per week, last 12 weeks")).toEqual(
        expected.weeks.map((w) => ({
          label: fmt.format(new Date(w.week)),
          value: w.matches,
        })),
      );
      expect(expected.weeks.some((w) => w.matches > 1)).toBe(true);
      expect(ranked("Most active, last 30 days")).toEqual(
        expected.mostActive.map(
          (p, i) =>
            `${String(i + 1)}${nameOf(p.playerId)}${String(p.matches)} ${p.matches === 1 ? "match" : "matches"}`,
        ),
      );
    });

    it("lists best duos, upsets and streaks", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open(data());
      await screen.findByRole("heading", { name: "Best duos" });
      expect(ranked("Best duos")).toEqual(
        bestDuos(DOUBLES, (id) => id).map(
          (d, i) =>
            `${String(i + 1)}${d.playerIds.map(nameOf).join(" & ")}${String(d.wins)}–${String(d.losses)}${d.ties ? `–${String(d.ties)}` : ""} · ${String(Math.round(d.winRate * 100))}%`,
        ),
      );
      const upsets = biggestUpsets(DOUBLES, config, NOW.toISOString());
      expect(upsets[0]?.matchId).toBe("u1");
      const list = screen.getByRole("list", { name: "Biggest upsets" });
      expect(within(list).getAllByRole("listitem")[0]?.textContent).toBe(
        `1Cy & Removed player beat Ann & Bob${String(Math.round((upsets[0]?.probability ?? 0) * 100))}% chance`,
      );
      expect(within(list).getAllByRole("link")[0]?.getAttribute("href")).toBe(
        "/g/g1/matches/u1",
      );
      expect(ranked("Longest win streaks")).toEqual(
        longestStreaks(DOUBLES, (id) => id).map(
          (s, i) =>
            `${String(i + 1)}${nameOf(s.playerId)}${String(s.length)} in a row`,
        ),
      );
    });

    it(
      "links players in the lists to their profiles",
      { tags: ["STATS-013"] },
      async () => {
        vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
        open(data());
        await screen.findByRole("heading", { name: "Best duos" });
        const links = (label: string) =>
          within(screen.getByRole("list", { name: label }))
            .getAllByRole("link")
            .map((a) => [a.textContent, a.getAttribute("href")]);
        expect(links("Best duos")[0]).toEqual(["Ann", "/g/g1/players/a"]);
        expect(links("Best duos")[1]).toEqual(["Bob", "/g/g1/players/b"]);
        expect(links("Longest win streaks")[0]).toEqual([
          "Ann",
          "/g/g1/players/a",
        ]);
        expect(links("Most active, last 30 days")).toContainEqual([
          "Cy",
          "/g/g1/players/c",
        ]);
      },
    );

    it("names both sides of an upset whichever team won", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      const flipped = DOUBLES.map((m) =>
        m.id === "u1"
          ? { ...m, teams: [m.teams[1], m.teams[0]] as typeof m.teams }
          : m,
      );
      open(data(flipped));
      const list = await screen.findByRole("list", { name: "Biggest upsets" });
      expect(within(list).getAllByRole("link")[0]?.textContent).toBe(
        "Cy & Removed player beat Ann & Bob",
      );
    });

    it("counts single matches and tied duos", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      const ties = [
        ...[1, 2].map((h) =>
          match(`w${String(h)}`, 24 * 14 + h, [
            [["a", "b"], 1],
            [["c", "d"], 2],
          ]),
        ),
        match("t", 24 * 14 + 3, [
          [["a", "b"], 1],
          [["c", "d"], 1],
        ]),
        match("x", 24 * 14 + 4, [
          [["a", "gone"], 1],
          [["b", "c"], 2],
        ]),
      ];
      open(data(ties));
      await screen.findByRole("heading", { name: "Best duos" });
      expect(ranked("Most active, last 30 days")).toContain(
        "5Removed player1 match",
      );
      expect(ranked("Best duos")[0]).toBe("1Ann & Bob2–0–1 · 83%");
    });

    it("updates when the snapshot does", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      const { queryClient } = open(data());
      await screen.findByRole("heading", { name: "Activity" });
      const before = ranked("Most active, last 30 days");
      const next = data([
        ...DOUBLES,
        match("n", 24 * 18 + 1, [
          [["d", "gone"], 1],
          [["a", "b"], 2],
        ]),
      ]);
      next.group.version = 2;
      next.players = next.players.map((p) =>
        p.id === "a" ? { ...p, displayName: "Anna" } : p,
      );
      queryClient.setQueryData(["group", "g1"], next);
      await waitFor(() => {
        expect(ranked("Most active, last 30 days")).not.toEqual(before);
      });
      expect(ranked("Most active, last 30 days")).toContain("1Anna6 matches");
    });

    it("charts the rating distribution", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open(data());
      await screen.findByRole("heading", { name: "Rating distribution" });
      const board = leaderboard(DOUBLES, config, NOW.toISOString());
      expect(props("Players per rating range")).toEqual(
        ratingHistogram(board.map((e) => e.rating)).map((b) => ({
          label: String(b.from),
          value: b.count,
        })),
      );
    });

    it("explains empty lists", async () => {
      // One old singles match: no recent activity, duos or 2-team upsets with a favourite.
      open(
        snapshot({
          matches: [
            match("m1", -24 * 400, [
              [["a"], 1],
              [["b"], 1],
            ]),
          ],
        }),
      );
      expect(
        await screen.findByText("No matches in the last 30 days."),
      ).toBeTruthy();
      expect(
        screen.getByText("Duos appear after 3 matches as teammates."),
      ).toBeTruthy();
      expect(screen.getByText("No wins yet.")).toBeTruthy();
    });

    it("explains upsets need two-team matches", async () => {
      open(
        snapshot({
          group: { teamFormat: { kind: "flexible" } },
          matches: [
            match("m1", 0, [
              [["a"], 1],
              [["b"], 2],
              [["c"], 3],
            ]),
          ],
        }),
      );
      expect(await screen.findByText("No 2-team matches yet.")).toBeTruthy();
    });
  },
);

describe("ratings over time", { tags: ["STATS-006"] }, () => {
  // Nine rated players: one more than there are colors.
  const many = "abcdefghi".split("");
  const roster = many.map((id) => ({
    id,
    displayName: id.toUpperCase(),
    role: "viewer" as const,
    linked: true,
  }));
  const games = many.slice(1).map((id, i) =>
    match(`m${id}`, i, [
      [["a"], 1],
      [[id], 2],
    ]),
  );
  const shown = () =>
    (
      props("Each player's rating over time") as {
        id: string;
        color: string;
        name: string;
      }[]
    ).map((s) => [s.id, s.color]);
  const toggle = (name: string) => screen.getByRole("button", { name });

  it("shows the top eight, each with a fixed color, and keeps colors when toggling", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    open(snapshot({ players: roster, matches: games }));
    await screen.findByRole("heading", { name: "Ratings over time" });
    const board = leaderboard(games, config, NOW.toISOString());
    const top = board.slice(0, 8).map((e, i) => [e.playerId, SERIES[i]]);
    expect(shown()).toEqual(top);
    const series = ratingSeries(games, config, NOW.toISOString());
    const first = (
      props("Each player's rating over time") as {
        name: string;
        points: unknown;
      }[]
    )[0];
    expect(first).toMatchObject({
      name: board[0]?.playerId.toUpperCase(),
      points: series.get(board[0]?.playerId ?? ""),
    });

    const ninth = board[8]?.playerId.toUpperCase() ?? "";
    const second = board[1]?.playerId.toUpperCase() ?? "";
    expect(toggle(ninth).getAttribute("aria-pressed")).toBe("false");
    expect(toggle(ninth)).toHaveProperty("disabled", true);
    expect(toggle(second).getAttribute("aria-pressed")).toBe("true");
    expect(
      (toggle(second).querySelector("span") as HTMLElement).style.background,
    ).toBe(SERIES[1]);

    // Hiding one frees its color for the next player shown; the rest keep theirs.
    await userEvent.click(toggle(second));
    expect(toggle(second).getAttribute("aria-pressed")).toBe("false");
    expect(
      (toggle(second).querySelector("span") as HTMLElement).style.background,
    ).toBe("");
    expect(toggle(ninth)).toHaveProperty("disabled", false);
    await userEvent.click(toggle(ninth));
    await waitFor(() => {
      expect(shown()).toEqual(
        board
          .filter((e) => e.playerId !== board[1]?.playerId)
          .map((e) => [
            e.playerId,
            SERIES[e.playerId === board[8]?.playerId ? 1 : board.indexOf(e)],
          ]),
      );
    });
    expect(toggle(second)).toHaveProperty("disabled", true);
  });
});
