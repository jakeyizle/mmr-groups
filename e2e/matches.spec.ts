import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

interface Snapshot {
  players: { id: string; displayName: string }[];
  matches: {
    teams: { playerIds: string[]; score: number | null; rank: number }[];
  }[];
}

/** A 2×2 group owned by "Ann" with Bea, Cal and Dot, opened on the entry page. */
async function openEntry(page: Page, settings: Record<string, unknown> = {}) {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Doubles",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 2 },
      ...settings,
    },
    headers,
  });
  const { id } = (await res.json()) as { id: string };
  await page.request.post(`/api/groups/${id}/players`, {
    data: { players: [{ name: "Bea" }, { name: "Cal" }, { name: "Dot" }] },
    headers,
  });
  await page.goto(`/g/${id}/matches/new`);
  return id;
}

async function snapshot(page: Page, gid: string) {
  return (await (
    await page.request.get(`/api/groups/${gid}`)
  ).json()) as Snapshot;
}

async function pickTeams(page: Page, match: number, names: string[]) {
  for (const [i, name] of names.entries()) {
    const team = Math.floor(i / 2) + 1;
    const slot = (i % 2) + 1;
    await page
      .getByLabel(
        `Match ${String(match)} team ${String(team)} player ${String(slot)}`,
      )
      .selectOption({ label: name });
  }
}

const save = (page: Page) =>
  page.getByRole("button", { name: /^Save/ }).click();

test(
  "recording a single scored match",
  { tag: "@MATCH-001" },
  async ({ page }) => {
    const gid = await openEntry(page);
    await pickTeams(page, 1, ["Ann", "Bea", "Cal", "Dot"]);
    await page.getByLabel("Match 1 team 1 score").fill("11");
    await page.getByLabel("Match 1 team 2 score").fill("7");
    await save(page);
    await expect(page).toHaveURL(new RegExp(`/g/${gid}/matches$`));

    const { players, matches } = await snapshot(page, gid);
    const name = (id: string) => players.find((p) => p.id === id)?.displayName;
    expect(
      matches[0]?.teams.map((t) => [t.playerIds.map(name), t.score, t.rank]),
    ).toEqual([
      [["Ann", "Bea"], 11, 1],
      [["Cal", "Dot"], 7, 2],
    ]);
  },
);

test(
  "a batch of six built by duplicating rows, saved in one submit",
  { tag: ["@MATCH-002", "@MATCH-004", "@MATCH-005"] },
  async ({ page }) => {
    const gid = await openEntry(page, { scoringMode: "none" });
    await pickTeams(page, 1, ["Ann", "Bea", "Cal", "Dot"]);
    const first = await page.getByLabel("Match 1 date and time").inputValue();
    expect(Math.abs(Date.parse(first) - Date.now())).toBeLessThan(2 * 60_000);

    for (let i = 1; i < 6; i++) {
      await page
        .getByRole("group", { name: `Match ${String(i)}`, exact: true })
        .getByRole("button", { name: "Duplicate" })
        .click();
    }
    // Same players on the same teams; times one minute apart.
    await expect(
      page.getByLabel("Match 6 team 2 player 1").locator("option:checked"),
    ).toHaveText("Cal");
    const second = await page.getByLabel("Match 2 date and time").inputValue();
    expect(Date.parse(second) - Date.parse(first)).toBe(60_000);

    for (let i = 1; i <= 6; i++) {
      await page
        .getByRole("radiogroup", { name: `Match ${String(i)} winner` })
        .getByRole("radio", { name: i % 2 ? "Team 1" : "Team 2" })
        .click();
    }
    await expect(
      page.getByRole("button", { name: "Save 6 matches" }),
    ).toBeVisible();
    await save(page);
    await expect(page).toHaveURL(new RegExp(`/g/${gid}/matches$`));
    const { matches } = await snapshot(page, gid);
    expect(matches.map((m) => m.teams.map((t) => t.rank))).toEqual([
      [1, 2],
      [2, 1],
      [1, 2],
      [2, 1],
      [1, 2],
      [2, 1],
    ]);
  },
);

test(
  "without scores the recorder picks the winner; problems are shown per row",
  { tag: "@MATCH-012" },
  async ({ page }) => {
    const gid = await openEntry(page);
    await pickTeams(page, 1, ["Ann", "Bea", "Cal", "Dot"]);
    await save(page);
    await expect(
      page
        .getByRole("group", { name: "Match 1", exact: true })
        .getByRole("alert"),
    ).toContainText("Choose a placement");

    await page
      .getByRole("radiogroup", { name: "Match 1 winner" })
      .getByRole("radio", { name: "Team 2" })
      .click();
    await save(page);
    await expect(page).toHaveURL(new RegExp(`/g/${gid}/matches$`));
    const { matches } = await snapshot(page, gid);
    expect(matches[0]?.teams.map((t) => t.rank)).toEqual([2, 1]);
  },
);

test(
  "an unsaved batch survives a reload and is cleared after saving",
  { tag: "@MATCH-014" },
  async ({ page }) => {
    const gid = await openEntry(page);
    await pickTeams(page, 1, ["Ann", "Bea", "Cal", "Dot"]);
    await page.getByLabel("Match 1 team 1 score").fill("5");
    await page.getByLabel("Match 1 team 2 score").fill("3");
    await page.getByRole("button", { name: "Add match" }).click();
    await page
      .getByLabel("Match 2 team 1 player 1")
      .selectOption({ label: "Dot" });

    await page.reload();
    await expect(page.getByLabel("Match 1 team 1 score")).toHaveValue("5");
    await expect(
      page.getByLabel("Match 2 team 1 player 1").locator("option:checked"),
    ).toHaveText("Dot");

    await page
      .getByRole("group", { name: "Match 2", exact: true })
      .getByRole("button", { name: "Remove" })
      .click();
    await save(page);
    await expect(page).toHaveURL(new RegExp(`/g/${gid}/matches$`));
    await page.goto(`/g/${gid}/matches/new`);
    await expect(page.getByLabel("Match 1 team 1 score")).toHaveValue("");
    await expect(page.getByLabel("Match 2 date and time")).toHaveCount(0);
  },
);

test(
  "admins can add a player mid-batch without losing entries",
  { tag: "@MATCH-015" },
  async ({ page }) => {
    await openEntry(page);
    await pickTeams(page, 1, ["Ann", "Bea", "Cal"]);
    await page.getByLabel("New player").fill("Eve");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByLabel("New player")).toHaveValue("");

    await page
      .getByLabel("Match 1 team 2 player 2")
      .selectOption({ label: "Eve" });
    await expect(
      page.getByLabel("Match 1 team 1 player 2").locator("option:checked"),
    ).toHaveText("Bea");
  },
);

test(
  "complete teams show each team's chance to win",
  { tag: "@MATCH-016" },
  async ({ page }) => {
    await openEntry(page);
    await pickTeams(page, 1, ["Ann", "Bea", "Cal"]);
    await expect(page.getByText(/% to win/)).toHaveCount(0);
    await pickTeams(page, 1, ["Ann", "Bea", "Cal", "Dot"]);
    const odds = page.getByText(/^\d+% to win$/);
    await expect(odds).toHaveCount(2);
    const values = (await odds.allTextContents()).map((t) => parseInt(t, 10));
    expect(
      Math.abs((values[0] ?? 0) + (values[1] ?? 0) - 100),
    ).toBeLessThanOrEqual(1);
  },
);
