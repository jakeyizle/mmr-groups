import { newId, type Role } from "@mmr/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, seedUser, signIn } from "../../test/helpers";
import { auditEvents, groups, matches, players } from "../db/schema";

const pickleball = {
  name: "Pickleball",
  teamFormat: { kind: "fixed", teams: 2, size: 2 },
  playerName: "Alice",
};

async function owner() {
  const user = await seedUser({ name: "Alice" });
  const session = await signIn(user.id);
  const res = await api("/api/groups", {
    method: "POST",
    session,
    json: pickleball,
  });
  const { id, playerId } = await res.json<{ id: string; playerId: string }>();
  return { user, session, groupId: id, playerId };
}

/** A member with `role`, linked to a fresh user unless `linked: false`. */
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
  return { playerId: id, session: user ? await signIn(user.id) : undefined };
}

const getGroup = (groupId: string) =>
  db.query.groups.findFirst({ where: eq(groups.id, groupId) });
const roleOf = async (playerId: string) =>
  (await db.query.players.findFirst({ where: eq(players.id, playerId) }))?.role;

describe(
  "GROUP-001: creating a group makes the creator its owner",
  { tags: ["GROUP-001"] },
  () => {
    it("creates the group with the settings and an owner player linked to the user", async () => {
      const { user, groupId, playerId } = await owner();
      expect(await getGroup(groupId)).toMatchObject({
        name: "Pickleball",
        teamFormat: { kind: "fixed", teams: 2, size: 2 },
        version: 1,
      });
      expect(
        await db.query.players.findFirst({ where: eq(players.id, playerId) }),
      ).toMatchObject({
        groupId,
        displayName: "Alice",
        role: "owner",
        userId: user.id,
      });
      expect(
        (
          await db
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.groupId, groupId))
        ).map((a) => a.action),
      ).toEqual(["group.created", "player.created"]);
    });
  },
);

describe("GROUP-002: group defaults", { tags: ["GROUP-002"] }, () => {
  it("is private, optional scoring, no ties, recorder default role", async () => {
    const { groupId } = await owner();
    expect(await getGroup(groupId)).toMatchObject({
      visibility: "private",
      scoringMode: "optional",
      allowTies: false,
      defaultRole: "recorder",
      description: "",
    });
  });
});

describe(
  "GROUP-003: team format can be fixed or flexible",
  { tags: ["GROUP-003"] },
  () => {
    const create = async (teamFormat: unknown) => {
      const user = await seedUser();
      return api("/api/groups", {
        method: "POST",
        session: await signIn(user.id),
        json: { ...pickleball, teamFormat },
      });
    };

    it.each([
      { kind: "fixed", teams: 2, size: 1 },
      { kind: "fixed", teams: 8, size: 8 },
      { kind: "flexible" },
    ])("accepts %j", async (teamFormat) => {
      expect((await create(teamFormat)).status).toBe(201);
    });

    it.each([
      { kind: "fixed", teams: 1, size: 2 },
      { kind: "fixed", teams: 9, size: 2 },
      { kind: "fixed", teams: 2, size: 0 },
      { kind: "fixed", teams: 2, size: 1.5 },
      { kind: "flexible", teams: 2 },
      { kind: "other" },
    ])("rejects %j", async (teamFormat) => {
      expect((await create(teamFormat)).status).toBe(400);
    });
  },
);

describe(
  "GROUP-004: team format cannot be changed after creation",
  { tags: ["GROUP-004"] },
  () => {
    it("rejects a settings edit that includes the team format", async () => {
      const { session, groupId } = await owner();
      const res = await api(`/api/groups/${groupId}`, {
        method: "PATCH",
        session,
        json: { name: "Renamed", teamFormat: { kind: "flexible" } },
      });
      expect(res.status).toBe(400);
      expect(await getGroup(groupId)).toMatchObject({
        name: "Pickleball",
        teamFormat: { kind: "fixed" },
      });
    });
  },
);

describe(
  "GROUP-005: admins can edit group settings",
  { tags: ["GROUP-005", "ROLE-012"] },
  () => {
    it("saves every editable setting, audits it, and bumps the version", async () => {
      await owner(); // another group, created first
      const { groupId } = await owner();
      const admin = await member(groupId, "admin");
      const changes = {
        name: "Thursday Crew",
        description: "Courts 3-4",
        scoringMode: "required",
        allowTies: true,
        defaultRole: "viewer",
        visibility: "public",
      };
      const res = await api(`/api/groups/${groupId}`, {
        method: "PATCH",
        session: admin.session,
        json: changes,
      });
      expect(res.status).toBe(200);
      expect(
        (await res.json<{ group: { id: string; version: number } }>()).group,
      ).toMatchObject({ id: groupId, ...changes, version: 2 });
      expect(await getGroup(groupId)).toMatchObject({ ...changes, version: 2 });
      const audit = await db.query.auditEvents.findFirst({
        where: and(
          eq(auditEvents.groupId, groupId),
          eq(auditEvents.action, "group.updated"),
        ),
      });
      expect(audit?.after).toEqual(changes);
    });
  },
);

describe(
  "GROUP-010: the default role is recorder or viewer",
  { tags: ["GROUP-010"] },
  () => {
    it.each(["admin", "owner"])("rejects %s", async (defaultRole) => {
      const { session, groupId } = await owner();
      const res = await api(`/api/groups/${groupId}`, {
        method: "PATCH",
        session,
        json: { defaultRole },
      });
      expect(res.status).toBe(400);
    });
  },
);

describe(
  "GROUP-011: settings changes don't touch existing matches",
  { tags: ["GROUP-011"] },
  () => {
    // New matches following new settings is covered with the match API (M2).
    it("keeps tied and scoreless matches when ties are disallowed and scoring required", async () => {
      const { session, groupId } = await owner();
      const now = new Date().toISOString();
      const tied = [
        { playerIds: ["a"], score: 5, rank: 1 },
        { playerIds: ["b"], score: 5, rank: 1 },
      ];
      const scoreless = [
        { playerIds: ["a"], score: null, rank: 1 },
        { playerIds: ["b"], score: null, rank: 2 },
      ];
      for (const teams of [tied, scoreless]) {
        await db.insert(matches).values({
          id: newId(),
          groupId,
          playedAt: now,
          teams,
          createdAt: now,
          updatedAt: now,
        });
      }
      const before = await db
        .select()
        .from(matches)
        .where(eq(matches.groupId, groupId));

      await api(`/api/groups/${groupId}`, {
        method: "PATCH",
        session,
        json: { allowTies: false, scoringMode: "required" },
      });
      expect(
        await db.select().from(matches).where(eq(matches.groupId, groupId)),
      ).toEqual(before);
    });
  },
);

describe(
  "GROUP-012: group names are limited in length",
  { tags: ["GROUP-012"] },
  () => {
    it.each(["", "   ", "x".repeat(41)])(
      "rejects %j on create and rename",
      async (name) => {
        const { session, groupId } = await owner();
        const create = await api("/api/groups", {
          method: "POST",
          session,
          json: { ...pickleball, name },
        });
        expect(create.status).toBe(400);
        const rename = await api(`/api/groups/${groupId}`, {
          method: "PATCH",
          session,
          json: { name },
        });
        expect(rename.status).toBe(400);
      },
    );

    it("trims and accepts 40 characters", async () => {
      const { session, groupId } = await owner();
      const name = "x".repeat(40);
      await api(`/api/groups/${groupId}`, {
        method: "PATCH",
        session,
        json: { name: `  ${name}  ` },
      });
      expect((await getGroup(groupId))?.name).toBe(name);
    });
  },
);

describe(
  "GROUP-006: a user sees the groups they belong to",
  { tags: ["GROUP-006"] },
  () => {
    it("lists only groups with a player linked to the user", async () => {
      const a = await owner();
      const user = await seedUser();
      const session = await signIn(user.id);
      const res = await api("/api/groups", {
        method: "POST",
        session,
        json: { ...pickleball, name: "B group" },
      });
      const b = await res.json<{ id: string }>();
      await db.insert(players).values({
        id: newId(),
        groupId: a.groupId,
        displayName: "Joined",
        role: "viewer",
        userId: user.id,
        createdAt: new Date().toISOString(),
      });
      await owner(); // someone else's group

      const list = await (
        await api("/api/groups", { session })
      ).json<{ groups: { id: string; role: Role }[] }>();
      expect(list.groups.map((g) => [g.id, g.role]).sort()).toEqual(
        [
          [a.groupId, "viewer"],
          [b.id, "owner"],
        ].sort(),
      );
    });
  },
);

describe(
  "GROUP-007: the owner can delete the group",
  { tags: ["GROUP-007"] },
  () => {
    it("removes the group, players, matches and audit log", async () => {
      const { session, groupId } = await owner();
      const now = new Date().toISOString();
      await db.insert(matches).values({
        id: newId(),
        groupId,
        playedAt: now,
        teams: [],
        createdAt: now,
        updatedAt: now,
      });

      const res = await api(`/api/groups/${groupId}`, {
        method: "DELETE",
        session,
      });
      expect(res.status).toBe(200);
      expect(await getGroup(groupId)).toBeUndefined();
      for (const [table, col] of [
        [players, players.groupId],
        [matches, matches.groupId],
        [auditEvents, auditEvents.groupId],
      ] as const) {
        expect(await db.$count(table, eq(col, groupId))).toBe(0);
      }
    });
  },
);

describe(
  "GROUP-008: the owner can transfer ownership",
  { tags: ["GROUP-008"] },
  () => {
    it("makes Bob the owner and Alice an admin", async () => {
      const alice = await owner();
      const bob = await member(alice.groupId, "recorder");
      const res = await api(`/api/groups/${alice.groupId}/transfer`, {
        method: "POST",
        session: alice.session,
        json: { playerId: bob.playerId },
      });
      expect(res.status).toBe(200);
      expect(await roleOf(bob.playerId)).toBe("owner");
      expect(await roleOf(alice.playerId)).toBe("admin");
      expect(
        await db.$count(
          players,
          and(eq(players.groupId, alice.groupId), eq(players.role, "owner")),
        ),
      ).toBe(1);
    });
  },
);

describe(
  "GROUP-009: ownership can only go to a linked player",
  { tags: ["GROUP-009"] },
  () => {
    it("rejects a transfer to unclaimed Carl", async () => {
      const alice = await owner();
      const carl = await member(alice.groupId, "recorder", { linked: false });
      const res = await api(`/api/groups/${alice.groupId}/transfer`, {
        method: "POST",
        session: alice.session,
        json: { playerId: carl.playerId },
      });
      expect(res.status).toBe(400);
      expect(await roleOf(alice.playerId)).toBe("owner");
      expect(await roleOf(carl.playerId)).toBe("recorder");
    });
  },
);

describe(
  "ROLE-006: only the owner can delete or transfer",
  { tags: ["ROLE-006", "ROLE-009"] },
  () => {
    it("forbids an admin", async () => {
      const { groupId } = await owner();
      const admin = await member(groupId, "admin");
      const other = await member(groupId, "recorder");
      const del = await api(`/api/groups/${groupId}`, {
        method: "DELETE",
        session: admin.session,
      });
      expect(del.status).toBe(403);
      const transfer = await api(`/api/groups/${groupId}/transfer`, {
        method: "POST",
        session: admin.session,
        json: { playerId: other.playerId },
      });
      expect(transfer.status).toBe(403);
      expect(await getGroup(groupId)).toBeDefined();
    });
  },
);

describe(
  "ROLE-007: there is always exactly one owner",
  { tags: ["ROLE-007"] },
  () => {
    it("a second transfer racing the first can't create two owners", async () => {
      const alice = await owner();
      const bob = await member(alice.groupId, "recorder");
      const carol = await member(alice.groupId, "recorder");
      const transfer = (playerId: string) =>
        api(`/api/groups/${alice.groupId}/transfer`, {
          method: "POST",
          session: alice.session,
          json: { playerId },
        });
      const statuses = (
        await Promise.all([transfer(bob.playerId), transfer(carol.playerId)])
      ).map((r) => r.status);
      expect(statuses.sort()).toEqual([200, 409]);
      expect(
        await db.$count(
          players,
          and(eq(players.groupId, alice.groupId), eq(players.role, "owner")),
        ),
      ).toBe(1);
    });
  },
);

describe(
  "ROLE-009: permissions are enforced by the server",
  { tags: ["ROLE-009"] },
  () => {
    it("forbids a recorder from editing settings", async () => {
      const { groupId } = await owner();
      const recorder = await member(groupId, "recorder");
      const res = await api(`/api/groups/${groupId}`, {
        method: "PATCH",
        session: recorder.session,
        json: { name: "Mine now" },
      });
      expect(res.status).toBe(403);
    });

    it("hides a private group from non-members with the same 404 as a missing one", async () => {
      const { groupId } = await owner();
      const stranger = await signIn((await seedUser()).id);
      const hidden = await api(`/api/groups/${groupId}`, { session: stranger });
      const missing = await api(`/api/groups/${newId()}`, {
        session: stranger,
      });
      expect(hidden.status).toBe(404);
      expect(await hidden.json()).toEqual(await missing.json());
    });
  },
);

describe(
  "ROLE-010: site admins can act as owner in any group",
  { tags: ["ROLE-010"] },
  () => {
    it("can view and edit a private group, audited as themselves, but can't take ownership", async () => {
      const { groupId } = await owner();
      const admin = await seedUser({ isSiteAdmin: true });
      const session = await signIn(admin.id);

      expect((await api(`/api/groups/${groupId}`, { session })).status).toBe(
        200,
      );
      const edit = await api(`/api/groups/${groupId}`, {
        method: "PATCH",
        session,
        json: { name: "Moderated" },
      });
      expect(edit.status).toBe(200);
      const audit = await db.query.auditEvents.findFirst({
        where: and(
          eq(auditEvents.groupId, groupId),
          eq(auditEvents.action, "group.updated"),
        ),
      });
      expect(audit?.actorUserId).toBe(admin.id);
      // Not a player, so there's nothing to transfer ownership to.
      expect(
        await db.$count(
          players,
          and(eq(players.groupId, groupId), eq(players.userId, admin.id)),
        ),
      ).toBe(0);
    });
  },
);
