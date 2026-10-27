import {
  type Browser,
  expect,
  type Page,
  test,
  type TestInfo,
} from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

/**
 * Owner "Olive" with unclaimed Dave (recorder) and Sue (viewer), a Dave match,
 * and an invite link. Returns the group id and invite path.
 */
async function groupWithInvite(page: Page) {
  await signIn(page, "Olive");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Club",
      playerName: "Olive",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
    },
    headers,
  });
  const { id: gid, playerId: olive } = (await res.json()) as {
    id: string;
    playerId: string;
  };
  const added = await page.request.post(`/api/groups/${gid}/players`, {
    data: {
      players: [
        { name: "Dave", role: "recorder" },
        { name: "Sue", role: "viewer" },
      ],
    },
    headers,
  });
  const { players } = (await added.json()) as { players: { id: string }[] };
  await page.request.post(`/api/groups/${gid}/matches`, {
    data: {
      matches: [
        {
          playedAt: new Date(Date.now() - 3_600_000).toISOString(),
          teams: [
            { playerIds: [players[0]?.id], rank: 1 },
            { playerIds: [olive], rank: 2 },
          ],
        },
      ],
    },
    headers,
  });
  const inv = await page.request.put(`/api/groups/${gid}/invite`, {
    data: {},
    headers,
  });
  const { invite } = (await inv.json()) as { invite: { code: string } };
  return { gid, path: `/join/${invite.code}` };
}

/** A second person in their own browser context. */
async function person(browser: Browser, info: TestInfo) {
  const context = await browser.newContext(info.project.use);
  return { context, page: await context.newPage() };
}

async function joinAs(page: Page, path: string, name: string, player: string) {
  await signIn(page, name);
  await page.goto(path);
  await page.getByRole("button", { name: new RegExp(`^${player}`) }).click();
  await expect(page.getByRole("link", { name: "Leaderboard" })).toBeVisible();
}

test(
  "a signed-out visitor signs in, claims a player and sees their matches",
  { tag: ["@JOIN-004", "@JOIN-005"] },
  async ({ page, browser }) => {
    const { gid, path } = await groupWithInvite(page);
    const { context, page: dan } = await person(browser, test.info());

    await dan.goto(path);
    await expect(dan).toHaveURL(/\/login\?returnTo=/);
    await expect(
      dan.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute(
      "href",
      new RegExp(`returnTo=${encodeURIComponent(path)}`),
    );

    await joinAs(dan, path, "Dan", "Dave");
    await expect(dan).toHaveURL(new RegExp(`/g/${gid}$`));
    await expect(
      dan
        .getByRole("list", { name: "Leaderboard" })
        .getByRole("listitem")
        .first(),
    ).toContainText("Dave");
    // Recorder role: they can record matches.
    await expect(
      dan.getByRole("link", { name: "Record matches" }),
    ).toBeVisible();
    await context.close();
  },
);

test(
  "a joiner who isn't listed adds themselves",
  { tag: "@JOIN-006" },
  async ({ page, browser }) => {
    const { gid, path } = await groupWithInvite(page);
    const { context, page: pat } = await person(browser, test.info());
    await signIn(pat, "Pat");
    await pat.goto(path);
    await expect(
      pat.getByRole("list", { name: "Unclaimed players" }).getByRole("button"),
    ).toHaveCount(2);
    await pat.getByRole("button", { name: "I'm not listed" }).click();
    await pat.getByLabel("Your name in this group").fill("Pat");
    await pat.getByRole("button", { name: "Join" }).click();
    await expect(pat).toHaveURL(new RegExp(`/g/${gid}$`));
    await expect(pat.getByRole("list", { name: "Unrated" })).toContainText(
      "Pat",
    );
    await context.close();
  },
);

test(
  "members who open the link go straight to the group",
  { tag: "@JOIN-008" },
  async ({ page }) => {
    const { gid, path } = await groupWithInvite(page);
    // The page redirects on the client as it loads; WebKit can report that as
    // an interrupted load, so wait only for the navigation to start.
    await page.goto(path, { waitUntil: "commit" });
    await expect(page).toHaveURL(new RegExp(`/g/${gid}$`));
  },
);

test(
  "invalid links say so without group details",
  { tag: "@JOIN-009" },
  async ({ page }) => {
    await groupWithInvite(page);
    await page.goto("/join/notarealcode");
    await expect(
      page.getByText("This invite link is no longer valid"),
    ).toBeVisible();
    await expect(page.getByText("Club")).toHaveCount(0);
  },
);

test(
  "a member leaves; the owner has to transfer first",
  { tag: "@JOIN-010" },
  async ({ page, browser }) => {
    const { gid, path } = await groupWithInvite(page);
    const { context, page: dan } = await person(browser, test.info());
    await joinAs(dan, path, "Dan", "Dave");
    await expect(dan).toHaveURL(new RegExp(`/g/${gid}$`));

    await dan.goto(`/g/${gid}/settings`);
    await dan.getByRole("button", { name: "Leave group" }).click();
    await dan.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(dan).toHaveURL(/\/$/);
    await expect(dan.getByRole("link", { name: "Club" })).toHaveCount(0);
    await context.close();

    await page.goto(`/g/${gid}/settings`);
    await expect(
      page.getByText("Transfer ownership before leaving"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave group" })).toHaveCount(
      0,
    );
  },
);

const row = (page: Page, name: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });

test(
  "with a second member: grant admin, unlink, and transfer ownership",
  { tag: ["@ROLE-005", "@PLAYER-008", "@GROUP-008"] },
  async ({ page, browser }) => {
    // Three people and many steps: more than the default 30 s under full parallel load.
    test.slow();
    const { gid, path } = await groupWithInvite(page);
    const dan = await person(browser, test.info());
    await joinAs(dan.page, path, "Dan", "Dave");
    const sam = await person(browser, test.info());
    await joinAs(sam.page, path, "Sam", "Sue");
    await expect(sam.page).toHaveURL(new RegExp(`/g/${gid}$`));
    await sam.context.close();

    await page.goto(`/g/${gid}/settings`);
    // ROLE-005: the owner can make a claimed player an admin, and back.
    await row(page, "Dave").getByRole("button", { name: "Edit Dave" }).click();
    await row(page, "Dave").getByLabel("Role").click();
    await page.getByRole("option", { name: "Admin" }).click();
    await expect(row(page, "Dave")).toContainText("Admin");

    // PLAYER-008: unlink a non-admin claimed player.
    await row(page, "Sue").getByRole("button", { name: "Edit Sue" }).click();
    await row(page, "Sue")
      .getByRole("button", { name: "Unlink account" })
      .click();
    await expect(row(page, "Sue")).toContainText("Unclaimed");

    // GROUP-008: transfer ownership to Dave; Olive becomes an admin.
    await page.getByLabel("Transfer ownership").click();
    await page.getByRole("option", { name: "Dave" }).click();
    await page.getByRole("button", { name: "Transfer", exact: true }).click();
    await page.getByRole("button", { name: "Transfer ownership" }).click();
    await expect(row(page, "Dave")).toContainText("Owner");
    await expect(row(page, "Olive")).toContainText("Admin");
    await expect(
      page.getByRole("heading", { name: "Danger zone" }),
    ).toHaveCount(0);

    await dan.page.goto(`/g/${gid}/settings`);
    await expect(
      dan.page.getByRole("heading", { name: "Danger zone" }),
    ).toBeVisible();
    await dan.context.close();
  },
);
