import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

async function group(page: Page, visibility = "private") {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Singles",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
      visibility,
    },
    headers,
  });
  return (await res.json()) as { id: string; playerId: string };
}

const lines = (page: Page) =>
  page.getByRole("list", { name: "Audit log" }).getByRole("listitem");

test(
  "members read the audit log in plain language, newest first, in pages",
  { tag: ["@AUDIT-003", "@AUDIT-004"] },
  async ({ page }) => {
    const { id: gid, playerId: ann } = await group(page);
    const added = await page.request.post(`/api/groups/${gid}/players`, {
      data: { players: [{ name: "Bea" }] },
      headers,
    });
    const { players } = (await added.json()) as { players: { id: string }[] };
    const bea = players[0]?.id ?? "";
    await page.request.post(`/api/groups/${gid}/matches`, {
      data: {
        matches: [
          {
            playedAt: "2026-10-12T18:00:00.000Z",
            teams: [
              { playerIds: [ann], score: 11 },
              { playerIds: [bea], score: 7 },
            ],
          },
        ],
      },
      headers,
    });
    await page.request.patch(`/api/groups/${gid}/players/${bea}`, {
      data: { displayName: "Bee" },
      headers,
    });

    await page.goto(`/g/${gid}/audit`);
    await expect(lines(page).nth(0)).toContainText("Ann renamed Bea to Bee");
    await expect(lines(page).nth(1)).toContainText(
      /Ann recorded a match on Oct 1[23], 2026: Ann 11 – Bee 7/,
    );
    await expect(lines(page).nth(2)).toContainText("Ann added Bea as recorder");
    await expect(lines(page).last()).toContainText("Ann created the group");
    await expect(page.getByRole("button", { name: "Show older" })).toHaveCount(
      0,
    );

    // 60 more entries: the first page holds 50, the rest load on request.
    for (const batch of [0, 1]) {
      await page.request.post(`/api/groups/${gid}/players`, {
        data: {
          players: Array.from({ length: 30 }, (_, i) => ({
            name: `P${String(batch * 30 + i)}`,
          })),
        },
        headers,
      });
    }
    await page.reload();
    await expect(lines(page)).toHaveCount(50);
    await page.getByRole("button", { name: "Show older" }).click();
    await expect(lines(page)).toHaveCount(65);
    await expect(page.getByRole("button", { name: "Show older" })).toHaveCount(
      0,
    );
    await expect(lines(page).last()).toContainText("Ann created the group");
  },
);

test(
  "a public group's visitors can't see its audit log",
  { tag: "@AUDIT-005" },
  async ({ page, browser }) => {
    const { id: gid } = await group(page, "public");
    const other = await browser.newContext(test.info().project.use);
    const visitor = await other.newPage();
    await signIn(visitor, "Visitor");
    await visitor.goto(`/g/${gid}/audit`);
    await expect(
      visitor.getByText("The audit log is only visible to members."),
    ).toBeVisible();
    await expect(lines(visitor)).toHaveCount(0);
    await other.close();
  },
);
