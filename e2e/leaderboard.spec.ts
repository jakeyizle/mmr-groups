import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

/** A 1v1 group owned by Ann with Bea and Cal; returns ids by name. */
async function group(page: Page) {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Singles",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
    },
    headers,
  });
  const { id, playerId } = (await res.json()) as {
    id: string;
    playerId: string;
  };
  const added = await page.request.post(`/api/groups/${id}/players`, {
    data: { players: [{ name: "Bea" }, { name: "Cal" }] },
    headers,
  });
  const { players } = (await added.json()) as { players: { id: string }[] };
  const [bea = "", cal = ""] = players.map((p) => p.id);
  return { gid: id, ann: playerId, bea, cal };
}

const board = (page: Page) =>
  page.getByRole("list", { name: "Leaderboard" }).getByRole("listitem");

test(
  "ranked players by rating, unrated listed separately, then a new match shows up",
  { tag: ["@BOARD-001", "@BOARD-002", "@BOARD-007", "@RATE-010"] },
  async ({ page }) => {
    const { gid, ann, bea } = await group(page);
    await page.request.post(`/api/groups/${gid}/matches`, {
      data: {
        matches: [
          {
            playedAt: new Date(Date.now() - 60_000).toISOString(),
            teams: [
              { playerIds: [bea], rank: 1 },
              { playerIds: [ann], rank: 2 },
            ],
          },
        ],
      },
      headers,
    });

    await page.goto(`/g/${gid}`);
    await expect(board(page)).toHaveCount(2);
    await expect(board(page).nth(0)).toContainText("Bea");
    await expect(board(page).nth(0)).toContainText("1W 0L");
    await expect(board(page).nth(0)).toContainText("Provisional");
    await expect(board(page).nth(1)).toContainText("Ann");
    await expect(page.getByRole("list", { name: "Unrated" })).toHaveText("Cal");

    // Record Ann beating Cal through the form; the leaderboard includes it.
    await page.getByRole("link", { name: "Record matches" }).click();
    await page
      .getByLabel("Match 1 team 1 player 1")
      .selectOption({ label: "Ann" });
    await page
      .getByLabel("Match 1 team 2 player 1")
      .selectOption({ label: "Cal" });
    await page
      .getByRole("radiogroup", { name: "Match 1 winner" })
      .getByRole("radio", { name: "Team 1" })
      .click();
    await page.getByRole("button", { name: "Save match" }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${gid}/matches$`));

    await page.getByRole("link", { name: "Leaderboard" }).click();
    await expect(board(page)).toHaveCount(3);
    await expect(page.getByRole("list", { name: "Unrated" })).toHaveCount(0);
    await expect(board(page).filter({ hasText: "Ann" })).toContainText("1W 1L");
  },
);
