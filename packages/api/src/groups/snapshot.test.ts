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
import { matches, players } from "../db/schema";

interface Snapshot {
  group: { version: number };
  players: Record<string, unknown>[];
  matches: Record<string, unknown>[];
  me: { playerId: string } | null;
}

/** A public group with a linked owner, a linked recorder, an unclaimed player, and one match. */
async function publicGroup() {
  const inviteCode = `INV${newId()}`;
  const ownerUser = await seedUser({
    name: "Google Name",
    email: "owner@gmail.com",
  });
  const { group, ownerPlayer } = await seedGroup(
    { id: ownerUser.id, name: "Alice" },
    { visibility: "public", inviteCode },
  );
  if (!ownerPlayer) throw new Error("no owner");
  const recorderUser = await seedUser({ email: "rec@gmail.com" });
  const now = new Date().toISOString();
  const recorder = newId();
  const unclaimed = newId();
  await db.insert(players).values([
    {
      id: recorder,
      groupId: group.id,
      displayName: "Bob",
      role: "recorder",
      userId: recorderUser.id,
      createdAt: now,
    },
    {
      id: unclaimed,
      groupId: group.id,
      displayName: "Cy",
      role: "viewer",
      createdAt: now,
    },
  ]);
  await db.insert(matches).values({
    id: newId(),
    groupId: group.id,
    playedAt: now,
    teams: [
      { playerIds: [ownerPlayer.id], score: null, rank: 1 },
      { playerIds: [recorder], score: null, rank: 2 },
    ],
    recordedByPlayerId: recorder,
    createdAt: now,
    updatedAt: now,
  });
  return {
    inviteCode,
    gid: group.id,
    users: [ownerUser, recorderUser],
    owner: await signIn(ownerUser.id),
    recorder: await signIn(recorderUser.id),
  };
}

async function snapshot(gid: string, session?: string) {
  const res = await api(`/api/groups/${gid}`, { session });
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as Snapshot };
}

function expectNoAccountDetails(
  text: string,
  users: { id: string; email: string; name: string; googleSub: string }[],
) {
  for (const u of users) {
    for (const secret of [u.id, u.email, u.name, u.googleSub]) {
      expect(text).not.toContain(secret);
    }
  }
}

describe(
  "VIS-006: public data shows player names only",
  { tags: ["VIS-006"] },
  () => {
    it("a non-member sees names and matches, nothing about accounts or recorders", async () => {
      const { gid, users, inviteCode } = await publicGroup();
      const visitor = await signIn((await seedUser()).id);

      for (const session of [undefined, visitor]) {
        const { res, text, body } = await snapshot(gid, session);
        expect(res.status).toBe(200);
        expect(body.players.map((p) => Object.keys(p).sort())).toEqual([
          ["displayName", "id"],
          ["displayName", "id"],
          ["displayName", "id"],
        ]);
        expect(body.matches).toHaveLength(1);
        expect(body.matches[0]).not.toHaveProperty("recordedByPlayerId");
        expect(body.me).toBeNull();
        expect(text).not.toContain(inviteCode);
        expectNoAccountDetails(text, users);
      }
    });
  },
);

describe(
  "VIS-007: members never see other users' account details",
  { tags: ["VIS-007"] },
  () => {
    it("members see names, roles, claimed flags and recorders, never account details", async () => {
      const { gid, users, owner, recorder, inviteCode } = await publicGroup();
      for (const session of [recorder, owner]) {
        const { text, body } = await snapshot(gid, session);
        expect(
          body.players.map((p) => [p.displayName, p.role, p.linked]),
        ).toEqual([
          ["Alice", "owner", true],
          ["Bob", "recorder", true],
          ["Cy", "viewer", false],
        ]);
        expect(body.matches[0]).toHaveProperty("recordedByPlayerId");
        // Only admins get the invite link (JOIN-001).
        if (session === recorder) expect(text).not.toContain(inviteCode);
        else expect(text).toContain(inviteCode);
        expectNoAccountDetails(text, users);
      }
    });
  },
);

describe("snapshot caching", () => {
  it("ETag is version + audience; a matching If-None-Match gets an empty 304", async () => {
    const { gid, owner } = await publicGroup();
    const { res, body } = await snapshot(gid, owner);
    const etag = res.headers.get("ETag");
    expect(etag).toBe(`"${String(body.group.version)}-admin"`);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");

    const cached = await request(`/api/groups/${gid}`, {
      headers: { "If-None-Match": etag ?? "", Cookie: `session=${owner}` },
    });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
  });

  it("differs per audience, so a cached member view never serves a visitor", async () => {
    const { gid, recorder } = await publicGroup();
    const member = (await snapshot(gid, recorder)).res.headers.get("ETag");
    const visitor = await request(`/api/groups/${gid}`, {
      headers: { "If-None-Match": member ?? "" },
    });
    expect(member).toMatch(/-member"$/);
    expect(visitor.status).toBe(200);
    expect(visitor.headers.get("ETag")).toMatch(/-public"$/);
  });

  it("changes when the group changes", async () => {
    const { gid, owner } = await publicGroup();
    const before = (await snapshot(gid, owner)).res.headers.get("ETag");
    await api(`/api/groups/${gid}/players`, {
      method: "POST",
      session: owner,
      json: { players: [{ name: "Dee" }] },
    });
    const after = await request(`/api/groups/${gid}`, {
      headers: { "If-None-Match": before ?? "", Cookie: `session=${owner}` },
    });
    expect(after.status).toBe(200);
    expect(after.headers.get("ETag")).not.toBe(before);
  });

  it("orders matches by playedAt, then creation order", async () => {
    const { gid, owner } = await publicGroup();
    const { body } = await snapshot(gid, owner);
    const pid = body.players[0]?.id as string;
    const other = body.players[1]?.id as string;
    const teams = [
      { playerIds: [pid], score: null, rank: 1 },
      { playerIds: [other], score: null, rank: 2 },
    ];
    const ids = [newId(), newId(), newId()];
    const t = (h: number) =>
      `2026-01-01T${String(h).padStart(2, "0")}:00:00.000Z`;
    await db.insert(matches).values(
      [
        [ids[2], t(9)],
        [ids[1], t(8)],
        [ids[0], t(9)],
      ].map(([id, playedAt]) => ({
        id: id ?? "",
        groupId: gid,
        playedAt: playedAt ?? "",
        teams,
        createdAt: t(0),
        updatedAt: t(0),
      })),
    );
    const order = (await snapshot(gid, owner)).body.matches
      .map((m) => m.id)
      .slice(0, 3);
    expect(order).toEqual([ids[1], ids[0], ids[2]]);
  });
});
