import { expect, test } from "@playwright/test";

import { signIn } from "./auth";

test("signs in with test login and loads the home page", async ({ page }) => {
  await signIn(page);
  const cookies = await page.context().cookies();
  expect(cookies.map((c) => c.name)).toContain("session");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MMR Groups" })).toBeVisible();
  await expect(page.getByText("API health: 200")).toBeVisible();
});
