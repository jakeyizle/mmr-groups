import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

/** Singles group: Ann beat Bea an hour ago. Returns ids and the match. */
async function setup(page: Page) {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Singles",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
    },
    headers,
  });
  const { id: gid, playerId: ann } = (await res.json()) as {
    id: string;
    playerId: string;
  };
  const added = await page.request.post(`/api/groups/${gid}/players`, {
    data: { players: [{ name: "Bea" }] },
    headers,
  });
  const bea =
    ((await added.json()) as { players: { id: string }[] }).players[0]?.id ??
    "";
  const rec = await page.request.post(`/api/groups/${gid}/matches`, {
    data: {
      matches: [
        {
          playedAt: new Date(Date.now() - 3_600_000).toISOString(),
          teams: [
            { playerIds: [ann], rank: 1 },
            { playerIds: [bea], rank: 2 },
          ],
        },
      ],
    },
    headers,
  });
  const match = ((await rec.json()) as { matches: { id: string }[] })
    .matches[0];
  return { gid, mid: match?.id ?? "" };
}

const board = (page: Page) =>
  page.getByRole("list", { name: "Leaderboard" }).getByRole("listitem");

test("changing the winner updates the leaderboard", async ({ page }) => {
  const { gid } = await setup(page);
  await page.goto(`/g/${gid}`);
  await expect(board(page).nth(0)).toContainText("Ann");

  await page.getByRole("link", { name: "Matches", exact: true }).click();
  await page.getByRole("list", { name: "Matches" }).getByRole("link").click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("radiogroup", { name: "Match 1 winner" })
    .getByRole("radio", { name: "Team 2" })
    .click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Teams" }).getByRole("listitem").first(),
  ).toContainText("Winner");

  await page.getByRole("link", { name: "Leaderboard" }).click();
  await expect(board(page).nth(0)).toContainText("Bea");
});

test("deleting a match removes it from history", async ({ page }) => {
  const { gid, mid } = await setup(page);
  await page.goto(`/g/${gid}/matches/${mid}`);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete match" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${gid}/matches$`));
  await expect(page.getByText("No matches yet.")).toBeVisible();
});

test(
  "a stale edit is rejected and the latest version is shown",
  { tag: "@EDIT-010" },
  async ({ page }) => {
    const { gid, mid } = await setup(page);
    await page.goto(`/g/${gid}/matches/${mid}`);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Notes").fill("mine");

    // Someone else saves first.
    await page.request.patch(`/api/groups/${gid}/matches/${mid}`, {
      data: { notes: "theirs" },
      headers: { ...headers, "If-Match": '"1"' },
    });

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "This match changed while you were editing",
    );
    await expect(page.getByLabel("Notes")).toHaveValue("theirs");

    // Re-applying on the latest version works.
    await page.getByLabel("Notes").fill("mine");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("mine", { exact: true })).toBeVisible();
  },
);
