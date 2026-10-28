import type { MatchTeam, Rating } from "@mmr/core";
import { displayRating } from "@mmr/core";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderInRouter } from "../../../test/render";
import { MatchCard } from "./match-card";

const PLAYED = "2026-10-12T18:05:00.000Z";
const names = new Map([
  ["a", "Ann"],
  ["b", "Bob"],
  ["c", "Cy"],
  ["d", "Dee"],
]);
const team = (playerIds: string[], rank: number, score: number | null = null) =>
  ({ playerIds, rank, score }) satisfies MatchTeam;

async function card(
  teams: MatchTeam[],
  changes?: Map<string, { before: Rating; after: Rating }>,
  perspective?: string,
) {
  renderInRouter(
    <MatchCard
      gid="g1"
      match={{ id: "m1", playedAt: PLAYED, teams }}
      names={names}
      changes={changes}
      perspective={perspective}
    />,
  );
  // The card holds the date link.
  const [date] = await screen.findAllByRole("link");
  const root = date?.closest("div");
  if (!root) throw new Error("no card");
  return root;
}

// Rows: [players…, result], winners first.
const rows = (root: HTMLElement) =>
  [...root.querySelectorAll(":scope > div")].map((d) => [
    ...[...d.querySelectorAll("li > :first-child")].map((s) => s.textContent),
    d.querySelector(":scope > span")?.textContent,
  ]);

describe("MatchCard", { tags: ["BOARD-005"] }, () => {
  it("links to the match by when it was played", async () => {
    const root = await card([team(["a"], 1), team(["b"], 2)]);
    const when = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(PLAYED));
    expect(
      within(root).getByRole("link", { name: when }).getAttribute("href"),
    ).toBe("/g/g1/matches/m1");
  });

  it("links players to their profiles", { tags: ["STATS-013"] }, async () => {
    const root = await card([team(["a"], 1), team(["gone"], 2)]);
    expect(
      within(root).getByRole("link", { name: "Ann" }).getAttribute("href"),
    ).toBe("/g/g1/players/a");
    expect(
      within(root).queryByRole("link", { name: "Removed player" }),
    ).toBeNull();
  });

  it("lists winners first, with scores, and names removed players", async () => {
    const link = await card([
      team(["c", "gone"], 2, 7),
      team(["a", "b"], 1, 11),
    ]);
    expect(rows(link)).toEqual([
      ["Ann", "Bob", "11"],
      ["Cy", "Removed player", "7"],
    ]);
  });

  it("labels unscored two-team results", async () => {
    expect(rows(await card([team(["b"], 2), team(["a"], 1)]))).toEqual([
      ["Ann", "Won"],
      ["Bob", "Lost"],
    ]);
  });

  it("labels a two-team tie", async () => {
    expect(rows(await card([team(["a"], 1), team(["b"], 1)]))).toEqual([
      ["Ann", "Tie"],
      ["Bob", "Tie"],
    ]);
  });

  it("labels placements in bigger matches", async () => {
    expect(
      rows(
        await card([
          team(["d"], 4),
          team(["c"], 3),
          team(["b"], 2),
          team(["a"], 1),
        ]),
      ),
    ).toEqual([
      ["Ann", "1st"],
      ["Bob", "2nd"],
      ["Cy", "3rd"],
      ["Dee", "4th"],
    ]);
  });

  it("labels tied placements", async () => {
    expect(
      rows(await card([team(["a"], 1), team(["b"], 2), team(["c"], 2)])),
    ).toEqual([
      ["Ann", "1st"],
      ["Bob", "Tied 2nd"],
      ["Cy", "Tied 2nd"],
    ]);
  });

  it("shows each player's displayed-rating change", async () => {
    const r = (mu: number): Rating => ({ mu, sigma: 3 });
    const before = r(25);
    const changes = new Map([
      ["a", { before, after: r(27) }],
      ["b", { before, after: r(23) }],
    ]);
    const link = await card(
      [team(["a"], 1), team(["b"], 2), team(["c"], 3)],
      changes,
    );
    const deltas = [...link.querySelectorAll("li > span:last-child")].map(
      (s) => s.textContent,
    );
    const d = (x: Rating) => displayRating(x) - displayRating(before);
    expect(deltas).toEqual([
      `+${String(d(r(27)))}`,
      `−${String(-d(r(23)))}`,
      "±0",
    ]);
  });
});

describe("MatchCard for one player", { tags: ["STATS-012"] }, () => {
  const r = (mu: number): Rating => ({ mu, sigma: 3 });
  const changes = new Map([
    ["a", { before: r(25), after: r(27) }],
    ["b", { before: r(25), after: r(23) }],
  ]);
  const result = (root: HTMLElement) =>
    within(root).getByLabelText("Result").textContent;
  const shift = (id: string) => {
    const c = changes.get(id);
    if (!c) throw new Error("no change");
    return `${String(displayRating(c.before))} → ${String(displayRating(c.after))}`;
  };

  it("shows a win with their rating before and after", async () => {
    const root = await card([team(["a"], 1), team(["b"], 2)], changes, "a");
    expect(result(root)).toBe(`Won · ${shift("a")}`);
    expect(within(root).getByRole("link", { name: "Ann" }).className).toContain(
      "font-semibold",
    );
    expect(
      within(root).getByRole("link", { name: "Bob" }).className,
    ).not.toContain("font-semibold");
  });

  it("shows a loss", async () => {
    const root = await card([team(["a"], 1), team(["b"], 2)], changes, "b");
    expect(result(root)).toBe(`Lost · ${shift("b")}`);
  });

  it("shows a tie, without ratings it doesn't have", async () => {
    const root = await card([team(["a"], 1), team(["c"], 1)], changes, "c");
    expect(result(root)).toBe("Tied");
  });

  it("shows no result for a player not in the match", async () => {
    const root = await card([team(["a"], 1), team(["b"], 2)], changes, "d");
    expect(within(root).queryByLabelText("Result")).toBeNull();
  });

  it("shows no result without a player", async () => {
    const root = await card([team(["a"], 1), team(["b"], 2)], changes);
    expect(within(root).queryByLabelText("Result")).toBeNull();
  });
});
