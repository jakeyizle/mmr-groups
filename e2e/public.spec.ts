import { expect, test } from "@playwright/test";

import { seeded } from "./seed";

test(
  "a signed-out visitor can view every page of a public group, with no controls",
  { tag: ["@VIS-002", "@VIS-003"] },
  async ({ page, browser }) => {
    const gid = await seeded(page);
    await page.request.patch(`/api/groups/${gid}`, {
      data: { visibility: "public" },
      headers: { "X-Requested-With": "fetch" },
    });

    const context = await browser.newContext(test.info().project.use);
    const visitor = await context.newPage();
    const nav = visitor.getByRole("navigation");

    await visitor.goto(`/g/${gid}`);
    await expect(
      visitor.getByRole("list", { name: "Leaderboard" }).getByRole("listitem"),
    ).toHaveCount(4);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Audit" })).toHaveCount(0);
    await expect(
      visitor.getByRole("link", { name: "Record matches" }),
    ).toHaveCount(0);

    await nav.getByRole("link", { name: "Matches", exact: true }).click();
    await expect(
      visitor.getByRole("list", { name: "Matches" }).locator("> li"),
    ).toHaveCount(12);
    await visitor
      .getByRole("list", { name: "Matches" })
      .getByRole("link")
      .first()
      .click();
    await expect(visitor.getByRole("list", { name: "Teams" })).toBeVisible();
    await expect(visitor.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(visitor.getByRole("button", { name: "Delete" })).toHaveCount(
      0,
    );

    await nav.getByRole("link", { name: "Leaderboard" }).click();
    await visitor
      .getByRole("list", { name: "Leaderboard" })
      .getByRole("link", { name: "Ann" })
      .click();
    await expect(visitor.getByRole("region", { name: "Record" })).toContainText(
      "7–5",
    );

    await nav.getByRole("link", { name: "Stats" }).click();
    await expect(
      visitor.getByRole("list", { name: "Best duos" }),
    ).toBeVisible();

    await nav.getByRole("link", { name: "Teams" }).click();
    await visitor
      .getByRole("list", { name: "Players" })
      .getByLabel("Ann")
      .check();
    for (const name of ["Bea", "Cal", "Dot"])
      await visitor
        .getByRole("list", { name: "Players" })
        .getByLabel(name)
        .check();
    await visitor.getByRole("button", { name: "Generate teams" }).click();
    await expect(
      visitor.getByRole("region", { name: "Suggestion" }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("button", { name: "Record these" }),
    ).toHaveCount(0);
    await context.close();
  },
);
