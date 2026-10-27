import { expect, test } from "@playwright/test";

test(
  "the demo league is one tap from the home page, no sign-in needed",
  { tag: "@VIS-005" },
  async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See the demo league" }).click();
    await expect(page).toHaveURL(/\/g\/demo$/);
    await expect(
      page.getByRole("heading", { name: "Demo Pickleball League" }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Leaderboard" }).getByRole("listitem"),
    ).toHaveCount(12);
    await page.getByRole("link", { name: "Matches", exact: true }).click();
    await expect(
      page.getByRole("list", { name: "Matches" }).locator("> li"),
    ).toHaveCount(160);
  },
);
