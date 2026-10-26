import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

async function createGroupViaApi(
  page: Page,
  json: Record<string, unknown> = {},
) {
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Thursday Doubles",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 2 },
      ...json,
    },
    headers: { "X-Requested-With": "fetch" },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

test(
  "creating a group makes you its owner and lists it on the home page",
  { tag: ["@GROUP-001", "@GROUP-003", "@GROUP-006"] },
  async ({ page }) => {
    await signIn(page, "Ann");
    await page.goto("/");
    await page.getByRole("link", { name: "New group" }).click();

    await page.getByLabel("Group name").fill("Thursday Doubles");
    await page.getByLabel("Your player name").fill("Ann");
    await page.getByLabel("Teams", { exact: true }).fill("2");
    await page.getByLabel("Players per team").fill("2");
    await page.getByRole("button", { name: "Create group" }).click();

    await expect(page).toHaveURL(/\/g\/[0-9A-Z]{26}$/);
    await expect(
      page.getByRole("heading", { name: "Thursday Doubles" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "MMR Groups" }).click();
    const row = page.getByRole("link", { name: /Thursday Doubles/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText("owner");
  },
);

test(
  "the group form validates before submitting",
  { tag: "@GROUP-012" },
  async ({ page }) => {
    await signIn(page);
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill("x".repeat(41));
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/groups\/new$/);
  },
);

test(
  "admins edit settings; the team format is read-only",
  { tag: ["@GROUP-004", "@GROUP-005"] },
  async ({ page }) => {
    await signIn(page);
    const gid = await createGroupViaApi(page);
    await page.goto(`/g/${gid}/settings`);

    await expect(page.getByText("2 teams of 2")).toBeVisible();
    await expect(page.getByLabel("Teams", { exact: true })).toHaveCount(0);

    await page.getByLabel("Group name").fill("Friday Doubles");
    await page.getByRole("switch", { name: "Allow ties" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");

    await page.reload();
    await expect(page.getByLabel("Group name")).toHaveValue("Friday Doubles");
    await expect(
      page.getByRole("switch", { name: "Allow ties" }),
    ).toBeChecked();
    await expect(
      page.getByRole("heading", { name: "Friday Doubles" }),
    ).toBeVisible();
  },
);

test(
  "the owner deletes the group after confirming",
  { tag: "@GROUP-007" },
  async ({ page }) => {
    await signIn(page);
    const gid = await createGroupViaApi(page, { name: "Doomed" });
    await page.goto(`/g/${gid}/settings`);

    await page.getByRole("button", { name: "Delete group" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${gid}/settings$`));

    await page.getByRole("button", { name: "Delete group" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Doomed/ })).toHaveCount(0);
    expect((await page.request.get(`/api/groups/${gid}`)).status()).toBe(404);
  },
);

test(
  "controls are hidden from people who can't use them",
  { tag: "@ROLE-008" },
  async ({ page, browser }) => {
    await signIn(page);
    const gid = await createGroupViaApi(page, { visibility: "public" });

    const other = await browser.newContext(test.info().project.use);
    const visitor = await other.newPage();
    await signIn(visitor, "Visitor");
    await visitor.goto(`/g/${gid}/settings`);

    await expect(visitor.getByLabel("Group name")).toHaveValue(
      "Thursday Doubles",
    );
    await expect(visitor.getByLabel("Group name")).toBeDisabled();
    await expect(
      visitor.getByRole("button", { name: "Save settings" }),
    ).toHaveCount(0);
    await expect(
      visitor.getByRole("button", { name: "Delete group" }),
    ).toHaveCount(0);
    await other.close();

    // The owner does see them.
    await page.goto(`/g/${gid}/settings`);
    await expect(
      page.getByRole("button", { name: "Delete group" }),
    ).toBeVisible();
  },
);
