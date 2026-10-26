import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

async function groupWithSettingsOpen(page: Page, visibility = "private") {
  await signIn(page, "Owner");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Doubles",
      playerName: "Owner",
      teamFormat: { kind: "fixed", teams: 2, size: 2 },
      visibility,
    },
    headers: { "X-Requested-With": "fetch" },
  });
  const { id } = (await res.json()) as { id: string };
  await page.goto(`/g/${id}/settings`);
  return id;
}

const row = (page: Page, name: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });

async function addPlayers(page: Page, names: string[]) {
  await page.getByLabel("Add players").fill(names.join("\n"));
  await page.getByRole("button", { name: /^Add/ }).click();
}

test(
  "admins add several unclaimed players at once",
  { tag: "@PLAYER-001" },
  async ({ page }) => {
    await groupWithSettingsOpen(page);
    await addPlayers(page, ["Dave", "Sue"]);
    for (const name of ["Dave", "Sue"]) {
      await expect(row(page, name)).toContainText("Unclaimed");
      await expect(row(page, name)).toContainText("Recorder");
    }
    await expect(page.getByLabel("Add players")).toHaveValue("");
  },
);

test(
  "a taken name is reported on the field",
  { tag: "@PLAYER-004" },
  async ({ page }) => {
    await groupWithSettingsOpen(page);
    await addPlayers(page, ["Dave"]);
    await expect(row(page, "Dave")).toBeVisible();
    await addPlayers(page, ["dave"]);
    await expect(page.getByText("That name is already taken")).toBeVisible();
  },
);

test(
  "unclaimed players get a pre-assigned role, but never admin",
  { tag: ["@PLAYER-003", "@ROLE-014"] },
  async ({ page }) => {
    await groupWithSettingsOpen(page);
    await addPlayers(page, ["Sue"]);
    await row(page, "Sue").getByRole("button", { name: "Edit Sue" }).click();

    await row(page, "Sue").getByLabel("Role").click();
    await expect(page.getByRole("option", { name: "Admin" })).toHaveCount(0);
    await page.getByRole("option", { name: "Viewer" }).click();
    await expect(row(page, "Sue")).toContainText("Viewer");

    await page.reload();
    await expect(row(page, "Sue")).toContainText("Viewer");
  },
);

test(
  "renaming keeps the player; removing deletes one without matches",
  { tag: ["@PLAYER-005", "@PLAYER-006"] },
  async ({ page }) => {
    await groupWithSettingsOpen(page);
    await addPlayers(page, ["Davd", "Sue"]);

    await row(page, "Davd").getByRole("button", { name: "Edit Davd" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Dave");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(row(page, "Dave")).toBeVisible();
    await expect(page.getByText("Davd", { exact: true })).toHaveCount(0);

    await row(page, "Sue").getByRole("button", { name: "Edit Sue" }).click();
    await row(page, "Sue")
      .getByRole("button", { name: "Remove player" })
      .click();
    await expect(page.getByText("Sue", { exact: true })).toHaveCount(0);
  },
);

test(
  "non-admins see players but no player controls",
  { tag: "@ROLE-008" },
  async ({ page, browser }) => {
    const gid = await groupWithSettingsOpen(page, "public");
    await addPlayers(page, ["Dave"]);
    await expect(row(page, "Dave")).toBeVisible();

    const other = await browser.newContext(test.info().project.use);
    const visitor = await other.newPage();
    await signIn(visitor, "Visitor");
    await visitor.goto(`/g/${gid}/settings`);
    await expect(row(visitor, "Dave")).toBeVisible();
    await expect(visitor.getByLabel("Add players")).toHaveCount(0);
    await expect(visitor.getByRole("button", { name: /^Edit / })).toHaveCount(
      0,
    );
    await other.close();
  },
);
