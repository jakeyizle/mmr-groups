import { expect, test } from "@playwright/test";

import { seeded } from "./seed";

test(
  "group stats show ratings, activity, duos, upsets, streaks and distribution",
  {
    tag: [
      "@STATS-006",
      "@STATS-007",
      "@STATS-008",
      "@STATS-009",
      "@STATS-010",
      "@STATS-011",
    ],
  },
  async ({ page }) => {
    const gid = await seeded(page);
    await page.goto(`/g/${gid}/stats`);

    const lines = page
      .getByRole("figure", { name: "Each player's rating over time" })
      .locator("path.recharts-line-curve");
    await expect(lines).toHaveCount(4);
    await page
      .getByRole("list", { name: "Players shown" })
      .getByRole("button", { name: "Bea" })
      .click();
    await expect(lines).toHaveCount(3);

    // 14 days of history: bars for 2–3 weeks (empty weeks draw no bar).
    const bars = page
      .getByRole("figure", { name: "Matches per week, last 12 weeks" })
      .locator(".recharts-bar-rectangle");
    await expect(bars.first()).toBeVisible();
    expect(await bars.count()).toBeGreaterThanOrEqual(2);
    expect(await bars.count()).toBeLessThanOrEqual(3);
    await expect(
      page.getByRole("list", { name: "Most active, last 30 days" }),
    ).toHaveText(/Ann.*12 matches.*Bea.*Cal.*Dot/s);

    await expect(
      page
        .getByRole("list", { name: "Best duos" })
        .getByRole("listitem")
        .first(),
    ).toContainText(/Ann & Bea.*4–2.*67%/);
    await expect(
      page.getByRole("list", { name: "Biggest upsets" }).getByRole("listitem"),
    ).toHaveCount(5);
    await expect(
      page
        .getByRole("list", { name: "Biggest upsets" })
        .getByRole("listitem")
        .first(),
    ).toContainText(/beat .*% chance/);
    await expect(
      page.getByRole("list", { name: "Longest win streaks" }),
    ).toHaveText(
      /Cal.*5 in a row.*Ann.*4 in a row.*Bea.*4 in a row.*Dot.*3 in a row/s,
    );
    await expect(
      page.getByRole("figure", { name: "Players per rating range" }),
    ).toBeVisible();
  },
);
