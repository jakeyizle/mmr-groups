import { newId } from "@mmr/core";
import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db, seedGroup, seedUser } from "../../test/helpers";
import { auditedBatch, guardedBatch } from "./guarded-batch";
import { auditEvents, groups, matches, players } from "./schema";

// Storage is isolated per file, not per test: scope assertions to this test's group.
let groupId: string;
let matchId: string;
let userId: string;

beforeEach(async () => {
  const user = await seedUser();
  userId = user.id;
  groupId = (await seedGroup(user)).group.id;
  matchId = newId();
  const now = new Date().toISOString();
  await db.insert(matches).values({
    id: matchId,
    groupId,
    playedAt: now,
    teams: [],
    createdAt: now,
    updatedAt: now,
  });
});

const audit = (action: string) => ({
  groupId,
  actorUserId: userId,
  action,
  entityType: "match",
  entityId: matchId,
});

const matchAt = (version: number) =>
  and(eq(matches.id, matchId), eq(matches.version, version));

function editMatch(expectedVersion: number, notes: string) {
  return guardedBatch(
    db,
    db
      .update(matches)
      .set({ notes, version: sql`${matches.version} + 1` })
      .where(matchAt(expectedVersion)),
    { ...audit("match.updated"), after: { notes } },
  );
}

function deleteMatch(expectedVersion: number) {
  return guardedBatch(
    db,
    db.delete(matches).where(matchAt(expectedVersion)),
    audit("match.deleted"),
  );
}

async function state() {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });
  const audits = await db.$count(auditEvents, eq(auditEvents.groupId, groupId));
  return { match, groupVersion: group?.version, audits };
}

describe("guardedBatch", () => {
  it("applies the write, audit row and group bump when the version is current", async () => {
    expect(await editMatch(1, "fixed score")).toBe(true);
    const s = await state();
    expect(s.match).toMatchObject({ notes: "fixed score", version: 2 });
    expect(s).toMatchObject({ groupVersion: 2, audits: 1 });
  });

  it("writes nothing when the version is stale", async () => {
    await editMatch(1, "first");
    const before = await state();
    expect(await editMatch(1, "stale")).toBe(false);
    expect(await state()).toEqual(before);
  });

  it("lets exactly one of two concurrent edits with the same version win", async () => {
    const results = await Promise.all([editMatch(1, "a"), editMatch(1, "b")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const s = await state();
    expect(s.match?.notes).toBe(results[0] ? "a" : "b");
    expect(s).toMatchObject({ groupVersion: 2, audits: 1 });
  });

  it("deletes on the current version and writes nothing on a stale one", async () => {
    expect(await deleteMatch(2)).toBe(false);
    const s = await state();
    expect(s.match).toBeDefined();
    expect(s).toMatchObject({ groupVersion: 1, audits: 0 });

    expect(await deleteMatch(1)).toBe(true);
    expect(await state()).toMatchObject({
      match: undefined,
      groupVersion: 2,
      audits: 1,
    });
  });

  it("writes nothing when the row was deleted concurrently", async () => {
    await deleteMatch(1);
    const before = await state();
    expect(await editMatch(1, "too late")).toBe(false);
    expect(await state()).toEqual(before);
  });

  it("conditions follow-ups on the commit, whatever their row counts", async () => {
    const touchPlayers = (expectedVersion: number) =>
      guardedBatch(
        db,
        db
          .update(matches)
          .set({ version: sql`${matches.version} + 1` })
          .where(matchAt(expectedVersion)),
        audit("match.updated"),
        (committed) => [
          // 0 rows, then every player: a changes() chain would break here
          db
            .update(players)
            .set({ displayName: "never" })
            .where(sql`0 and ${committed}`),
          db
            .update(players)
            .set({ displayName: sql`${players.displayName} || '+'` })
            .where(sql`${eq(players.groupId, groupId)} and ${committed}`),
        ],
      );

    expect(await touchPlayers(1)).toBe(true);
    expect(await touchPlayers(1)).toBe(false);
    const names = (
      await db.select().from(players).where(eq(players.groupId, groupId))
    ).map((p) => p.displayName);
    expect(names.every((n) => n.endsWith("+") && !n.endsWith("++"))).toBe(true);
    expect(await state()).toMatchObject({ groupVersion: 2, audits: 1 });
  });
});

describe("claiming a player", () => {
  async function addUnclaimed(name: string) {
    const id = newId();
    await db.insert(players).values({
      id,
      groupId,
      displayName: name,
      role: "recorder",
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  const claim = (playerId: string, uid: string) =>
    db
      .update(players)
      .set({ userId: uid })
      .where(and(eq(players.id, playerId), isNull(players.userId)))
      .run();

  it("first claim wins when two users claim the same player concurrently", async () => {
    const playerId = await addUnclaimed("Dave");
    const [a, b] = [await seedUser(), await seedUser()];
    const results = await Promise.all([
      claim(playerId, a.id),
      claim(playerId, b.id),
    ]);
    expect(results.map((r) => r.meta.changes).sort()).toEqual([0, 1]);
    const winner = results[0].meta.changes === 1 ? a.id : b.id;
    const player = await db.query.players.findFirst({
      where: eq(players.id, playerId),
    });
    expect(player?.userId).toBe(winner);
  });

  it(
    "a user can't hold two players in one group",
    { tags: ["PLAYER-009"] },
    async () => {
      const playerId = await addUnclaimed("Dan");
      await expect(claim(playerId, userId)).rejects.toMatchObject({
        cause: { message: expect.stringMatching(/UNIQUE/) as unknown },
      });
    },
  );
});

describe("db.batch", () => {
  it("rolls back every statement when one fails", async () => {
    const now = new Date().toISOString();
    const player = (displayName: string) =>
      db.insert(players).values({
        id: newId(),
        groupId,
        displayName,
        role: "recorder",
        createdAt: now,
      });
    await expect(
      db.batch([player("Ok"), player("Dup"), player("dup")]),
    ).rejects.toThrow();
    expect(await db.$count(players, eq(players.groupId, groupId))).toBe(1);
  });
});

describe("auditedBatch", () => {
  it("needs at least one audit row", async () => {
    await expect(auditedBatch(db, [], [])).rejects.toThrow(
      "auditedBatch needs at least one audit row",
    );
  });
});
