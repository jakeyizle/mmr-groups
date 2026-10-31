import { leaderboard, resolveRatingConfig } from "@mmr/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroupData } from "@/lib/groups";

import { match, snapshot, user, type User } from "../../../../test/fixtures";
import { type Call, renderRoute, stubApi } from "../../../../test/render";

const NOW = new Date("2026-10-20T12:00:00.000Z");

function open(
  path: string,
  data: GroupData | Response,
  account: User | null = user(),
) {
  const calls = stubApi({
    "GET /api/me": () => ({ user: account }),
    "GET /api/groups/g1": () => data,
    "GET /api/groups/g1/audit": () => ({ events: [], nextCursor: null }),
  });
  return { calls, ...renderRoute(path) };
}

const tabs = async () =>
  within(await screen.findByRole("navigation"))
    .getAllByRole("link")
    .map((a) => a.textContent);

afterEach(() => {
  vi.useRealTimers();
});

describe("group layout", { tags: ["VIS-003", "AUDIT-005"] }, () => {
  it("shows the name and every tab to members", async () => {
    open("/g/g1", snapshot({ role: "viewer" }));
    expect(
      await screen.findByRole("heading", { name: "Chess club" }),
    ).toBeTruthy();
    expect(await tabs()).toEqual([
      "Leaderboard",
      "Matches",
      "Stats",
      "Teams",
      "Me",
      "Audit",
      "Settings",
    ]);
    expect(
      screen.getByRole("link", { name: "Matches" }).getAttribute("href"),
    ).toBe("/g/g1/matches");
  });

  it(
    "links members to their own profile",
    { tags: ["STATS-014"] },
    async () => {
      open("/g/g1", snapshot({ role: "viewer" }));
      await screen.findByRole("heading", { name: "Chess club" });
      expect(
        screen.getByRole("link", { name: "Me" }).getAttribute("href"),
      ).toBe("/g/g1/players/a");
    },
  );

  it("hides member-only tabs from public visitors", async () => {
    open("/g/g1", snapshot({ role: null }), null);
    await screen.findByRole("heading", { name: "Chess club" });
    expect(await tabs()).toEqual(["Leaderboard", "Matches", "Stats", "Teams"]);
  });

  it("marks only the current tab active", async () => {
    open("/g/g1/stats", snapshot({ role: "viewer" }));
    await screen.findByRole("heading", { name: "Chess club" });
    const active = () =>
      screen
        .getAllByRole("link")
        .filter((a) => a.getAttribute("aria-current") === "page")
        .map((a) => a.textContent);
    await waitFor(() => {
      expect(active()).toEqual(["Stats"]);
    });
  });

  it("keeps the heading's place while loading", async () => {
    stubApi({
      "GET /api/me": () => ({ user: null }),
      "GET /api/groups/g1": () => new Promise(() => undefined),
    });
    renderRoute("/g/g1");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(
      " ",
    );
  });

  it("explains a missing or private group", async () => {
    open(
      "/g/g1",
      Response.json(
        { error: { code: "not_found", message: "Not found" } },
        { status: 404 },
      ),
      null,
    );
    expect(
      await screen.findByText(
        "This group doesn't exist, or you don't have access to it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("keeps the layout for other errors", async () => {
    const { queryClient } = open(
      "/g/g1",
      Response.json({ error: { code: "x", message: "x" } }, { status: 500 }),
    );
    expect(await tabs()).toContain("Leaderboard");
    await waitFor(() => {
      expect(queryClient.getQueryState(["group", "g1"])?.status).toBe("error");
    });
    expect(screen.queryByText(/doesn't exist/)).toBeNull();
  });
});

describe(
  "leaderboard",
  { tags: ["BOARD-001", "BOARD-002", "BOARD-003", "STATS-013"] },
  () => {
    const matches = [
      match("m1", 0, [
        [["a"], 1],
        [["b"], 2],
      ]),
      match("m2", 1, [
        [["b"], 1],
        [["a"], 2],
      ]),
      match("m3", 2, [
        [["a"], 1],
        [["b"], 1],
      ]),
      match("m4", 3, [
        [["a"], 1],
        [["gone"], 2],
      ]),
    ];

    it("ranks rated players and lists the rest as unrated", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open("/g/g1", snapshot({ matches }));
      const board = await screen.findByRole("list", { name: "Leaderboard" });
      const expected = leaderboard(
        matches,
        resolveRatingConfig(undefined),
        NOW.toISOString(),
      );
      const rows = within(board).getAllByRole("listitem");
      expect(rows).toHaveLength(expected.length);
      rows.forEach((li, i) => {
        const e = expected[i];
        if (!e) throw new Error("missing entry");
        const name = { a: "Ann", b: "Bob" }[e.playerId];
        if (name)
          expect(within(li).getByRole("link", { name })).toHaveProperty(
            "pathname",
            `/g/g1/players/${e.playerId}`,
          );
        else expect(within(li).queryByRole("link")).toBeNull();
        expect(li.textContent).toContain(String(e.rating));
        expect(li.textContent.startsWith(String(e.rank))).toBe(true);
      });
      expect(
        within(screen.getByRole("list", { name: "Unrated" }))
          .getAllByRole("link")
          .map((a) => [a.textContent, a.getAttribute("href")]),
      ).toEqual([["Cy", "/g/g1/players/c"]]);
    });

    it("shows records, ties only when there are some, and provisional players", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open("/g/g1", snapshot({ matches }));
      const board = await screen.findByRole("list", { name: "Leaderboard" });
      const row = (name: string) =>
        within(board).getByText(name).closest("li") as HTMLElement;
      expect(row("Ann").textContent).toContain("2W 1L 1T · 4 matches");
      expect(
        within(row("Removed player")).getByText(/W \d+L/).textContent,
      ).toBe("0W 1L · 1 match");
      // Few matches: every rating here is still provisional.
      expect(within(row("Ann")).getByText("Provisional")).toBeTruthy();
    });

    it("shows how many places each player moved", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      // c overtakes b in the last match.
      const climb = [
        match("m1", 0, [
          [["b"], 1],
          [["c"], 2],
        ]),
        match("m2", 1, [
          [["c"], 1],
          [["b"], 2],
        ]),
      ];
      open("/g/g1", snapshot({ matches: climb }));
      await screen.findByRole("list", { name: "Leaderboard" });
      const changes = leaderboard(
        climb,
        resolveRatingConfig(undefined),
        NOW.toISOString(),
      ).map((e) => e.rankChange);
      expect(changes).toEqual([1, -1]);
      const row = (name: string) =>
        within(screen.getByRole("link", { name }).closest("li") as HTMLElement);
      expect(row("Cy").getByLabelText("Up 1").textContent).toBe("▲ 1");
      expect(row("Bob").getByLabelText("Down 1").textContent).toBe("▼ 1");
    });

    it("shows no movement for a player's first match", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      open(
        "/g/g1",
        snapshot({
          matches: [
            match("m1", 0, [
              [["a"], 1],
              [["b"], 2],
            ]),
          ],
        }),
      );
      await screen.findByRole("list", { name: "Leaderboard" });
      expect(screen.queryByLabelText(/^(Up|Down)/)).toBeNull();
    });

    it("shows no movement for a player who kept their place", async () => {
      vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
      const kept = [
        match("m1", 0, [
          [["a"], 1],
          [["b"], 2],
        ]),
        match("m2", 1, [
          [["a"], 1],
          [["c"], 2],
        ]),
      ];
      open("/g/g1", snapshot({ matches: kept }));
      await screen.findByRole("list", { name: "Leaderboard" });
      const a = leaderboard(
        kept,
        resolveRatingConfig(undefined),
        NOW.toISOString(),
      ).find((e) => e.playerId === "a");
      expect(a?.rankChange).toBe(0);
      expect(screen.queryByLabelText(/^(Up|Down)/)).toBeNull();
      // Everyone has played: no unrated section.
      expect(screen.queryByRole("heading", { name: "Unrated" })).toBeNull();
    });

    it("invites recording when there are no matches", async () => {
      open("/g/g1", snapshot({ role: "recorder" }));
      expect(
        await screen.findByText(
          "No matches yet. Ratings appear once matches are recorded.",
        ),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: "Record matches" })
          .getAttribute("href"),
      ).toBe("/g/g1/matches/new");
    });

    it("hides recording from viewers", { tags: ["ROLE-008"] }, async () => {
      open("/g/g1", snapshot({ role: "viewer" }));
      await screen.findByText(/No matches yet/);
      expect(screen.queryByRole("link", { name: "Record matches" })).toBeNull();
    });
  },
);

describe("audit log", { tags: ["AUDIT-003", "AUDIT-005"] }, () => {
  const event = (id: string, createdAt: string) => ({
    id,
    action: "group.created",
    entityType: "group",
    entityId: "g1",
    actorName: "Ann",
    before: null,
    after: null,
    createdAt,
  });

  it("describes events with their time, loading older ones on demand", async () => {
    const calls: Call[] = stubApi({
      "GET /api/me": () => ({ user: user() }),
      "GET /api/groups/g1": () => snapshot(),
      "GET /api/groups/g1/audit": () =>
        calls.at(-1)?.query.cursor === "c1"
          ? {
              events: [event("e2", "2026-09-01T10:00:00.000Z")],
              nextCursor: null,
            }
          : {
              events: [event("e1", "2026-10-01T10:00:00.000Z")],
              nextCursor: "c1",
            },
    });
    renderRoute("/g/g1/audit");
    const log = await screen.findByRole("list", { name: "Audit log" });
    const when = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date("2026-10-01T10:00:00.000Z"));
    await waitFor(() => {
      expect(
        within(log)
          .getAllByRole("listitem")
          .map((li) => li.textContent),
      ).toEqual([`Ann created the group${when}`]);
    });
    await userEvent.click(screen.getByRole("button", { name: "Show older" }));
    await waitFor(() => {
      expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    });
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
    expect(
      calls.filter((c) => c.path.endsWith("/audit")).map((c) => c.query),
    ).toEqual([{}, { cursor: "c1" }]);
  });

  it("uses current player names", async () => {
    stubApi({
      "GET /api/me": () => ({ user: user() }),
      "GET /api/groups/g1": () => snapshot(),
      "GET /api/groups/g1/audit": () => ({
        events: [
          {
            ...event("e1", "2026-10-01T10:00:00.000Z"),
            action: "player.left",
            entityId: "b",
          },
        ],
        nextCursor: null,
      }),
    });
    const { queryClient } = renderRoute("/g/g1/audit");
    expect(await screen.findByText("Bob left the group")).toBeTruthy();
    // Cached per group.
    expect(queryClient.getQueryData(["audit", "g1"])).toBeDefined();
  });

  it("is only visible to members", async () => {
    stubApi({
      "GET /api/me": () => ({ user: user() }),
      "GET /api/groups/g1": () => snapshot({ role: null }),
      "GET /api/groups/g1/audit": () =>
        Response.json(
          { error: { code: "forbidden", message: "No" } },
          { status: 403 },
        ),
    });
    renderRoute("/g/g1/audit");
    expect(
      await screen.findByText("The audit log is only visible to members."),
    ).toBeTruthy();
  });

  it(
    "sends signed-out visitors to sign in",
    { tags: ["AUTH-005"] },
    async () => {
      const { router } = open("/g/g1/audit", snapshot({ role: null }), null);
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/login");
      });
      expect(router.state.location.search).toEqual({ returnTo: "/g/g1/audit" });
    },
  );
});
