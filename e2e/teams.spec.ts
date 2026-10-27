import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

async function group(
  page: Page,
  teamFormat: Record<string, unknown>,
  names = ["Bea", "Cal", "Dot", "Eve"],
) {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: { name: "Club", playerName: "Ann", teamFormat },
    headers,
  });
  const { id } = (await res.json()) as { id: string };
  await page.request.post(`/api/groups/${id}/players`, {
    data: { players: names.map((name) => ({ name })) },
    headers,
  });
  await page.goto(`/g/${id}/teams`);
  return id;
}

const pick = async (page: Page, names: string[]) => {
  for (const name of names)
    await page.getByRole("list", { name: "Players" }).getByLabel(name).check();
};

const suggestion = (page: Page) =>
  page.getByRole("region", { name: "Suggestion" });

test(
  "balanced teams with win probabilities, recorded through the batch form",
  { tag: "@TEAMS-001" },
  async ({ page }) => {
    const gid = await group(page, { kind: "fixed", teams: 2, size: 2 });
    await pick(page, ["Ann", "Bea", "Cal", "Dot"]);
    await page.getByRole("button", { name: "Generate teams" }).click();
    await expect(suggestion(page).getByRole("listitem")).toHaveCount(2);
    await expect(suggestion(page)).toContainText(/\d+%.*\d+%/s);

    await page.getByRole("button", { name: "Record these" }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${gid}/matches/new$`));
    for (const slot of [
      "1 player 1",
      "1 player 2",
      "2 player 1",
      "2 player 2",
    ]) {
      await expect(
        page.getByLabel(`Match 1 team ${slot}`).locator("option:checked"),
      ).not.toHaveText("Player…");
    }
  },
);

test(
  "extra players sit out, and regenerating rotates them",
  { tag: "@TEAMS-003" },
  async ({ page }) => {
    await group(page, { kind: "fixed", teams: 2, size: 2 });
    await pick(page, ["Ann", "Bea", "Cal", "Dot", "Eve"]);
    await page.getByRole("button", { name: "Generate teams" }).click();
    const out = page.getByText(/^Sitting out:/);
    await expect(out).toBeVisible();
    const first = await out.textContent();
    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(out).not.toHaveText(first ?? "");
  },
);

test(
  "too few players says how many more are needed",
  { tag: "@TEAMS-006" },
  async ({ page }) => {
    await group(page, { kind: "fixed", teams: 2, size: 2 });
    await pick(page, ["Ann", "Bea", "Cal"]);
    await page.getByRole("button", { name: "Generate teams" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Select 1 more player for a match of 2 teams of 2.",
    );
  },
);

test(
  "flexible groups choose the format first",
  { tag: "@TEAMS-007" },
  async ({ page }) => {
    await group(page, { kind: "flexible" });
    const format = page.getByRole("region", { name: "Format" });
    await format.getByLabel("Teams per match").selectOption("3");
    await format.getByLabel("Players per team").selectOption("1");
    await pick(page, ["Ann", "Bea", "Cal"]);
    await page.getByRole("button", { name: "Generate teams" }).click();
    await expect(suggestion(page).getByRole("listitem")).toHaveCount(3);
  },
);
