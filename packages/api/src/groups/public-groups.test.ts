import { newId } from "@mmr/core";
import { describe, expect, it } from "vitest";

import {
  api,
  db,
  request,
  seedGroup,
  seedUser,
  signIn,
} from "../../test/helpers";
import { SESSION_COOKIE } from "../auth/session";
import { matches, players } from "../db/schema";

interface Listed {
  id: string;
  name: string;
  description: string;
  playerCount: number;
  matchCount: number;
  lastPlayedAt: string;
  createdAt: string;
}
interface Page {
  groups: Listed[];
  nextCursor: string | null;
}

async function list(params: Record<string, string> = {}) {
  const res = await api(
    `/api/public-groups?${new URLSearchParams(params).toString()}`,
  );
  return { status: res.status, body: await res.json<Page>() };
}

/** Every page of a listing, following cursors. */
async function walk(params: Record<string, string>) {
  const seen: Listed[] = [];
  let cursor: string | null = null;
  do {
    const { status, body } = await list({
      ...params,
      ...(cursor && { cursor }),
    });
    expect(status).toBe(200);
    expect(body.groups.length).toBeLessThanOrEqual(25);
    seen.push(...body.groups);
    cursor = body.nextCursor;
  } while (cursor);
  return seen;
}

const day = (d: number) =>
  `2026-01-${String(d).padStart(2, "0")}T12:00:00.000Z`;

/**
 * A group written straight to the DB (counters come from the triggers): `players`
 * players and one match per entry of `played` (days).
 */
async function fixture(
  id: string,
  name: string,
  {
    players: n = 2,
    played = [1],
    created = 1,
    ...overrides
  }: {
    players?: number;
    played?: number[];
    created?: number;
    visibility?: "public" | "private";
    hiddenFromIndex?: boolean;
  } = {},
) {
  await seedGroup(undefined, {
    id,
    name,
    visibility: "public",
    createdAt: day(created),
    ...overrides,
  });
  const ids = Array.from({ length: n }, () => newId());
  await db.insert(players).values(
    ids.map((pid, i) => ({
      id: pid,
      groupId: id,
      displayName: `p${String(i)}`,
      role: "recorder" as const,
      createdAt: day(created),
    })),
  );
  for (const d of played) {
    await db.insert(matches).values({
      id: newId(),
      groupId: id,
      playedAt: day(d),
      teams: [
        { playerIds: [ids[0] ?? ""], score: null, rank: 1 },
        { playerIds: [ids[1] ?? ""], score: null, rank: 2 },
      ],
      createdAt: day(d),
      updatedAt: day(d),
    });
  }
}

describe(
  "VIS-009: anyone can browse an index of public groups",
  { tags: ["VIS-009"] },
  () => {
    it("lists public groups with matches, with public fields only", async () => {
      await fixture("l1", "Listing one", {
        players: 3,
        played: [4, 7],
        created: 2,
      });
      await fixture("l2", "Listing private", { visibility: "private" });
      await fixture("l3", "Listing empty", { played: [] });
      await seedGroup(undefined, {
        name: "Listing bare",
        visibility: "public",
      });

      for (const session of [undefined, await signIn((await seedUser()).id)]) {
        const res = await request("/api/public-groups?q=listing", {
          headers: session ? { Cookie: `${SESSION_COOKIE}=${session}` } : {},
        });
        expect(res.status).toBe(200);
        const body = await res.json<Page>();
        expect(body).toEqual({
          groups: [
            {
              id: "l1",
              name: "Listing one",
              description: "",
              playerCount: 3,
              matchCount: 2,
              lastPlayedAt: day(7),
              createdAt: day(2),
            },
          ],
          nextCursor: null,
        });
      }
    });

    it("counts follow every kind of change made through the API", async () => {
      const owner = await seedUser();
      const session = await signIn(owner.id);
      const created = await api("/api/groups", {
        method: "POST",
        session,
        json: {
          name: "Counted",
          playerName: "a",
          visibility: "public",
          teamFormat: { kind: "fixed", teams: 2, size: 1 },
        },
      });
      const { id: gid, playerId: a } = await created.json<{
        id: string;
        playerId: string;
      }>();
      const row = async () => {
        const g = await db.query.groups.findFirst({
          where: (t, { eq }) => eq(t.id, gid),
        });
        return {
          players: g?.playerCount,
          matches: g?.matchCount,
          last: g?.lastPlayedAt,
        };
      };
      const listed = async () =>
        (await list({ q: "counted" })).body.groups.map((g) => g.id);

      expect(await row()).toEqual({ players: 1, matches: 0, last: null });
      expect(await listed()).toEqual([]);

      const added = await api(`/api/groups/${gid}/players`, {
        method: "POST",
        session,
        json: { players: [{ name: "b" }, { name: "c" }] },
      });
      const [b, c] = (
        await added.json<{ players: { id: string }[] }>()
      ).players.map((p) => p.id) as [string, string];
      expect((await row()).players).toBe(3);

      const recorded = await api(`/api/groups/${gid}/matches`, {
        method: "POST",
        session,
        json: {
          matches: [3, 5].map((d) => ({
            playedAt: day(d),
            teams: [
              { playerIds: [a], rank: 1 },
              { playerIds: [b], rank: 2 },
            ],
          })),
        },
      });
      expect(recorded.status).toBe(201);
      const { matches: made } = await recorded.json<{
        matches: { id: string; version: number }[];
      }>();
      expect(await row()).toEqual({ players: 3, matches: 2, last: day(5) });
      expect(await listed()).toEqual([gid]);

      const send = (
        method: string,
        m: { id: string; version: number },
        json?: unknown,
      ) =>
        request(`/api/groups/${gid}/matches/${m.id}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "fetch",
            Cookie: `${SESSION_COOKIE}=${session}`,
            "If-Match": `"${String(m.version)}"`,
          },
          body: json === undefined ? undefined : JSON.stringify(json),
        });
      const [m1, m2] = made as [
        { id: string; version: number },
        { id: string; version: number },
      ];
      expect((await send("PATCH", m1, { playedAt: day(9) })).status).toBe(200);
      expect((await row()).last).toBe(day(9));

      expect((await send("DELETE", { ...m1, version: 2 })).status).toBe(200);
      expect(await row()).toEqual({ players: 3, matches: 1, last: day(5) });

      const removed = await api(`/api/groups/${gid}/players/${c}`, {
        method: "DELETE",
        session,
      });
      expect(removed.status).toBe(200);
      expect((await row()).players).toBe(2);

      const inv = await api(`/api/groups/${gid}/invite`, {
        method: "PUT",
        session,
        json: {},
      });
      const { invite } = await inv.json<{ invite: { code: string } }>();
      const joiner = await signIn((await seedUser()).id);
      const claimed = await api(`/api/invites/${invite.code}/claim`, {
        method: "POST",
        session: joiner,
        json: { newPlayerName: "Pat" },
      });
      expect(claimed.status).toBe(201);
      expect((await row()).players).toBe(3);

      await api(`/api/groups/${gid}`, {
        method: "PATCH",
        session,
        json: { visibility: "private" },
      });
      expect(await listed()).toEqual([]);
      await api(`/api/groups/${gid}`, {
        method: "PATCH",
        session,
        json: { visibility: "public" },
      });
      expect(await listed()).toEqual([gid]);

      expect((await send("DELETE", m2)).status).toBe(200);
      expect(await row()).toEqual({ players: 3, matches: 0, last: null });
      expect(await listed()).toEqual([]);
    });
  },
);

describe("VIS-010: the index can be sorted", { tags: ["VIS-010"] }, () => {
  // id, name, players, played days, created day
  it("sorts by name by default, and by each key in either direction", async () => {
    await fixture("sa", "sort alpha", {
      players: 2,
      played: [1, 2, 5],
      created: 1,
    });
    await fixture("sb", "Sort Bravo", { players: 4, played: [9], created: 2 });
    await fixture("sc", "sort charlie", {
      players: 2,
      played: [1, 1, 2],
      created: 3,
    });
    await fixture("sd", "Sort Delta", {
      players: 3,
      played: [3, 9],
      created: 4,
    });
    await fixture("se", "sort echo", { visibility: "private" });
    await fixture("sf", "sort foxtrot", { played: [] });
    await fixture("sg", "sort golf", { hiddenFromIndex: true });

    const order = async (params: Record<string, string> = {}) =>
      (await walk({ q: "sort", ...params })).map((g) => g.id);

    // Case-insensitive: a binary sort would put "Sort …" before "sort …".
    expect(await order()).toEqual(["sa", "sb", "sc", "sd"]);
    const expected: [string, string, string[]][] = [
      ["name", "asc", ["sa", "sb", "sc", "sd"]],
      ["name", "desc", ["sd", "sc", "sb", "sa"]],
      // Ties (sb, sd on day 9; sa, sc on 3 matches; sa, sc on 2 players) by id.
      ["played", "", ["sd", "sb", "sa", "sc"]],
      ["played", "asc", ["sc", "sa", "sb", "sd"]],
      ["matches", "", ["sc", "sa", "sd", "sb"]],
      ["matches", "asc", ["sb", "sd", "sa", "sc"]],
      ["players", "", ["sb", "sd", "sc", "sa"]],
      ["players", "asc", ["sa", "sc", "sd", "sb"]],
      ["created", "", ["sd", "sc", "sb", "sa"]],
      ["created", "asc", ["sa", "sb", "sc", "sd"]],
    ];
    for (const [sort, dir, ids] of expected) {
      expect(
        await order({ sort, ...(dir && { dir }) }),
        `${sort} ${dir}`,
      ).toEqual(ids);
    }
  });

  it("rejects unknown sorts", async () => {
    expect((await list({ sort: "rating" })).status).toBe(400);
    expect((await list({ dir: "up" })).status).toBe(400);
  });
});

describe(
  "VIS-011: the index can be searched by name",
  { tags: ["VIS-011"] },
  () => {
    it("matches substrings ignoring case, with wildcards taken literally", async () => {
      await fixture("q1", "Search Glacier");
      await fixture("q2", "search glaciers club");
      await fixture("q3", "Search Bears");
      await fixture("q4", "Search 100% fun");
      await fixture("q5", "search_under");
      const ids = async (q: string, sort = "name") =>
        (await walk({ q, sort })).map((g) => g.id);

      expect(await ids("GLAC")).toEqual(["q1", "q2"]);
      expect(await ids("glac", "created")).toEqual(["q2", "q1"]);
      expect(await ids("  glaciers  ")).toEqual(["q2"]);
      expect(await ids("%")).toEqual(["q4"]);
      expect(await ids("_")).toEqual(["q5"]);
      expect(await ids("nothing like it")).toEqual([]);
      // Blank means no filter.
      expect((await walk({ q: " " })).map((g) => g.id)).toContain("q3");
      expect((await list({ q: "x".repeat(101) })).status).toBe(400);
    });
  },
);

describe("VIS-012: the index is paged", { tags: ["VIS-012"] }, () => {
  it("walks every page with no repeats or skips, ties included", async () => {
    // 30 groups, all 1 match and 2 players; names alternate case.
    const nums = Array.from({ length: 30 }, (_, i) =>
      String(i + 1).padStart(2, "0"),
    );
    for (const n of nums) {
      const name = Number(n) % 2 ? `PAGE ${n}` : `page ${n}`;
      await fixture(`pg${n}`, name, { created: (Number(n) % 3) + 1 });
    }
    const ids = nums.map((n) => `pg${n}`);
    const order = async (params: Record<string, string>) =>
      (await walk({ q: "page", ...params })).map((g) => g.id);

    const first = await list({ q: "page" });
    expect(first.body.groups).toHaveLength(25);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    expect(await order({})).toEqual(ids);
    expect(await order({ dir: "desc" })).toEqual([...ids].reverse());
    // All tied: id order, descending by default.
    expect(await order({ sort: "matches" })).toEqual([...ids].reverse());
    expect(await order({ sort: "players", dir: "asc" })).toEqual(ids);
    // Three created dates, ties by id within each.
    const byCreated = [3, 2, 1].flatMap((d) =>
      ids.filter((_, i) => ((i + 1) % 3) + 1 === d).reverse(),
    );
    expect(await order({ sort: "created" })).toEqual(byCreated);
  });

  it("rejects malformed cursors and cursors from another sort", async () => {
    await fixture("cx", "cursor test");
    for (let i = 0; i < 25; i++) await fixture(`cy${String(i)}`, "cursor test");
    const { body } = await list({ q: "cursor" });
    const cursor = body.nextCursor ?? "";
    expect(cursor).not.toBe("");
    expect((await list({ q: "cursor", cursor })).status).toBe(200);
    for (const params of [
      { cursor: "not-a-cursor" },
      { cursor, sort: "matches" },
      { cursor, dir: "desc" },
    ] as Record<string, string>[]) {
      expect(
        (await list({ q: "cursor", ...params })).status,
        JSON.stringify(params),
      ).toBe(400);
    }
  });
});

describe(
  "VIS-013: site admins can hide a group from the index",
  { tags: ["VIS-013"] },
  () => {
    it("only site admins can hide; hidden groups stay viewable", async () => {
      const ownerUser = await seedUser();
      const owner = await signIn(ownerUser.id);
      const { group } = await seedGroup(
        { id: ownerUser.id, name: "Owner" },
        { name: "Hideable", visibility: "public" },
      );
      await fixture("hx", "Hideable sibling");
      await db.insert(matches).values({
        id: newId(),
        groupId: group.id,
        playedAt: day(1),
        teams: [],
        createdAt: day(1),
        updatedAt: day(1),
      });
      const admin = await signIn((await seedUser({ isSiteAdmin: true })).id);
      const hide = (session: string, hiddenFromIndex: boolean, extra = {}) =>
        api(`/api/groups/${group.id}`, {
          method: "PATCH",
          session,
          json: { hiddenFromIndex, ...extra },
        });
      const listed = async () =>
        (await list({ q: "hideable" })).body.groups.map((g) => g.id);
      const snapshot = async (session?: string) =>
        (await api(`/api/groups/${group.id}`, { session })).json<{
          hiddenFromIndex?: boolean;
        }>();

      expect(await listed()).toEqual([group.id, "hx"]);
      expect((await hide(owner, true)).status).toBe(403);
      // Resending the current value (a full settings form) is fine.
      expect((await hide(owner, false, { description: "Ours" })).status).toBe(
        200,
      );
      expect((await snapshot(owner)).hiddenFromIndex).toBe(false);

      expect((await hide(admin, true)).status).toBe(200);
      expect(await listed()).toEqual(["hx"]);
      expect((await snapshot(owner)).hiddenFromIndex).toBe(true);
      expect(await snapshot()).not.toHaveProperty("hiddenFromIndex");
      expect((await api(`/api/groups/${group.id}`)).status).toBe(200);

      expect((await hide(owner, false)).status).toBe(403);
      expect((await hide(admin, false)).status).toBe(200);
      expect(await listed()).toEqual([group.id, "hx"]);

      const audit = await db.query.auditEvents.findMany({
        where: (t, { and, eq }) =>
          and(eq(t.groupId, group.id), eq(t.action, "group.updated")),
      });
      expect(audit.map((e) => e.after)).toEqual([
        { description: "Ours" },
        { hiddenFromIndex: true },
        { hiddenFromIndex: false },
      ]);
    });
  },
);

describe("index paging details", { tags: ["VIS-010", "VIS-012"] }, () => {
  it("pages by latest match without repeats or skips", async () => {
    for (let i = 0; i < 30; i++)
      await fixture(newId(), `latest ${String(i).padStart(2, "0")}`, {
        played: [1 + (i % 7)],
      });
    const seen = await walk({ q: "latest", sort: "played" });
    expect(seen).toHaveLength(30);
    expect(new Set(seen.map((g) => g.id)).size).toBe(30);
    const times = seen.map((g) => g.lastPlayedAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("uses URL-safe cursors that survive the round trip", async () => {
    // Names whose cursors encode to "+" and "/" in plain base64.
    for (let i = 0; i < 27; i++)
      await fixture(newId(), `cursor ?>?~ ${String(i).padStart(2, "0")}`);
    const first = await list({ q: "cursor ?>?~" });
    expect(first.body.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await walk({ q: "cursor ?>?~" })).toHaveLength(27);
  });

  it("lists without a search", async () => {
    await fixture(newId(), "unsearched");
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.groups.length).toBeGreaterThan(0);
  });

  it("has no next page with exactly one page of groups", async () => {
    for (let i = 0; i < 25; i++)
      await fixture(newId(), `exact ${String(i).padStart(2, "0")}`);
    const { body } = await list({ q: "exact" });
    expect(body.groups).toHaveLength(25);
    expect(body.nextCursor).toBeNull();
  });

  it("rejects a cursor from the other direction, with a code", async () => {
    for (let i = 0; i < 26; i++)
      await fixture(newId(), `direction ${String(i).padStart(2, "0")}`);
    const { body } = await list({ q: "direction" });
    const res = await request(
      `/api/public-groups?q=direction&dir=desc&cursor=${body.nextCursor ?? ""}`,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "bad_cursor" } });
  });
});
