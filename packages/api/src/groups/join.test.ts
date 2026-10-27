import { newId, type Role } from "@mmr/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, seedUser, signIn } from "../../test/helpers";
import { auditEvents, matches, players } from "../db/schema";

interface Offer {
  group: { id: string; name: string };
  member: boolean;
  players: { id: string; displayName: string; role: Role }[];
}

/** A private group with unclaimed Dave (recorder) and Sue (viewer), one Dave match, and an invite. */
async function setup(settings: Record<string, unknown> = {}) {
  const ownerUser = await seedUser();
  const owner = await signIn(ownerUser.id);
  const res = await api("/api/groups", {
    method: "POST",
    session: owner,
    json: {
      name: "Club",
      playerName: "Olive",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
      ...settings,
    },
  });
  const { id: gid, playerId: olive } = await res.json<{
    id: string;
    playerId: string;
  }>();
  const added = await api(`/api/groups/${gid}/players`, {
    method: "POST",
    session: owner,
    json: {
      players: [
        { name: "Dave", role: "recorder" },
        { name: "Sue", role: "viewer" },
      ],
    },
  });
  const { players: list } = await added.json<{ players: { id: string }[] }>();
  const [dave = "", sue = ""] = list.map((p) => p.id);
  await api(`/api/groups/${gid}/matches`, {
    method: "POST",
    session: owner,
    json: {
      matches: [
        {
          playedAt: "2026-01-01T12:00:00Z",
          teams: [
            { playerIds: [dave], rank: 1 },
            { playerIds: [olive], rank: 2 },
          ],
        },
      ],
    },
  });
  const inv = await api(`/api/groups/${gid}/invite`, {
    method: "PUT",
    session: owner,
    json: {},
  });
  const { invite } = await inv.json<{ invite: { code: string } }>();
  return { gid, owner, olive, dave, sue, code: invite.code };
}

const joiner = async () => {
  const user = await seedUser();
  return { user, session: await signIn(user.id) };
};

const offer = async (code: string, session?: string) =>
  api(`/api/invites/${code}`, { session });

const claim = (code: string, session: string, json: unknown) =>
  api(`/api/invites/${code}/claim`, { method: "POST", session, json });

const snapshot = async (gid: string, session: string) => {
  const res = await api(`/api/groups/${gid}`, { session });
  return {
    res,
    body: res.ok
      ? await res.json<{
          me: { playerId: string; role: Role } | null;
          players: {
            id: string;
            displayName: string;
            role: Role;
            linked: boolean;
          }[];
          matches: { teams: { playerIds: string[] }[] }[];
        }>()
      : null,
  };
};

describe(
  "JOIN-004: opening an invite link requires sign-in",
  { tags: ["JOIN-004"] },
  () => {
    // The redirect back after sign-in is AUTH-005 and the join page E2E.
    it("signed-out requests are unauthenticated", async () => {
      const { code } = await setup();
      expect((await offer(code)).status).toBe(401);
      const res = await api(`/api/invites/${code}/claim`, {
        method: "POST",
        json: { newPlayerName: "X" },
      });
      expect(res.status).toBe(401);
    });
  },
);

describe(
  "JOIN-005: a joiner can claim an unclaimed player",
  { tags: ["JOIN-005"] },
  () => {
    it("is linked immediately with the pre-assigned role and sees the player's matches", async () => {
      const { gid, dave, code } = await setup();
      const j = await joiner();
      const res = await claim(code, j.session, { playerId: dave });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ groupId: gid, playerId: dave });

      const { body } = await snapshot(gid, j.session);
      expect(body?.me).toEqual({ playerId: dave, role: "recorder" });
      expect(body?.matches[0]?.teams[0]?.playerIds).toEqual([dave]);
    });
  },
);

describe(
  "JOIN-006: a joiner who isn't listed can add themselves",
  { tags: ["JOIN-006"] },
  () => {
    it("creates a linked player with the group's default role", async () => {
      const { gid, code } = await setup({ defaultRole: "recorder" });
      const j = await joiner();
      const res = await claim(code, j.session, { newPlayerName: " Pat " });
      expect(res.status).toBe(201);
      const { playerId } = await res.json<{ playerId: string }>();
      const { body } = await snapshot(gid, j.session);
      expect(body?.me).toEqual({ playerId, role: "recorder" });
      expect(body?.players.find((p) => p.id === playerId)).toMatchObject({
        displayName: "Pat",
        linked: true,
      });
    });

    it("can't take an existing name", async () => {
      const { code } = await setup();
      const j = await joiner();
      const res = await claim(code, j.session, { newPlayerName: "dave" });
      expect(res.status).toBe(409);
      expect((await res.json<{ error: { code: string } }>()).error.code).toBe(
        "name_taken",
      );
    });
  },
);

describe(
  "JOIN-007: claimed players are not offered to joiners",
  { tags: ["JOIN-007"] },
  () => {
    it("lists only unclaimed players, with their roles", async () => {
      const { dave, sue, code } = await setup();
      const first = await joiner();
      await claim(code, first.session, { playerId: dave });
      const res = await offer(code, (await joiner()).session);
      const body = await res.json<Offer>();
      expect(body.member).toBe(false);
      expect(body.players).toEqual([
        { id: sue, displayName: "Sue", role: "viewer" },
      ]);
    });
  },
);

describe(
  "JOIN-013: simultaneous claims of the same player",
  { tags: ["JOIN-013"] },
  () => {
    it("exactly one claim wins; the other gets claim_lost and the remaining choices", async () => {
      const { dave, sue, code } = await setup();
      const [a, b] = [await joiner(), await joiner()];
      const results = await Promise.all(
        [a, b].map(async (j) => claim(code, j.session, { playerId: dave })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const lost = results.find((r) => r.status === 409);
      expect(
        (await lost?.json<{ error: { code: string } }>())?.error.code,
      ).toBe("claim_lost");
      const loser = results[0]?.status === 409 ? a : b;
      const again = await (await offer(code, loser.session)).json<Offer>();
      expect(again.players.map((p) => p.id)).toEqual([sue]);
      const linked = await db
        .select()
        .from(players)
        .where(eq(players.id, dave));
      expect([a.user.id, b.user.id]).toContain(linked[0]?.userId);
    });
  },
);

describe(
  "JOIN-008: existing members are taken straight to the group",
  { tags: ["JOIN-008"] },
  () => {
    it("the offer says member and claiming again changes nothing", async () => {
      const { gid, owner, olive, sue, code } = await setup();
      const body = await (await offer(code, owner)).json<Offer>();
      expect(body).toMatchObject({
        member: true,
        players: [],
        group: { id: gid },
      });
      const res = await claim(code, owner, { playerId: sue });
      expect(await res.json()).toEqual({ groupId: gid, playerId: olive });
      const [s] = await db.select().from(players).where(eq(players.id, sue));
      expect(s?.userId).toBeNull();
    });
  },
);

describe(
  "JOIN-009: invalid or expired links are reported as invalid",
  { tags: ["JOIN-009"] },
  () => {
    it("revoked and unknown codes give the same 404 without group details, for both endpoints", async () => {
      const { gid, owner, dave, code } = await setup();
      await api(`/api/groups/${gid}/invite`, {
        method: "DELETE",
        session: owner,
      });
      const j = await joiner();
      for (const c of [code, "unknowncode2"]) {
        const o = await offer(c, j.session);
        expect(o.status).toBe(404);
        expect(JSON.stringify(await o.json())).not.toContain("Club");
        expect((await claim(c, j.session, { playerId: dave })).status).toBe(
          404,
        );
      }
    });
  },
);

describe("JOIN-010: members can leave a group", { tags: ["JOIN-010"] }, () => {
  it("the player becomes unclaimed, keeps history, and the group disappears for the user", async () => {
    const { gid, dave, code } = await setup();
    const j = await joiner();
    await claim(code, j.session, { playerId: dave });
    const res = await api(`/api/groups/${gid}/leave`, {
      method: "POST",
      session: j.session,
      json: {},
    });
    expect(res.status).toBe(200);
    const [p] = await db.select().from(players).where(eq(players.id, dave));
    expect(p).toMatchObject({ userId: null, role: "recorder" });
    expect(await db.$count(matches, eq(matches.groupId, gid))).toBe(1);
    expect((await snapshot(gid, j.session)).res.status).toBe(404);
    const list = await (
      await api("/api/groups", { session: j.session })
    ).json<{
      groups: unknown[];
    }>();
    expect(list.groups).toEqual([]);
  });

  it("anyone else who leaves keeps their role", async () => {
    const { gid } = await setup({ defaultRole: "viewer" });
    const user = await seedUser();
    const id = newId();
    await db.insert(players).values({
      id,
      groupId: gid,
      displayName: "Rex",
      role: "recorder",
      userId: user.id,
      createdAt: new Date().toISOString(),
    });
    await api(`/api/groups/${gid}/leave`, {
      method: "POST",
      session: await signIn(user.id),
      json: {},
    });
    const [p] = await db.select().from(players).where(eq(players.id, id));
    expect(p).toMatchObject({ userId: null, role: "recorder" });
  });

  it("an admin who leaves is reset to the default role", async () => {
    const { gid } = await setup({ defaultRole: "viewer" });
    const user = await seedUser();
    const id = newId();
    await db.insert(players).values({
      id,
      groupId: gid,
      displayName: "Ada",
      role: "admin",
      userId: user.id,
      createdAt: new Date().toISOString(),
    });
    await api(`/api/groups/${gid}/leave`, {
      method: "POST",
      session: await signIn(user.id),
      json: {},
    });
    const [p] = await db.select().from(players).where(eq(players.id, id));
    expect(p).toMatchObject({ userId: null, role: "viewer" });
  });
});

describe(
  "JOIN-011: the owner must transfer ownership before leaving",
  { tags: ["JOIN-011"] },
  () => {
    it("is rejected while they're the owner", async () => {
      const { gid, owner, olive } = await setup();
      const res = await api(`/api/groups/${gid}/leave`, {
        method: "POST",
        session: owner,
        json: {},
      });
      expect(res.status).toBe(409);
      expect((await res.json<{ error: { code: string } }>()).error.code).toBe(
        "owner_must_transfer",
      );
      const [p] = await db.select().from(players).where(eq(players.id, olive));
      expect(p?.role).toBe("owner");
    });
  },
);

describe(
  "AUDIT-010: membership and ownership changes are audited",
  { tags: ["AUDIT-010"] },
  () => {
    it("claims, joins and leaving write entries", async () => {
      const { gid, dave, code } = await setup();
      const a = await joiner();
      const b = await joiner();
      await claim(code, a.session, { playerId: dave });
      const joined = await claim(code, b.session, { newPlayerName: "Pat" });
      const { playerId: pat } = await joined.json<{ playerId: string }>();
      await api(`/api/groups/${gid}/leave`, {
        method: "POST",
        session: a.session,
        json: {},
      });
      const events = await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.groupId, gid),
            eq(auditEvents.entityType, "player"),
          ),
        );
      const membership = events
        .filter((e) =>
          ["player.claimed", "player.joined", "player.left"].includes(e.action),
        )
        .map((e) => [e.action, e.entityId, e.actorUserId]);
      expect(membership).toEqual([
        ["player.claimed", dave, a.user.id],
        ["player.joined", pat, b.user.id],
        ["player.left", dave, a.user.id],
      ]);
    });
  },
);
