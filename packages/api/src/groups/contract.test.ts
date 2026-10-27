import { newId } from "@mmr/core";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  api,
  db,
  request,
  seedGroup,
  seedUser,
  signIn,
} from "../../test/helpers";
import { auditEvents, matches, players } from "../db/schema";
import { AUDIT_PAGE_SIZE } from "./audit";
import { MAX_PLAYERS } from "./players";

// The API's contract beyond status codes: error codes, response bodies, and the
// audit rows each change writes (PLAN §8, AUDIT-001/002).

type Role = "owner" | "admin" | "recorder" | "viewer";

async function addPlayer(
  groupId: string,
  displayName: string,
  role: Role = "recorder",
  userId: string | null = null,
) {
  const id = newId();
  await db.insert(players).values({
    id,
    groupId,
    displayName,
    role,
    userId,
    createdAt: new Date().toISOString(),
  });
  return id;
}

/** A user with a session and a player in `groupId`. */
async function member(groupId: string, role: Role, name: string = role) {
  const user = await seedUser({ name });
  const playerId = await addPlayer(groupId, name, role, user.id);
  return { user, playerId, session: await signIn(user.id) };
}

async function setup(overrides: Parameters<typeof seedGroup>[1] = {}) {
  const owner = await seedUser({ name: "Olive" });
  const { group, ownerPlayer } = await seedGroup(owner, overrides);
  return {
    owner,
    gid: group.id,
    ownerPlayerId: ownerPlayer?.id ?? "",
    session: await signIn(owner.id),
  };
}

/** Audit rows for a group, oldest first, as stored. */
async function trail(groupId: string) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.groupId, groupId))
    .orderBy(asc(auditEvents.id));
  return rows.map((r) => ({
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    actorUserId: r.actorUserId,
    before: r.before,
    after: r.after,
  }));
}

async function expectError(
  res: Response,
  status: number,
  code: string,
): Promise<{ error: { details?: unknown } }> {
  expect(res.status).toBe(status);
  const body = await res.json<{ error: { code: string; details?: unknown } }>();
  expect(body.error.code).toBe(code);
  return body;
}

describe("access", { tags: ["VIS-002", "ROLE-009"] }, () => {
  it("answers not_found for missing and private groups, forbidden for disallowed actions", async () => {
    const { gid } = await setup();
    const outsider = await signIn((await seedUser()).id);
    await expectError(await api(`/api/groups/${newId()}`), 404, "not_found");
    await expectError(
      await api(`/api/groups/${gid}`, { session: outsider }),
      404,
      "not_found",
    );
    const viewer = await member(gid, "viewer");
    await expectError(
      await api(`/api/groups/${gid}`, {
        method: "DELETE",
        session: viewer.session,
      }),
      403,
      "forbidden",
    );
  });
});

describe(
  "group routes",
  { tags: ["GROUP-001", "GROUP-005", "GROUP-007", "GROUP-008", "GROUP-009"] },
  () => {
    it("audits creation as the creator", async () => {
      const user = await seedUser();
      const res = await api("/api/groups", {
        method: "POST",
        session: await signIn(user.id),
        json: {
          name: "Padel",
          playerName: "Ann",
          teamFormat: { kind: "fixed", teams: 2, size: 2 },
        },
      });
      const { id, playerId } = await res.json<{
        id: string;
        playerId: string;
      }>();
      expect(await trail(id)).toEqual([
        {
          action: "group.created",
          entityType: "group",
          entityId: id,
          actorUserId: user.id,
          before: null,
          after: expect.objectContaining({ name: "Padel" }) as unknown,
        },
        {
          action: "player.created",
          entityType: "player",
          entityId: playerId,
          actorUserId: user.id,
          before: null,
          after: { displayName: "Ann", role: "owner" },
        },
      ]);
    });

    it("lists nothing for signed-out visitors", async () => {
      expect(await (await api("/api/groups")).json()).toEqual({ groups: [] });
    });

    it("returns the unchanged group for a no-op update, without an audit row", async () => {
      const { gid, session } = await setup({ name: "Same" });
      const res = await api(`/api/groups/${gid}`, {
        method: "PATCH",
        session,
        json: { name: "Same" },
      });
      expect((await res.json<{ group: { name: string } }>()).group.name).toBe(
        "Same",
      );
      expect(await trail(gid)).toEqual([]);
    });

    it("audits settings changes as the editor and returns the updated group", async () => {
      const { gid, session, owner } = await setup({ name: "Old" });
      const res = await api(`/api/groups/${gid}`, {
        method: "PATCH",
        session,
        json: { name: "New", allowTies: true },
      });
      expect(await res.json()).toMatchObject({
        group: { id: gid, name: "New", allowTies: true },
      });
      expect(await trail(gid)).toEqual([
        {
          action: "group.updated",
          entityType: "group",
          entityId: gid,
          actorUserId: owner.id,
          before: { name: "Old", allowTies: false },
          after: { name: "New", allowTies: true },
        },
      ]);
    });

    it(
      "keeps the index flag to site admins",
      { tags: ["VIS-013"] },
      async () => {
        const { gid, session } = await setup();
        await expectError(
          await api(`/api/groups/${gid}`, {
            method: "PATCH",
            session,
            json: { hiddenFromIndex: true },
          }),
          403,
          "forbidden",
        );
      },
    );

    it("answers ok when deleted", async () => {
      const { gid, session } = await setup();
      expect(
        await (
          await api(`/api/groups/${gid}`, { method: "DELETE", session })
        ).json(),
      ).toEqual({ ok: true });
    });

    it("explains failed transfers", async () => {
      const { gid, session, ownerPlayerId } = await setup();
      const transfer = (playerId: string) =>
        api(`/api/groups/${gid}/transfer`, {
          method: "POST",
          session,
          json: { playerId },
        });
      await expectError(await transfer(newId()), 404, "not_found");
      await expectError(
        await transfer(await addPlayer(gid, "Unclaimed")),
        400,
        "not_linked",
      );
      await expectError(await transfer(ownerPlayerId), 400, "already_owner");
    });

    it("explains a transfer in a group without an owner", async () => {
      // Like the demo group: run by site admins.
      const { group } = await seedGroup(undefined);
      const admin = await seedUser({ isSiteAdmin: true });
      const linked = await addPlayer(
        group.id,
        "Linked",
        "recorder",
        (await seedUser()).id,
      );
      await expectError(
        await api(`/api/groups/${group.id}/transfer`, {
          method: "POST",
          session: await signIn(admin.id),
          json: { playerId: linked },
        }),
        400,
        "no_owner",
      );
    });

    it("audits both role changes of a transfer as the old owner", async () => {
      const { gid, session, owner, ownerPlayerId } = await setup();
      const next = await member(gid, "recorder", "Rita");
      const res = await api(`/api/groups/${gid}/transfer`, {
        method: "POST",
        session,
        json: { playerId: next.playerId },
      });
      expect(await res.json()).toEqual({ ok: true });
      const audit = (entityId: string, from: Role, to: Role) => ({
        action: "player.roleChanged",
        entityType: "player",
        entityId,
        actorUserId: owner.id,
        before: { role: from },
        after: { role: to },
      });
      expect(await trail(gid)).toEqual([
        audit(ownerPlayerId, "owner", "admin"),
        audit(next.playerId, "recorder", "owner"),
      ]);
    });
  },
);

describe(
  "player routes",
  {
    tags: [
      "PLAYER-001",
      "PLAYER-005",
      "PLAYER-006",
      "PLAYER-007",
      "PLAYER-008",
      "ROLE-005",
    ],
  },
  () => {
    it("audits each added player as the admin", async () => {
      const { gid, session, owner } = await setup();
      const res = await api(`/api/groups/${gid}/players`, {
        method: "POST",
        session,
        json: { players: [{ name: "Dee" }, { name: "Eve", role: "viewer" }] },
      });
      const { players: added } = await res.json<{
        players: { id: string }[];
      }>();
      expect(await trail(gid)).toEqual(
        [
          [added[0]?.id, { displayName: "Dee", role: "recorder" }],
          [added[1]?.id, { displayName: "Eve", role: "viewer" }],
        ].map(([entityId, after]) => ({
          action: "player.created",
          entityType: "player",
          entityId,
          actorUserId: owner.id,
          before: null,
          after,
        })),
      );
    });

    it("explains taken names and full groups", async () => {
      const { gid, session } = await setup();
      await addPlayer(gid, "Dee");
      const add = (names: string[]) =>
        api(`/api/groups/${gid}/players`, {
          method: "POST",
          session,
          json: { players: names.map((name) => ({ name })) },
        });
      await expectError(await add(["Dee"]), 409, "name_taken");
      // 2 players so far: fill up to the limit, then one more.
      const fill = Array.from(
        { length: MAX_PLAYERS - 2 },
        (_, i) => `P${String(i)}`,
      );
      for (let i = 0; i < fill.length; i += 50)
        expect((await add(fill.slice(i, i + 50))).status).toBe(201);
      await expectError(await add(["One too many"]), 409, "player_limit");
    });

    it("explains rejected updates", async () => {
      const { gid, session } = await setup();
      const unclaimed = await addPlayer(gid, "Una");
      const patch = (pid: string, json: object, s = session) =>
        api(`/api/groups/${gid}/players/${pid}`, {
          method: "PATCH",
          session: s,
          json,
        });
      await expectError(
        await patch(newId(), { displayName: "X" }),
        404,
        "not_found",
      );
      await expectError(
        await patch(unclaimed, { role: "admin" }),
        400,
        "invalid_role",
      );
      await addPlayer(gid, "Taken");
      await expectError(
        await patch(unclaimed, { displayName: "Taken" }),
        409,
        "name_taken",
      );
      const recorder = await member(gid, "recorder");
      await expectError(
        await patch(unclaimed, { displayName: "Y" }, recorder.session),
        403,
        "forbidden",
      );
      await expectError(
        await patch(unclaimed, { role: "viewer" }, recorder.session),
        403,
        "forbidden",
      );
    });

    it("returns the player unchanged for a no-op update", async () => {
      const { gid, session } = await setup();
      const pid = await addPlayer(gid, "Una", "viewer");
      const res = await api(`/api/groups/${gid}/players/${pid}`, {
        method: "PATCH",
        session,
        json: { displayName: "Una", role: "viewer" },
      });
      expect(await res.json()).toEqual({
        player: { id: pid, displayName: "Una", role: "viewer", linked: false },
      });
      expect(await trail(gid)).toEqual([]);
    });

    it("audits renames and role changes as the admin", async () => {
      const { gid, session, owner } = await setup();
      const pid = await addPlayer(gid, "Una", "viewer");
      const res = await api(`/api/groups/${gid}/players/${pid}`, {
        method: "PATCH",
        session,
        json: { displayName: "Uma", role: "recorder" },
      });
      expect(await res.json()).toEqual({
        player: {
          id: pid,
          displayName: "Uma",
          role: "recorder",
          linked: false,
        },
      });
      expect(await trail(gid)).toEqual([
        {
          action: "player.updated",
          entityType: "player",
          entityId: pid,
          actorUserId: owner.id,
          before: { displayName: "Una", role: "viewer" },
          after: { displayName: "Uma", role: "recorder" },
        },
      ]);
    });

    it("explains rejected removals, and audits a removal", async () => {
      const { gid, session, owner } = await setup();
      const remove = (pid: string, s = session) =>
        api(`/api/groups/${gid}/players/${pid}`, {
          method: "DELETE",
          session: s,
        });
      await expectError(await remove(newId()), 404, "not_found");
      const admin = await member(gid, "admin");
      const otherAdmin = await member(gid, "admin", "Adele");
      await expectError(
        await remove(otherAdmin.playerId, admin.session),
        403,
        "forbidden",
      );
      // An unclaimed player can be removed by an admin.
      const una = await addPlayer(gid, "Una");
      expect((await remove(una, admin.session)).status).toBe(200);

      const played = await addPlayer(gid, "Pat");
      const now = new Date().toISOString();
      await db.insert(matches).values({
        id: newId(),
        groupId: gid,
        playedAt: now,
        teams: [{ playerIds: [played], score: null, rank: 1 }],
        createdAt: now,
        updatedAt: now,
      });
      await expectError(await remove(played), 409, "has_matches");

      const gone = await addPlayer(gid, "Gus", "viewer");
      expect(await (await remove(gone)).json()).toEqual({ ok: true });
      expect((await trail(gid)).at(-1)).toEqual({
        action: "player.deleted",
        entityType: "player",
        entityId: gone,
        actorUserId: owner.id,
        before: { id: gone, displayName: "Gus", role: "viewer", linked: false },
        after: null,
      });
    });

    it("explains rejected unlinks, and audits an unlink", async () => {
      const { gid, session, owner, ownerPlayerId } = await setup();
      const unlink = (pid: string, s = session) =>
        api(`/api/groups/${gid}/players/${pid}/unlink`, {
          method: "POST",
          session: s,
        });
      await expectError(await unlink(newId()), 404, "not_found");
      await expectError(await unlink(ownerPlayerId), 403, "forbidden");
      await expectError(
        await unlink(await addPlayer(gid, "Una")),
        400,
        "not_linked",
      );
      const admin = await member(gid, "admin", "Adam");
      const res = await unlink(admin.playerId);
      // An unclaimed admin falls back to the default role.
      expect(await res.json()).toEqual({
        player: {
          id: admin.playerId,
          displayName: "Adam",
          role: "recorder",
          linked: false,
        },
      });
      expect((await trail(gid)).at(-1)).toEqual({
        action: "player.unlinked",
        entityType: "player",
        entityId: admin.playerId,
        actorUserId: owner.id,
        before: { linked: true, role: "admin" },
        after: { linked: false, role: "recorder" },
      });
    });
  },
);

describe(
  "match routes",
  { tags: ["MATCH-001", "MATCH-003", "EDIT-007", "EDIT-010", "AUDIT-007"] },
  () => {
    const singles = {
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
    } as const;
    const playedAt = "2026-01-05T18:00:00.000Z";

    async function withMatch() {
      const ctx = await setup(singles);
      const b = await addPlayer(ctx.gid, "Bob");
      const res = await api(`/api/groups/${ctx.gid}/matches`, {
        method: "POST",
        session: ctx.session,
        json: {
          matches: [
            {
              playedAt,
              teams: [
                { playerIds: [ctx.ownerPlayerId], rank: 1 },
                { playerIds: [b], rank: 2 },
              ],
            },
          ],
        },
      });
      const body = await res.json<{
        matches: { id: string; recordedByPlayerId: string }[];
      }>();
      return { ...ctx, b, res, mid: body.matches[0]?.id ?? "", body };
    }

    it("records who recorded it, and audits each match as the recorder", async () => {
      const { res, body, ownerPlayerId, gid, owner, mid, b } =
        await withMatch();
      expect(res.status).toBe(201);
      expect(body.matches[0]?.recordedByPlayerId).toBe(ownerPlayerId);
      expect(await trail(gid)).toEqual([
        {
          action: "match.created",
          entityType: "match",
          entityId: mid,
          actorUserId: owner.id,
          before: null,
          after: {
            playedAt,
            notes: "",
            teams: [
              { playerIds: [ownerPlayerId], rank: 1, score: null },
              { playerIds: [b], rank: 2, score: null },
            ],
          },
        },
      ]);
    });

    it(
      "records no recorder for a site admin outside the group",
      { tags: ["ROLE-010"] },
      async () => {
        const { gid, ownerPlayerId } = await setup(singles);
        const b = await addPlayer(gid, "Bob");
        const admin = await seedUser({ isSiteAdmin: true });
        const res = await api(`/api/groups/${gid}/matches`, {
          method: "POST",
          session: await signIn(admin.id),
          json: {
            matches: [
              {
                playedAt,
                teams: [
                  { playerIds: [ownerPlayerId], rank: 1 },
                  { playerIds: [b], rank: 2 },
                ],
              },
            ],
          },
        });
        expect(
          (
            await res.json<{
              matches: { recordedByPlayerId: string | null }[];
            }>()
          ).matches[0]?.recordedByPlayerId,
        ).toBeNull();
      },
    );

    it("points at unknown players", async () => {
      const { gid, session, ownerPlayerId } = await setup(singles);
      const body = await expectError(
        await api(`/api/groups/${gid}/matches`, {
          method: "POST",
          session,
          json: {
            matches: [
              {
                playedAt,
                teams: [
                  { playerIds: [ownerPlayerId], rank: 1 },
                  { playerIds: ["nobody"], rank: 2 },
                ],
              },
            ],
          },
        }),
        400,
        "invalid",
      );
      expect(body.error.details).toEqual([
        {
          path: ["matches", 0, "teams", 1, "playerIds", 0],
          code: "unknown_player",
          message: "Not a player in this group",
        },
      ]);
    });

    function fetchWith(
      method: string,
      gid: string,
      mid: string,
      session: string,
      version: string | undefined,
      json: object | undefined,
    ) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        Cookie: `session=${session}`,
      };
      if (version !== undefined) headers["If-Match"] = version;
      return request(`/api/groups/${gid}/matches/${mid}`, {
        method,
        headers,
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    }

    it.each(["PATCH", "DELETE"])(
      "%s explains missing, forbidden, unversioned and stale requests",
      async (method) => {
        const { gid, session, mid } = await withMatch();
        const json = method === "PATCH" ? { notes: "x" } : undefined;
        await expectError(
          await fetchWith(method, gid, newId(), session, '"1"', json),
          404,
          "not_found",
        );
        const viewer = await member(gid, "viewer");
        await expectError(
          await fetchWith(method, gid, mid, viewer.session, '"1"', json),
          403,
          "forbidden",
        );
        for (const bad of [undefined, "abc", '"1a"', '"a1"', '"1.0"'])
          await expectError(
            await fetchWith(method, gid, mid, session, bad, json),
            428,
            "version_required",
          );
        const stale = await expectError(
          await fetchWith(method, gid, mid, session, '"2"', json),
          412,
          "stale",
        );
        expect(stale.error.details).toMatchObject({
          match: { id: mid, version: 1 },
        });
      },
    );

    it("accepts versions with or without quotes and spaces", async () => {
      const { gid, session, mid } = await withMatch();
      expect(
        (await fetchWith("PATCH", gid, mid, session, ' "1" ', { notes: "a" }))
          .status,
      ).toBe(200);
      expect(
        (await fetchWith("PATCH", gid, mid, session, "2", { notes: "b" }))
          .status,
      ).toBe(200);
    });

    it("returns the match unchanged for a no-op edit", async () => {
      const { gid, session, mid } = await withMatch();
      const res = await fetchWith("PATCH", gid, mid, session, '"1"', {
        notes: "",
      });
      expect(await res.json()).toMatchObject({
        match: { id: mid, version: 1 },
      });
      expect((await trail(gid)).map((r) => r.action)).toEqual([
        "match.created",
      ]);
    });

    it("rejects moving a match more than a day ahead", async () => {
      const { gid, session, mid } = await withMatch();
      const res = await fetchWith("PATCH", gid, mid, session, '"1"', {
        playedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      });
      const body = await expectError(res, 400, "invalid");
      expect(body.error.details).toEqual([
        {
          path: ["playedAt"],
          code: "too_far_in_future",
          message: "Can't be more than 24 hours from now",
        },
      ]);
    });

    it("audits edits and deletions as the editor", async () => {
      const { gid, session, mid, owner, ownerPlayerId, b } = await withMatch();
      const edit = await fetchWith("PATCH", gid, mid, session, '"1"', {
        notes: "rematch",
      });
      expect(await edit.json()).toMatchObject({
        match: { id: mid, notes: "rematch", version: 2 },
      });
      const del = await fetchWith(
        "DELETE",
        gid,
        mid,
        session,
        '"2"',
        undefined,
      );
      expect(await del.json()).toEqual({ ok: true });
      const [, edited, deleted] = await trail(gid);
      expect(edited).toEqual({
        action: "match.updated",
        entityType: "match",
        entityId: mid,
        actorUserId: owner.id,
        before: { playedAt, notes: "" },
        after: { notes: "rematch" },
      });
      expect(deleted).toEqual({
        action: "match.deleted",
        entityType: "match",
        entityId: mid,
        actorUserId: owner.id,
        before: {
          playedAt,
          notes: "rematch",
          teams: [
            { playerIds: [ownerPlayerId], rank: 1, score: null },
            { playerIds: [b], rank: 2, score: null },
          ],
        },
        after: null,
      });
    });
  },
);

describe(
  "joining and leaving",
  {
    tags: [
      "JOIN-005",
      "JOIN-006",
      "JOIN-008",
      "JOIN-009",
      "JOIN-010",
      "JOIN-011",
      "JOIN-013",
      "VIS-008",
    ],
  },
  () => {
    async function invited(overrides: Parameters<typeof seedGroup>[1] = {}) {
      const ctx = await setup({ inviteCode: `code-${newId()}`, ...overrides });
      const code =
        (
          await db.query.groups.findFirst({
            where: (g, { eq: e }) => e(g.id, ctx.gid),
          })
        )?.inviteCode ?? "";
      const joiner = await seedUser({ name: "Jo" });
      const claim = (json: object, s?: string) =>
        api(`/api/invites/${code}/claim`, {
          method: "POST",
          session: s ?? joinerSession,
          json,
        });
      const joinerSession = await signIn(joiner.id);
      return { ...ctx, code, joiner, joinerSession, claim };
    }

    it("needs sign-in to see an invite", async () => {
      const { code } = await invited();
      await expectError(
        await api(`/api/invites/${code}`),
        401,
        "unauthenticated",
      );
      await expectError(
        await api(`/api/invites/nope`, {
          session: await signIn((await seedUser()).id),
        }),
        404,
        "invalid_invite",
      );
    });

    it("explains rejected claims", async () => {
      const { claim, gid } = await invited();
      await expectError(
        await api("/api/invites/nope/claim", {
          method: "POST",
          session: await signIn((await seedUser()).id),
          json: { playerId: "x" },
        }),
        404,
        "invalid_invite",
      );
      await expectError(await claim({ playerId: newId() }), 404, "not_found");
      const taken = await addPlayer(
        gid,
        "Taken",
        "recorder",
        (await seedUser()).id,
      );
      await expectError(await claim({ playerId: taken }), 409, "claim_lost");
      await expectError(
        await claim({ newPlayerName: "Taken" }),
        409,
        "name_taken",
      );
    });

    it("keeps people out of the demo group", async () => {
      const { claim } = await invited({ isDemo: true });
      await expectError(await claim({ newPlayerName: "Jo" }), 403, "demo");
    });

    it("explains a full group", async () => {
      const { claim, gid } = await invited();
      const rows = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => ({
        id: newId(),
        groupId: gid,
        displayName: `P${String(i)}`,
        role: "recorder" as const,
        createdAt: new Date().toISOString(),
      }));
      // D1 allows 100 variables per statement.
      for (let i = 0; i < rows.length; i += 10)
        await db.insert(players).values(rows.slice(i, i + 10));
      await expectError(
        await claim({ newPlayerName: "Jo" }),
        409,
        "player_limit",
      );
    });

    it("claims and joins, audited as the joiner; members just get their player", async () => {
      const { claim, gid, joiner } = await invited();
      const una = await addPlayer(gid, "Una", "viewer");
      const claimed = await claim({ playerId: una });
      expect(await claimed.json()).toEqual({ groupId: gid, playerId: una });
      const again = await claim({ newPlayerName: "Someone" });
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ groupId: gid, playerId: una });

      const other = await seedUser();
      const joined = await claim(
        { newPlayerName: "Newbie" },
        await signIn(other.id),
      );
      expect(joined.status).toBe(201);
      const { playerId } = await joined.json<{ playerId: string }>();
      expect(await trail(gid)).toEqual([
        {
          action: "player.claimed",
          entityType: "player",
          entityId: una,
          actorUserId: joiner.id,
          before: null,
          after: { linked: true, role: "viewer" },
        },
        {
          action: "player.joined",
          entityType: "player",
          entityId: playerId,
          actorUserId: other.id,
          before: null,
          after: { displayName: "Newbie", role: "recorder" },
        },
      ]);
    });

    it("explains rejected leaving, and audits leaving", async () => {
      const { gid, session } = await setup({ visibility: "public" });
      const leave = (s: string) =>
        api(`/api/groups/${gid}/leave`, { method: "POST", session: s });
      await expectError(
        await leave(await signIn((await seedUser()).id)),
        403,
        "not_member",
      );
      await expectError(await leave(session), 409, "owner_must_transfer");
      const admin = await member(gid, "admin", "Adam");
      expect(await (await leave(admin.session)).json()).toEqual({ ok: true });
      expect(await trail(gid)).toEqual([
        {
          action: "player.left",
          entityType: "player",
          entityId: admin.playerId,
          actorUserId: admin.user.id,
          before: { linked: true, role: "admin" },
          after: { linked: false, role: "recorder" },
        },
      ]);
    });
  },
);

describe(
  "invite routes",
  { tags: ["JOIN-001", "JOIN-002", "JOIN-003"] },
  () => {
    it("audits creating, replacing and revoking as the admin", async () => {
      const { gid, session, owner } = await setup();
      const invite = (method: string, json?: object) =>
        api(`/api/groups/${gid}/invite`, { method, session, json });
      await invite("PUT", { expiresInDays: null });
      await invite("PUT", {});
      await invite("DELETE");
      expect(
        (await trail(gid)).map((r) => [
          r.action,
          r.entityType,
          r.entityId,
          r.actorUserId,
        ]),
      ).toEqual([
        ["invite.created", "group", gid, owner.id],
        ["invite.regenerated", "group", gid, owner.id],
        ["invite.revoked", "group", gid, owner.id],
      ]);
    });
  },
);

describe("audit paging", { tags: ["AUDIT-004"] }, () => {
  it("has no next page when exactly one page of events exists", async () => {
    const { gid, session, owner } = await setup();
    const rows = Array.from({ length: AUDIT_PAGE_SIZE }, () => ({
      id: newId(),
      groupId: gid,
      actorUserId: owner.id,
      action: "group.updated",
      entityType: "group",
      entityId: gid,
      createdAt: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 10)
      await db.insert(auditEvents).values(rows.slice(i, i + 10));
    const page = await (
      await api(`/api/groups/${gid}/audit`, { session })
    ).json<{
      events: unknown[];
      nextCursor: string | null;
    }>();
    expect(page.events).toHaveLength(AUDIT_PAGE_SIZE);
    expect(page.nextCursor).toBeNull();
  });
});
