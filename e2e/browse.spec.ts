import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

/** A public singles group with players a and b and `matches` matches. */
async function listedGroup(
  page: Page,
  name: string,
  { matches = 1, description = "" } = {},
) {
  const res = await page.request.post("/api/groups", {
    data: {
      name,
      description,
      playerName: "a",
      visibility: "public",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
    },
    headers,
  });
  const { id: gid, playerId: a } = (await res.json()) as {
    id: string;
    playerId: string;
  };
  const added = await page.request.post(`/api/groups/${gid}/players`, {
    data: { players: [{ name: "b" }] },
    headers,
  });
  const [b = ""] = (
    (await added.json()) as { players: { id: string }[] }
  ).players.map((p) => p.id);
  const recorded = await page.request.post(`/api/groups/${gid}/matches`, {
    data: {
      matches: Array.from({ length: matches }, (_, i) => ({
        playedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
        teams: [
          { playerIds: [a], rank: 1 },
          { playerIds: [b], rank: 2 },
        ],
      })),
    },
    headers,
  });
  expect(recorded.status()).toBe(201);
  return gid;
}

const tag = () => Math.random().toString(36).slice(2, 8);

test(
  "anyone can browse, sort, search and page through public groups",
  { tag: ["@VIS-009", "@VIS-010", "@VIS-011", "@VIS-012"] },
  async ({ page, browser }) => {
    test.slow();
    const prefix = `Browse ${tag()}`;
    await signIn(page, "Owner");
    for (let i = 1; i <= 27; i++) {
      const n = String(i).padStart(2, "0");
      await listedGroup(page, `${prefix} ${n}`, {
        matches: i === 5 ? 3 : 1,
        description: i === 5 ? "Tuesday nights" : "",
      });
    }
    // Signed in, the home page links to the index too.
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Browse public groups" }),
    ).toBeVisible();

    const context = await browser.newContext(test.info().project.use);
    const visitor = await context.newPage();
    await visitor.goto("/");
    await visitor.getByRole("link", { name: "Browse public groups" }).click();
    await expect(
      visitor.getByRole("heading", { name: "Public groups" }),
    ).toBeVisible();

    const rows = visitor
      .getByRole("list", { name: "Public groups" })
      .getByRole("listitem");
    await visitor
      .getByRole("searchbox", { name: "Search groups" })
      .fill(prefix.toUpperCase());
    await expect(visitor).toHaveURL(/q=/);
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText(`${prefix} 01`);
    await expect(rows.nth(4)).toContainText("Tuesday nights");
    await expect(rows.nth(4)).toContainText("2 players · 3 matches");

    await visitor.getByRole("button", { name: "Load more" }).click();
    await expect(rows).toHaveCount(27);
    await expect(rows.last()).toContainText(`${prefix} 27`);
    await expect(
      visitor.getByRole("button", { name: "Load more" }),
    ).toHaveCount(0);

    await visitor.getByRole("combobox", { name: "Sort by" }).selectOption({
      label: "Match count",
    });
    await expect(rows.first()).toContainText(`${prefix} 05`);
    await visitor.getByRole("button", { name: /Order: Most first/ }).click();
    await expect(rows.first()).not.toContainText(`${prefix} 05`);
    await expect(
      visitor.getByRole("button", { name: /Order: Fewest first/ }),
    ).toBeVisible();

    // The URL carries the view.
    await visitor.reload();
    await expect(rows.first()).not.toContainText(`${prefix} 05`);
    await expect(
      visitor.getByRole("combobox", { name: "Sort by" }),
    ).toHaveValue("matches");

    await visitor
      .getByRole("searchbox", { name: "Search groups" })
      .fill(`${prefix} 1`);
    await expect(rows).toHaveCount(10);
    await visitor
      .getByRole("searchbox", { name: "Search groups" })
      .fill(`${prefix} nope`);
    await expect(visitor.getByText(/No public groups match/)).toBeVisible();

    await visitor
      .getByRole("searchbox", { name: "Search groups" })
      .fill(prefix);
    await rows.first().getByRole("link").click();
    await expect(
      visitor.getByRole("list", { name: "Leaderboard" }),
    ).toBeVisible();
    await context.close();
  },
);

test(
  "a site admin can hide a group from the index",
  { tag: ["@VIS-013"] },
  async ({ page, browser }) => {
    const name = `Hide ${tag()}`;
    await signIn(page, "Owner");
    const gid = await listedGroup(page, name);

    const context = await browser.newContext(test.info().project.use);
    const admin = await context.newPage();
    await signIn(admin, "Site Admin", undefined, { isSiteAdmin: true });
    const listed = async (p: Page) => {
      await p.goto(`/groups?q=${encodeURIComponent(name)}`);
      return p
        .getByRole("list", { name: "Public groups" })
        .getByRole("listitem");
    };
    await expect(await listed(admin)).toHaveCount(1);

    // Not a member, but site admins get the Settings tab (ROLE-010).
    await admin.goto(`/g/${gid}`);
    await admin
      .getByRole("navigation")
      .getByRole("link", { name: "Settings" })
      .click();
    const hide = admin.getByRole("switch", { name: "Hide from public index" });
    await hide.click();
    await expect(hide).toBeChecked();

    await admin.goto(`/groups?q=${encodeURIComponent(name)}`);
    await expect(admin.getByText(/No public groups match/)).toBeVisible();

    // The owner is told, and can't unhide it.
    await page.goto(`/g/${gid}/settings`);
    await expect(page.getByRole("note")).toContainText(
      "hidden this group from the public index",
    );
    await expect(
      page.getByRole("switch", { name: "Hide from public index" }),
    ).toHaveCount(0);

    await admin.goto(`/g/${gid}/settings`);
    await admin.getByRole("switch", { name: "Hide from public index" }).click();
    await expect(
      admin.getByRole("switch", { name: "Hide from public index" }),
    ).not.toBeChecked();
    await expect(await listed(admin)).toHaveCount(1);
    await context.close();
  },
);
