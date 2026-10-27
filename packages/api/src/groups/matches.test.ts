import {
  DEFAULT_RATING_CONFIG,
  type MatchInput,
  newId,
  replay,
  type Role,
} from "@mmr/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, seedUser, signIn } from "../../test/helpers";
import { auditedBatch } from "../db/guarded-batch";
import { auditEvents, groups, matches, players } from "../db/schema";

/** A 2×2 group owned by a fresh user, with players a–d (owner is "a"). */
async function doublesGroup(settings: Record<string, unknown> = {}) {
  const user = await seedUser();
  const session = await signIn(user.id);
  const res = await api("/api/groups", {
    method: "POST",
    session,
    json: {
      name: "Doubles",
      playerName: "a",
      teamFormat: { kind: "fixed", teams: 2, size: 2 },
      ...settings,
    },
  });
  const { id: gid, playerId } = await res.json<{
    id: string;
    playerId: string;
  }>();
  const added = await api(`/api/groups/${gid}/players`, {
    method: "POST",
    session,
    json: { players: [{ name: "b" }, { name: "c" }, { name: "d" }] },
  });
  const { players: others } = await added.json<{
    players: { id: string }[];
  }>();
  const [b, cc, d] = others.map((p) => p.id) as [string, string, string];
  return { gid, session, user, ids: { a: playerId, b, c: cc, d } };
}

type Ids = Awaited<ReturnType<typeof doublesGroup>>["ids"];

const game = (
  ids: Ids,
  extra: Partial<MatchInput> = {},
  ranks: [number, number] = [1, 2],
): MatchInput => ({
  playedAt: "2026-01-01T10:00:00.000Z",
  teams: [
    { playerIds: [ids.a, ids.b], rank: ranks[0] },
    { playerIds: [ids.c, ids.d], rank: ranks[1] },
  ],
  ...extra,
});

function record(gid: string, session: string, list: MatchInput[]) {
  return api(`/api/groups/${gid}/matches`, {
    method: "POST",
    session,
    json: { matches: list },
  });
}

const stored = (gid: string) =>
  db.select().from(matches).where(eq(matches.groupId, gid));

const audits = (gid: string) =>
  db
    .select()
    .from(auditEvents)
    .where(
      and(eq(auditEvents.groupId, gid), eq(auditEvents.entityType, "match")),
    );

const version = async (gid: string) =>
  (await db.query.groups.findFirst({ where: eq(groups.id, gid) }))?.version;

describe("MATCH-001: recording a single match", { tags: ["MATCH-001"] }, () => {
  it("saves it with derived ranks, recorded by my player", async () => {
    const { gid, session, ids } = await doublesGroup();
    const res = await record(gid, session, [
      game(ids, {
        playedAt: "2026-01-01T05:00:00-05:00",
        notes: " close one ",
      }),
    ]);
    expect(res.status).toBe(201);
    const [m] = await stored(gid);
    expect(m).toMatchObject({
      playedAt: "2026-01-01T10:00:00.000Z",
      notes: "close one",
      recordedByPlayerId: ids.a,
      version: 1,
      teams: [
        { playerIds: [ids.a, ids.b], score: null, rank: 1 },
        { playerIds: [ids.c, ids.d], score: null, rank: 2 },
      ],
    });
    const body = await res.json<{ matches: { id: string }[] }>();
    expect(body.matches.map((x) => x.id)).toEqual([m?.id]);
  });
});

describe(
  "MATCH-002: recording several matches in one submit",
  { tags: ["MATCH-002"] },
  () => {
    it("saves every match in the batch in one request", async () => {
      const { gid, session, ids } = await doublesGroup();
      const before = await version(gid);
      const res = await record(gid, session, [
        game(ids),
        game(ids, { playedAt: "2026-01-01T10:01:00.000Z" }, [2, 1]),
        game(ids, { playedAt: "2026-01-01T10:02:00.000Z" }),
      ]);
      expect(res.status).toBe(201);
      expect(await stored(gid)).toHaveLength(3);
      expect(await version(gid)).toBe((before ?? 0) + 1);
    });
  },
);

describe(
  "MATCH-003: a batch is saved all-or-nothing",
  { tags: ["MATCH-003"] },
  () => {
    it("one invalid match rejects the batch, with its index in each issue path", async () => {
      const { gid, session, ids } = await doublesGroup();
      const bad = game(ids);
      bad.teams[1] = { playerIds: [ids.c, ids.a], rank: 2 }; // a twice
      const res = await record(gid, session, [game(ids), bad, game(ids)]);
      expect(res.status).toBe(400);
      const { error } = await res.json<{
        error: { details: { path: unknown[]; code: string }[] };
      }>();
      expect(error.details).toEqual([
        expect.objectContaining({
          path: ["matches", 1, "teams", 1, "playerIds", 1],
          code: "duplicate_player",
        }),
      ]);
      expect(await stored(gid)).toHaveLength(0);
      expect(await audits(gid)).toHaveLength(0);
    });

    it("rejects players from outside the group", async () => {
      const { gid, session, ids } = await doublesGroup();
      const other = await doublesGroup();
      const res = await record(gid, session, [
        game({ ...ids, d: other.ids.d }),
      ]);
      expect(res.status).toBe(400);
      const { error } = await res.json<{
        error: { details: { path: unknown[]; code: string }[] };
      }>();
      expect(error.details).toEqual([
        expect.objectContaining({
          path: ["matches", 0, "teams", 1, "playerIds", 1],
          code: "unknown_player",
        }),
      ]);
      expect(await stored(gid)).toHaveLength(0);
    });

    it("rejects a schema-invalid batch before validating rules", async () => {
      const { gid, session, ids } = await doublesGroup();
      const res = await record(gid, session, [
        game(ids),
        { ...game(ids), playedAt: "yesterday" },
      ]);
      expect(res.status).toBe(400);
      expect(await stored(gid)).toHaveLength(0);
    });
  },
);

describe("match.record permission", () => {
  async function as(role: Role | null) {
    const g = await doublesGroup({ visibility: "public" });
    const user = await seedUser();
    if (role) {
      await db.insert(players).values({
        id: newId(),
        groupId: g.gid,
        displayName: `m-${user.id}`,
        role,
        userId: user.id,
        createdAt: new Date().toISOString(),
      });
    }
    const res = await record(g.gid, await signIn(user.id), [game(g.ids)]);
    return res.status;
  }

  it("recorders can record; viewers and non-members can't", async () => {
    expect(await as("recorder")).toBe(201);
    expect(await as("viewer")).toBe(403);
    expect(await as(null)).toBe(403);
  });
});

describe(
  "AUDIT-001: match changes are audited",
  { tags: ["AUDIT-001"] },
  () => {
    // Edits and deletes are audited with M3 (match editing).
    it("a created match gets a match.created event with its fields", async () => {
      const { gid, session, ids, user } = await doublesGroup();
      await record(gid, session, [game(ids, { notes: "n" })]);
      const [m] = await stored(gid);
      const [event] = await audits(gid);
      expect(event).toMatchObject({
        actorUserId: user.id,
        action: "match.created",
        entityId: m?.id,
        before: null,
        after: { playedAt: m?.playedAt, teams: m?.teams, notes: "n" },
      });
    });
  },
);

describe(
  "AUDIT-007: batches are audited per match",
  { tags: ["AUDIT-007"] },
  () => {
    it("a 6-match batch writes 6 match.created events", async () => {
      const { gid, session, ids } = await doublesGroup();
      await record(
        gid,
        session,
        Array.from({ length: 6 }, () => game(ids)),
      );
      const events = await audits(gid);
      expect(events).toHaveLength(6);
      expect(new Set(events.map((e) => e.entityId))).toEqual(
        new Set((await stored(gid)).map((m) => m.id)),
      );
    });
  },
);

describe(
  "AUDIT-002: audit entries are written atomically with the change",
  { tags: ["AUDIT-002"] },
  () => {
    it("if any statement in the batch fails, neither matches nor audit rows are written", async () => {
      const { gid, ids } = await doublesGroup();
      const now = new Date().toISOString();
      const row = {
        id: newId(),
        groupId: gid,
        playedAt: now,
        teams: game(ids).teams.map((t) => ({
          ...t,
          score: null,
          rank: t.rank ?? 1,
        })),
        createdAt: now,
        updatedAt: now,
      };
      const audit = {
        groupId: gid,
        actorUserId: null,
        action: "match.created",
        entityType: "match",
        entityId: row.id,
      };
      // The second insert reuses the primary key, so the batch fails at the end.
      await expect(
        auditedBatch(
          db,
          [db.insert(matches).values(row), db.insert(matches).values(row)],
          [audit, audit],
        ),
      ).rejects.toThrow();
      expect(await stored(gid)).toHaveLength(0);
      expect(await audits(gid)).toHaveLength(0);
    });
  },
);

describe(
  "GROUP-011: changing settings doesn't invalidate existing matches",
  { tags: ["GROUP-011"] },
  () => {
    it("tied and score-less matches stay and count; new ones follow new settings", async () => {
      const { gid, session, ids } = await doublesGroup({ allowTies: true });
      expect(
        (
          await record(gid, session, [
            game(ids, {}, [1, 1]),
            game(ids, { playedAt: "2026-01-02T10:00:00.000Z" }),
          ])
        ).status,
      ).toBe(201);

      const patch = await api(`/api/groups/${gid}`, {
        method: "PATCH",
        session,
        json: { allowTies: false, scoringMode: "required" },
      });
      expect(patch.status).toBe(200);

      const snap = await api(`/api/groups/${gid}`, { session });
      const { matches: kept } = await snap.json<{
        matches: { id: string; playedAt: string; teams: never[] }[];
      }>();
      expect(kept).toHaveLength(2);
      const r = replay(kept, DEFAULT_RATING_CONFIG, "2026-01-03T00:00:00.000Z");
      expect(r.players.get(ids.a)?.matches).toBe(2);

      const scoreless = await record(gid, session, [game(ids)]);
      expect(scoreless.status).toBe(400);
      const tied = await record(gid, session, [
        {
          ...game(ids),
          teams: [
            { playerIds: [ids.a, ids.b], score: 5 },
            { playerIds: [ids.c, ids.d], score: 5 },
          ],
        },
      ]);
      expect(tied.status).toBe(400);
      const scored = await record(gid, session, [
        {
          ...game(ids),
          teams: [
            { playerIds: [ids.a, ids.b], score: 5 },
            { playerIds: [ids.c, ids.d], score: 3 },
          ],
        },
      ]);
      expect(scored.status).toBe(201);
    });
  },
);
