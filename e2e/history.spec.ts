import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

/** Singles group with Ann, Bea, Cal and three scored matches an hour apart. */
async function groupWithHistory(page: Page) {
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
    data: { players: [{ name: "Bea" }, { name: "Cal" }] },
    headers,
  });
  const { players } = (await added.json()) as { players: { id: string }[] };
  const [bea = "", cal = ""] = players.map((p) => p.id);
  const hoursAgo = (h: number) =>
    new Date(Date.now() - h * 3_600_000).toISOString();
  const game = (h: number, a: string, b: string, sa: number, sb: number) => ({
    playedAt: hoursAgo(h),
    teams: [
      { playerIds: [a], score: sa },
      { playerIds: [b], score: sb },
    ],
  });
  // Submitted out of order on purpose.
  await page.request.post(`/api/groups/${gid}/matches`, {
    data: {
      matches: [
        game(1, ann, cal, 11, 4),
        game(3, ann, bea, 11, 9),
        game(2, bea, cal, 7, 11),
      ],
    },
    headers,
  });
  return gid;
}

const cards = (page: Page) =>
  page.getByRole("list", { name: "Matches" }).locator("> li");

test(
  "history lists matches newest first with rating changes, filterable by player",
  { tag: ["@BOARD-004", "@BOARD-005", "@BOARD-006"] },
  async ({ page }) => {
    const gid = await groupWithHistory(page);
    await page.goto(`/g/${gid}/matches`);

    await expect(cards(page)).toHaveCount(3);
    // Newest first; the winning team is listed first with its score.
    await expect(cards(page).nth(0)).toContainText(/Ann.*11.*Cal.*4/s);
    await expect(cards(page).nth(1)).toContainText(/Cal.*11.*Bea.*7/s);
    await expect(cards(page).nth(2)).toContainText(/Ann.*11.*Bea.*9/s);

    // Winners gain, losers lose displayed rating.
    const first = cards(page).nth(0);
    await expect(
      first.getByRole("listitem").filter({ hasText: "Ann" }),
    ).toContainText(/\+\d+/);
    await expect(
      first.getByRole("listitem").filter({ hasText: "Cal" }),
    ).toContainText(/−\d+/);

    await page.getByLabel("Filter by player").selectOption({ label: "Bea" });
    await expect(page).toHaveURL(/player=/);
    await expect(cards(page)).toHaveCount(2);
    for (const i of [0, 1])
      await expect(cards(page).nth(i)).toContainText("Bea");

    await page.reload();
    await expect(cards(page)).toHaveCount(2);
    await page
      .getByLabel("Filter by player")
      .selectOption({ label: "Everyone" });
    await expect(cards(page)).toHaveCount(3);
  },
);
