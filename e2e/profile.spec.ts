import { expect, test } from "@playwright/test";

import { seeded } from "./seed";

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
