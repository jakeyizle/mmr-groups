import { expect, test } from "@playwright/test";

test("a signed-out visitor sees the landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "MMR Groups" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
