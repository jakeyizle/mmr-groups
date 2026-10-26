import { newId, type Role } from "@mmr/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, seedUser, signIn } from "../../test/helpers";
import { auditEvents, matches, players } from "../db/schema";

async function group(overrides: Record<string, unknown> = {}) {
  const user = await seedUser();
  const session = await signIn(user.id);
  const res = await api("/api/groups", {
    method: "POST",
    session,
    json: {
      name: "G",
      teamFormat: { kind: "flexible" },
      playerName: "Owner",
      ...overrides,
    },
  });
  const { id, playerId } = await res.json<{ id: string; playerId: string }>();
  return { groupId: id, ownerSession: session, ownerPlayerId: playerId };
}

async function member(groupId: string, role: Role, { linked = true } = {}) {
  const user = linked ? await seedUser() : null;
  const id = newId();
  await db.insert(players).values({
    id,
    groupId,
    displayName: `P ${id.slice(-6)}`,
    role,
    userId: user?.id ?? null,
    createdAt: new Date().toISOString(),
  });
  return {
    playerId: id,
    userId: user?.id,
    session: user ? await signIn(user.id) : undefined,
  };
}

const add = (
  groupId: string,
  session: string | undefined,
  list: { name: string; role?: string }[],
) =>
  api(`/api/groups/${groupId}/players`, {
    method: "POST",
    session,
    json: { players: list },
  });
const patch = (
  groupId: string,
  pid: string,
  session: string | undefined,
  json: unknown,
) =>
  api(`/api/groups/${groupId}/players/${pid}`, {
    method: "PATCH",
    session,
    json,
  });
const remove = (groupId: string, pid: string, session: string | undefined) =>
  api(`/api/groups/${groupId}/players/${pid}`, { method: "DELETE", session });
const unlink = (groupId: string, pid: string, session: string | undefined) =>
  api(`/api/groups/${groupId}/players/${pid}/unlink`, {
    method: "POST",
    session,
    json: {},
  });

const player = (id: string) =>
  db.query.players.findFirst({ where: eq(players.id, id) });
const names = async (groupId: string) =>
  (await db.select().from(players).where(eq(players.groupId, groupId)))
    .map((p) => p.displayName)
    .sort();

async function matchWith(groupId: string, playerIds: string[]) {
  const now = new Date().toISOString();
  const id = newId();
  await db.insert(matches).values({
    id,
    groupId,
    playedAt: now,
    teams: playerIds.map((pid, i) => ({
      playerIds: [pid],
      score: null,
      rank: i + 1,
    })),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

describe(
  "PLAYER-001: admins can add players without accounts",
  { tags: ["PLAYER-001", "ROLE-011"] },
  () => {
    it("adds Dave and Sue unclaimed, with an audit event each", async () => {
      const { groupId } = await group();
      const admin = await member(groupId, "admin");
      const res = await add(groupId, admin.session, [
        { name: "Dave" },
        { name: "Sue" },
      ]);
      expect(res.status).toBe(201);
      const { players: added } = await res.json<{
        players: { id: string; linked: boolean }[];
      }>();
      expect(added.map((p) => p.linked)).toEqual([false, false]);
      expect(await names(groupId)).toEqual(
        expect.arrayContaining(["Dave", "Sue"]),
      );
      expect(
        await db.$count(
          auditEvents,
          and(
            eq(auditEvents.groupId, groupId),
            eq(auditEvents.action, "player.created"),
          ),
        ),
      ).toBe(3); // owner + Dave + Sue
    });

    it("forbids a recorder", { tags: ["ROLE-009"] }, async () => {
      const { groupId } = await group();
      const recorder = await member(groupId, "recorder");
      expect(
        (await add(groupId, recorder.session, [{ name: "Eve" }])).status,
      ).toBe(403);
    });
  },
);

describe(
  "PLAYER-002: new players get the group's default role",
  { tags: ["PLAYER-002"] },
  () => {
    it.each(["recorder", "viewer"] as const)(
      "defaults to %s",
      async (defaultRole) => {
        const { groupId, ownerSession } = await group({ defaultRole });
        const res = await add(groupId, ownerSession, [{ name: "Dave" }]);
        const {
          players: [dave],
        } = await res.json<{ players: { role: Role }[] }>();
        expect(dave?.role).toBe(defaultRole);
      },
    );
  },
);

describe(
  "PLAYER-003: admins can pre-assign roles to unclaimed players",
  { tags: ["PLAYER-003"] },
  () => {
    it("sets unclaimed Sue to viewer, on add or later", async () => {
      const { groupId } = await group();
      const admin = await member(groupId, "admin");
      const res = await add(groupId, admin.session, [
        { name: "Sue", role: "viewer" },
      ]);
      const {
        players: [sue],
      } = await res.json<{ players: { id: string; role: Role }[] }>();
      expect(sue?.role).toBe("viewer");
      const later = await member(groupId, "viewer", { linked: false });
      expect(
        (
          await patch(groupId, later.playerId, admin.session, {
            role: "recorder",
          })
        ).status,
      ).toBe(200);
      expect((await player(later.playerId))?.role).toBe("recorder");
      // Claiming (M4) keeps the stored role.
    });

    it("can't add a player as admin or owner", async () => {
      const { groupId, ownerSession } = await group();
      for (const role of ["admin", "owner"]) {
        expect(
          (await add(groupId, ownerSession, [{ name: "X", role }])).status,
        ).toBe(400);
      }
    });
  },
);

describe(
  "PLAYER-004: player names are unique within a group",
  { tags: ["PLAYER-004"] },
  () => {
    it("rejects adding or renaming to a name taken case-insensitively", async () => {
      const { groupId, ownerSession } = await group();
      await add(groupId, ownerSession, [{ name: "Dave" }]);
      const added = await add(groupId, ownerSession, [{ name: "dave" }]);
      expect(added.status).toBe(409);
      expect(await added.json()).toMatchObject({
        error: { code: "name_taken" },
      });

      const sue = await member(groupId, "recorder", { linked: false });
      const renamed = await patch(groupId, sue.playerId, ownerSession, {
        displayName: "DAVE",
      });
      expect(renamed.status).toBe(409);
    });

    it("rejects a batch with duplicate names, adding none of it", async () => {
      const { groupId, ownerSession } = await group();
      const res = await add(groupId, ownerSession, [
        { name: "Ann" },
        { name: "Bob" },
        { name: "ann" },
      ]);
      expect(res.status).toBe(409);
      expect(await names(groupId)).toEqual(["Owner"]);
    });

    it("allows the same name in another group", async () => {
      const a = await group();
      const b = await group();
      await add(a.groupId, a.ownerSession, [{ name: "Dave" }]);
      expect(
        (await add(b.groupId, b.ownerSession, [{ name: "Dave" }])).status,
      ).toBe(201);
    });
  },
);

describe(
  "PLAYER-010: player names are limited in length",
  { tags: ["PLAYER-010"] },
  () => {
    it.each(["", "  ", "x".repeat(41)])(
      "rejects %j on add and rename",
      async (name) => {
        const { groupId, ownerSession } = await group();
        expect((await add(groupId, ownerSession, [{ name }])).status).toBe(400);
        const sue = await member(groupId, "recorder", { linked: false });
        expect(
          (
            await patch(groupId, sue.playerId, ownerSession, {
              displayName: name,
            })
          ).status,
        ).toBe(400);
      },
    );
  },
);

describe(
  "PLAYER-005: renaming a player keeps their history",
  { tags: ["PLAYER-005"] },
  () => {
    it("keeps the player ID, so matches (and ratings) follow the new name", async () => {
      const { groupId, ownerSession, ownerPlayerId } = await group();
      const davd = await member(groupId, "recorder", { linked: false });
      const matchId = await matchWith(groupId, [davd.playerId, ownerPlayerId]);
      const before = await db.query.matches.findFirst({
        where: eq(matches.id, matchId),
      });

      expect(
        (
          await patch(groupId, davd.playerId, ownerSession, {
            displayName: "Dave",
          })
        ).status,
      ).toBe(200);
      expect((await player(davd.playerId))?.displayName).toBe("Dave");
      expect(
        await db.query.matches.findFirst({ where: eq(matches.id, matchId) }),
      ).toEqual(before);
    });
  },
);

describe(
  "PLAYER-006: players without matches can be removed",
  { tags: ["PLAYER-006"] },
  () => {
    it("deletes the player", async () => {
      const { groupId, ownerSession } = await group();
      const sue = await member(groupId, "recorder", { linked: false });
      expect((await remove(groupId, sue.playerId, ownerSession)).status).toBe(
        200,
      );
      expect(await player(sue.playerId)).toBeUndefined();
    });
  },
);

describe(
  "PLAYER-007: players with matches cannot be removed",
  { tags: ["PLAYER-007"] },
  () => {
    it("rejects with an explanation and keeps the player", async () => {
      const { groupId, ownerSession, ownerPlayerId } = await group();
      const dave = await member(groupId, "recorder", { linked: false });
      await matchWith(groupId, [ownerPlayerId, dave.playerId]);
      const res = await remove(groupId, dave.playerId, ownerSession);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: {
          code: "has_matches",
          message: expect.stringMatching(/rename/i) as unknown,
        },
      });
      expect(await player(dave.playerId)).toBeDefined();
    });
  },
);

describe(
  "PLAYER-008: admins can unlink a non-admin player",
  { tags: ["PLAYER-008"] },
  () => {
    it("makes Dave unclaimed, keeping role and history; the user is no longer a member", async () => {
      const { groupId, ownerPlayerId } = await group();
      const admin = await member(groupId, "admin");
      const dave = await member(groupId, "recorder");
      await matchWith(groupId, [dave.playerId, ownerPlayerId]);

      const res = await unlink(groupId, dave.playerId, admin.session);
      expect(res.status).toBe(200);
      expect(await player(dave.playerId)).toMatchObject({
        userId: null,
        role: "recorder",
      });
      const list = await (
        await api("/api/groups", { session: dave.session })
      ).json<{ groups: unknown[] }>();
      expect(list.groups).toEqual([]);
    });
  },
);

describe(
  "PLAYER-011: only the owner can unlink an admin",
  { tags: ["PLAYER-011"] },
  () => {
    it("rejects another admin; the owner succeeds and the role resets to the default", async () => {
      const { groupId, ownerSession } = await group({ defaultRole: "viewer" });
      const ann = await member(groupId, "admin");
      const other = await member(groupId, "admin");
      expect((await unlink(groupId, ann.playerId, other.session)).status).toBe(
        403,
      );
      expect((await unlink(groupId, ann.playerId, ownerSession)).status).toBe(
        200,
      );
      expect(await player(ann.playerId)).toMatchObject({
        userId: null,
        role: "viewer",
      });
    });
  },
);

describe(
  "PLAYER-012: the owner cannot be unlinked",
  { tags: ["PLAYER-012"] },
  () => {
    it("rejects the owner and a site admin alike", async () => {
      const { groupId, ownerSession, ownerPlayerId } = await group();
      const siteAdmin = await signIn(
        (await seedUser({ isSiteAdmin: true })).id,
      );
      for (const session of [ownerSession, siteAdmin]) {
        expect((await unlink(groupId, ownerPlayerId, session)).status).toBe(
          403,
        );
      }
      expect((await player(ownerPlayerId))?.userId).not.toBeNull();
    });
  },
);

describe(
  "PLAYER-013: a group has at most 200 players",
  { tags: ["PLAYER-013"] },
  () => {
    it("rejects the 201st player, and a batch that would overflow, all-or-nothing", async () => {
      const { groupId, ownerSession } = await group();
      // Owner + 199 = 200
      const now = new Date().toISOString();
      const rows = Array.from({ length: 199 }, (_, i) => ({
        id: newId(),
        groupId,
        displayName: `Seed ${String(i)}`,
        role: "viewer" as const,
        createdAt: now,
      }));
      for (let i = 0; i < rows.length; i += 15) {
        await db.insert(players).values(rows.slice(i, i + 15)); // ≤ 100 bound params per statement
      }
      const res = await add(groupId, ownerSession, [{ name: "One more" }]);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: { code: "player_limit" },
      });

      await db.delete(players).where(eq(players.id, rows[0]?.id ?? ""));
      const overflow = await add(groupId, ownerSession, [
        { name: "A" },
        { name: "B" },
      ]);
      expect(overflow.status).toBe(409);
      expect(await db.$count(players, eq(players.groupId, groupId))).toBe(199);
      expect((await add(groupId, ownerSession, [{ name: "A" }])).status).toBe(
        201,
      );
    });
  },
);

describe(
  "ROLE-005: only the owner can grant or revoke admin",
  { tags: ["ROLE-005", "ROLE-009"] },
  () => {
    it("rejects an admin making Dave an admin; the owner succeeds", async () => {
      const { groupId, ownerSession } = await group();
      const admin = await member(groupId, "admin");
      const dave = await member(groupId, "recorder");
      expect(
        (await patch(groupId, dave.playerId, admin.session, { role: "admin" }))
          .status,
      ).toBe(403);
      expect(
        (await patch(groupId, dave.playerId, ownerSession, { role: "admin" }))
          .status,
      ).toBe(200);
      expect((await player(dave.playerId))?.role).toBe("admin");
      expect(
        (await patch(groupId, dave.playerId, admin.session, { role: "viewer" }))
          .status,
      ).toBe(403);
    });
  },
);

describe(
  "ROLE-014: unclaimed players cannot be admins",
  { tags: ["ROLE-014"] },
  () => {
    it("rejects the owner making unclaimed Sue an admin", async () => {
      const { groupId, ownerSession } = await group();
      const sue = await member(groupId, "recorder", { linked: false });
      expect(
        (await patch(groupId, sue.playerId, ownerSession, { role: "admin" }))
          .status,
      ).toBe(400);
      expect((await player(sue.playerId))?.role).toBe("recorder");
    });
  },
);

describe(
  "ROLE-007: role editing never touches ownership",
  { tags: ["ROLE-007"] },
  () => {
    it("rejects assigning owner or changing the owner's role", async () => {
      const { groupId, ownerSession, ownerPlayerId } = await group();
      const dave = await member(groupId, "admin");
      expect(
        (await patch(groupId, dave.playerId, ownerSession, { role: "owner" }))
          .status,
      ).toBe(403);
      expect(
        (await patch(groupId, ownerPlayerId, ownerSession, { role: "admin" }))
          .status,
      ).toBe(403);
      expect((await remove(groupId, ownerPlayerId, ownerSession)).status).toBe(
        403,
      );
    });
  },
);
