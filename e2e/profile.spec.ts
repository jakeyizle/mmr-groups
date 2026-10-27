import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

/**
 * 2×2 group: Ann & Bea vs Cal & Dot six times (Ann's team wins the first 4),
 * then Ann & Cal vs Bea & Dot six times (wins 3, loses 3). Ann ends on a loss.
 */
async function seeded(page: Page) {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Doubles",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 2 },
    },
    headers,
  });
  const { id: gid, playerId: ann } = (await res.json()) as {
    id: string;
    playerId: string;
  };
  const added = await page.request.post(`/api/groups/${gid}/players`, {
    data: { players: [{ name: "Bea" }, { name: "Cal" }, { name: "Dot" }] },
    headers,
  });
  const [bea = "", cal = "", dot = ""] = (
    (await added.json()) as { players: { id: string }[] }
  ).players.map((p) => p.id);
  const start = Date.now() - 14 * 86_400_000;
  const game = (i: number, mine: string[], theirs: string[], won: boolean) => ({
    playedAt: new Date(start + i * 86_400_000).toISOString(),
    teams: [
      { playerIds: mine, rank: won ? 1 : 2 },
      { playerIds: theirs, rank: won ? 2 : 1 },
    ],
  });
  const matches = [
    ...[true, true, true, true, false, false].map((won, i) =>
      game(i, [ann, bea], [cal, dot], won),
    ),
    ...[true, true, true, false, false, false].map((won, i) =>
      game(6 + i, [ann, cal], [bea, dot], won),
    ),
  ];
  await page.request.post(`/api/groups/${gid}/matches`, {
    data: { matches },
    headers,
  });
  return gid;
}

test(
  "a profile shows rating chart, record, partners, head-to-head and recent matches",
  {
    tag: ["@STATS-001", "@STATS-002", "@STATS-003", "@STATS-004", "@STATS-005"],
  },
  async ({ page }) => {
    const gid = await seeded(page);
    await page.goto(`/g/${gid}`);
    await page
      .getByRole("list", { name: "Leaderboard" })
      .getByRole("link", { name: "Ann" })
      .click();
    await expect(page).toHaveURL(/\/players\//);

    await expect(
      page
        .getByRole("figure", { name: "Ann's rating over time" })
        .locator("path.recharts-line-curve"),
    ).toHaveCount(1);

    const record = page.getByRole("region", { name: "Record" });
    await expect(record).toContainText("7–5");
    await expect(record).toContainText("58%");
    await expect(record).toContainText("12");
    await expect(record).toContainText("L3");
    await expect(record).toContainText("W4");

    await expect(page.getByRole("list", { name: "Best partners" })).toHaveText(
      /Bea.*4–2.*67%.*Cal.*3–3.*50%/s,
    );
    const h2h = page.getByRole("list", { name: "Head to head" });
    await expect(h2h.getByRole("listitem").first()).toContainText(/Dot.*7–5/);
    await expect(h2h).toContainText(/Cal.*4–2/);
    await expect(h2h).toContainText(/Bea.*3–3/);

    await expect(
      page.getByRole("list", { name: "Recent matches" }).locator("> li"),
    ).toHaveCount(10);
    await page.getByRole("link", { name: "All matches" }).click();
    await expect(page).toHaveURL(/player=/);
  },
);
