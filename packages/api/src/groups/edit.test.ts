import {
  DEFAULT_RATING_CONFIG,
  type MatchInput,
  type MatchTeam,
  newId,
  replay,
  type ReplayMatch,
} from "@mmr/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, request, seedUser, signIn } from "../../test/helpers";
import { auditEvents, players } from "../db/schema";

const ASOF = "2026-02-01T00:00:00.000Z";
const at = (day: number) =>
  `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`;

interface SnapMatch extends ReplayMatch {
  version: number;
  notes: string;
}

/** A singles group with players a–e (owner a), and `settings` overrides. */
async function singles(settings: Record<string, unknown> = {}) {
  const user = await seedUser();
  const session = await signIn(user.id);
  const res = await api("/api/groups", {
    method: "POST",
    session,
    json: {
      name: "Singles",
      playerName: "a",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
      ...settings,
    },
  });
  const { id: gid, playerId: a } = await res.json<{
    id: string;
    playerId: string;
  }>();
  const added = await api(`/api/groups/${gid}/players`, {
    method: "POST",
    session,
    json: { players: ["b", "c", "d", "e"].map((name) => ({ name })) },
  });
  const { players: list } = await added.json<{ players: { id: string }[] }>();
  const [b, c, d, e] = list.map((p) => p.id) as [
    string,
    string,
    string,
    string,
  ];
  return { gid, session, user, p: { a, b, c, d, e } };
}

type G = Awaited<ReturnType<typeof singles>>;

const ranked = (winner: string, loser: string, day: number): MatchInput => ({
  playedAt: at(day),
  teams: [
    { playerIds: [winner], rank: 1 },
    { playerIds: [loser], rank: 2 },
  ],
});
const scored = (a: string, sa: number, b: string, sb: number, day: number) => ({
  playedAt: at(day),
  teams: [
    { playerIds: [a], score: sa },
    { playerIds: [b], score: sb },
  ],
});

async function record(g: G, list: MatchInput[]) {
  const res = await api(`/api/groups/${g.gid}/matches`, {
    method: "POST",
    session: g.session,
    json: { matches: list },
  });
  expect(res.status).toBe(201);
  return (await res.json<{ matches: SnapMatch[] }>()).matches;
}

async function snapshot(g: G) {
  const res = await api(`/api/groups/${g.gid}`, { session: g.session });
  return (await res.json<{ matches: SnapMatch[] }>()).matches;
}

function edit(
  g: G,
  m: { id: string; version: number },
  json: unknown,
  session = g.session,
) {
  return request(`/api/groups/${g.gid}/matches/${m.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `session=${session}`,
      "If-Match": `"${String(m.version)}"`,
    },
    body: JSON.stringify(json),
  });
}

function remove(g: G, m: { id: string; version: number }) {
  return request(`/api/groups/${g.gid}/matches/${m.id}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      Cookie: `session=${g.session}`,
      "If-Match": String(m.version),
    },
  });
}

const ratings = (list: readonly ReplayMatch[]) =>
  replay(list, DEFAULT_RATING_CONFIG, ASOF).players;

const team = (
  ids: string[],
  rank: number,
  score: number | null = null,
): MatchTeam => ({
  playerIds: ids,
  score,
  rank,
});

describe(
  "EDIT-001: changing participants updates ratings",
  { tags: ["EDIT-001"] },
  () => {
    it("replacing a player in M1 equals replaying the corrected history", async () => {
      const g = await singles();
      const [m1, m2, m3] = await record(g, [
        ranked(g.p.d, g.p.a, 1),
        ranked(g.p.a, g.p.b, 2),
        ranked(g.p.b, g.p.c, 3),
      ]);
      if (!m1 || !m2 || !m3) throw new Error("not recorded");
      const res = await edit(g, m1, {
        teams: [
          { playerIds: [g.p.e], rank: 1 },
          { playerIds: [g.p.a], rank: 2 },
        ],
      });
      expect(res.status).toBe(200);
      const expected = [
        { ...m1, teams: [team([g.p.e], 1), team([g.p.a], 2)] },
        m2,
        m3,
      ];
      expect(ratings(await snapshot(g))).toEqual(ratings(expected));
      expect(ratings(await snapshot(g)).has(g.p.d)).toBe(false);
    });
  },
);

describe(
  "EDIT-002: changing the winner updates ratings",
  { tags: ["EDIT-002"] },
  () => {
    it("flipping placements equals replaying with the other winner", async () => {
      const g = await singles();
      const [m1, m2] = await record(g, [
        ranked(g.p.a, g.p.b, 1),
        ranked(g.p.a, g.p.c, 2),
      ]);
      if (!m1 || !m2) throw new Error("not recorded");
      await edit(g, m1, {
        teams: [
          { playerIds: [g.p.a], rank: 2 },
          { playerIds: [g.p.b], rank: 1 },
        ],
      });
      expect(ratings(await snapshot(g))).toEqual(
        ratings([{ ...m1, teams: [team([g.p.a], 2), team([g.p.b], 1)] }, m2]),
      );
    });
  },
);

describe(
  "EDIT-003: score edits that keep the same winner leave ratings unchanged",
  { tags: ["EDIT-003"] },
  () => {
    it("11–7 → 11–8 saves the score, ratings identical", async () => {
      const g = await singles();
      const [m] = await record(g, [scored(g.p.a, 11, g.p.b, 7, 1)]);
      if (!m) throw new Error("not recorded");
      const before = ratings(await snapshot(g));
      const res = await edit(g, m, {
        teams: [
          { playerIds: [g.p.a], score: 11 },
          { playerIds: [g.p.b], score: 8 },
        ],
      });
      expect(res.status).toBe(200);
      const [saved] = await snapshot(g);
      expect(saved?.teams.map((t) => t.score)).toEqual([11, 8]);
      expect(ratings(await snapshot(g))).toEqual(before);
    });
  },
);

describe(
  "EDIT-004: score edits that flip the winner update ratings",
  { tags: ["EDIT-004"] },
  () => {
    it("11–7 → 7–11 ranks B first", async () => {
      const g = await singles();
      const [m] = await record(g, [scored(g.p.a, 11, g.p.b, 7, 1)]);
      if (!m) throw new Error("not recorded");
      await edit(g, m, {
        teams: [
          { playerIds: [g.p.a], score: 7 },
          { playerIds: [g.p.b], score: 11 },
        ],
      });
      const [saved] = await snapshot(g);
      expect(saved?.teams.map((t) => t.rank)).toEqual([2, 1]);
      expect(ratings(await snapshot(g))).toEqual(
        ratings([{ ...m, teams: [team([g.p.a], 2, 7), team([g.p.b], 1, 11)] }]),
      );
    });
  },
);

describe(
  "EDIT-005: changing the date-time reorders matches",
  { tags: ["EDIT-005"] },
  () => {
    it("moving M3 before M1 replays M3, M1, M2", async () => {
      const g = await singles();
      const [m1, m2, m3] = await record(g, [
        ranked(g.p.a, g.p.b, 5),
        ranked(g.p.b, g.p.c, 6),
        ranked(g.p.c, g.p.a, 7),
      ]);
      if (!m1 || !m2 || !m3) throw new Error("not recorded");
      await edit(g, m3, { playedAt: at(1) });
      const snap = await snapshot(g);
      expect(snap.map((m) => m.id)).toEqual([m3.id, m1.id, m2.id]);
      expect(ratings(snap)).toEqual(
        ratings([{ ...m3, playedAt: at(1) }, m1, m2]),
      );
    });
  },
);

describe(
  "EDIT-006: editing notes leaves ratings unchanged",
  { tags: ["EDIT-006"] },
  () => {
    it("only the notes change", async () => {
      const g = await singles();
      const [m] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
      if (!m) throw new Error("not recorded");
      const before = ratings(await snapshot(g));
      expect((await edit(g, m, { notes: "great rally" })).status).toBe(200);
      const [saved] = await snapshot(g);
      expect(saved?.notes).toBe("great rally");
      expect(saved?.version).toBe(2);
      expect(ratings(await snapshot(g))).toEqual(before);
    });
  },
);

describe(
  "EDIT-007: deleting a match updates ratings",
  { tags: ["EDIT-007"] },
  () => {
    it("deleting M2 replays M1 and M3 only", async () => {
      const g = await singles();
      const [m1, m2, m3] = await record(g, [
        ranked(g.p.a, g.p.b, 1),
        ranked(g.p.b, g.p.a, 2),
        ranked(g.p.a, g.p.c, 3),
      ]);
      if (!m1 || !m2 || !m3) throw new Error("not recorded");
      expect((await remove(g, m2)).status).toBe(200);
      const snap = await snapshot(g);
      expect(snap.map((m) => m.id)).toEqual([m1.id, m3.id]);
      expect(ratings(snap)).toEqual(ratings([m1, m3]));
    });
  },
);

describe(
  "EDIT-008: changed fields are validated against current settings",
  { tags: ["EDIT-008"] },
  () => {
    it("rejects teams that break the format, scoring mode or ties rule; the match is unchanged", async () => {
      const g = await singles();
      const [m] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
      if (!m) throw new Error("not recorded");
      await api(`/api/groups/${g.gid}`, {
        method: "PATCH",
        session: g.session,
        json: { scoringMode: "required" },
      });
      for (const teams of [
        [
          { playerIds: [g.p.a, g.p.c], score: 1 },
          { playerIds: [g.p.b], score: 0 },
        ],
        [
          { playerIds: [g.p.a], rank: 2 },
          { playerIds: [g.p.b], rank: 1 },
        ],
        [
          { playerIds: [g.p.a], score: 3 },
          { playerIds: [g.p.b], score: 3 },
        ],
        [
          { playerIds: [g.p.a], score: 3 },
          { playerIds: ["nobody"], score: 1 },
        ],
      ]) {
        const res = await edit(g, m, { teams });
        expect(res.status).toBe(400);
        expect((await res.json<{ error: { code: string } }>()).error.code).toBe(
          "invalid",
        );
      }
      expect(
        (await edit(g, m, { playedAt: "2099-01-01T00:00:00Z" })).status,
      ).toBe(400);
      const [saved] = await snapshot(g);
      expect(saved).toMatchObject({
        version: 1,
        teams: m.teams,
        playedAt: m.playedAt,
      });
    });
  },
);

describe(
  "EDIT-011: unchanged fields don't need to meet newer settings",
  { tags: ["EDIT-011"] },
  () => {
    it("a tied match can have its notes and date-time edited after ties are disallowed", async () => {
      const g = await singles({ allowTies: true });
      const [m] = await record(g, [
        {
          playedAt: at(1),
          teams: [
            { playerIds: [g.p.a], rank: 1 },
            { playerIds: [g.p.b], rank: 1 },
          ],
        },
      ]);
      if (!m) throw new Error("not recorded");
      await api(`/api/groups/${g.gid}`, {
        method: "PATCH",
        session: g.session,
        json: { allowTies: false, scoringMode: "required" },
      });
      const first = await edit(g, m, { notes: "tie" });
      expect(first.status).toBe(200);
      const second = await edit(
        g,
        { id: m.id, version: 2 },
        { playedAt: at(2) },
      );
      expect(second.status).toBe(200);
      const [saved] = await snapshot(g);
      expect(saved?.teams.map((t) => t.rank)).toEqual([1, 1]);
    });
  },
);

describe("EDIT-010: stale edits are rejected", { tags: ["EDIT-010"] }, () => {
  it("the second of two edits from the same version gets 412 and the current match", async () => {
    const g = await singles();
    const [m] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
    if (!m) throw new Error("not recorded");
    expect((await edit(g, m, { notes: "first" })).status).toBe(200);
    const second = await edit(g, m, { notes: "second" });
    expect(second.status).toBe(412);
    const { error } = await second.json<{
      error: { code: string; details: { match: SnapMatch } };
    }>();
    expect(error.code).toBe("stale");
    expect(error.details.match).toMatchObject({ notes: "first", version: 2 });
    expect((await remove(g, m)).status).toBe(412);
    expect((await snapshot(g))[0]?.notes).toBe("first");
  });

  it("concurrent edits of the same version: exactly one wins", async () => {
    const g = await singles();
    const [m] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
    if (!m) throw new Error("not recorded");
    const results = await Promise.all(
      ["x", "y", "z"].map(async (notes) => edit(g, m, { notes })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 412, 412]);
  });

  it("reads If-Match with or without quotes and spaces", async () => {
    const g = await singles();
    const [m] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
    const patch = (ifMatch: string) =>
      request(`/api/groups/${g.gid}/matches/${m?.id ?? ""}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "fetch",
          Cookie: `session=${g.session}`,
          "If-Match": ifMatch,
        },
        body: JSON.stringify({ notes: "n" }),
      });
    expect((await patch("v1")).status).toBe(428);
    expect((await patch('"12"')).status).toBe(412);
    expect((await patch('" 1 "')).status).toBe(200);
  });

  it("If-Match is required", async () => {
    const g = await singles();
    const [m] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
    const res = await api(`/api/groups/${g.gid}/matches/${m?.id ?? ""}`, {
      method: "PATCH",
      session: g.session,
      json: { notes: "n" },
    });
    expect(res.status).toBe(428);
  });
});

describe(
  "EDIT-009: edits and deletions are audited",
  { tags: ["EDIT-009", "AUDIT-001"] },
  () => {
    it("records who, when, and changed fields before/after; deletes keep the full match", async () => {
      const g = await singles();
      const [m] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
      if (!m) throw new Error("not recorded");
      await edit(g, m, { notes: "n", playedAt: at(2) });
      await remove(g, { id: m.id, version: 2 });
      const events = await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, m.id)));
      expect(
        events.map((e) => [e.action, e.actorUserId, e.before, e.after]),
      ).toEqual([
        ["match.created", g.user.id, null, expect.anything()],
        [
          "match.updated",
          g.user.id,
          { playedAt: at(1), notes: "" },
          { playedAt: at(2), notes: "n" },
        ],
        [
          "match.deleted",
          g.user.id,
          { playedAt: at(2), teams: m.teams, notes: "n" },
          null,
        ],
      ]);
      expect(events.every((e) => e.createdAt)).toBe(true);
    });
  },
);

describe("match edit permissions", () => {
  it("recorders edit and delete only matches they recorded", async () => {
    const g = await singles();
    const recUser = await seedUser();
    await db.insert(players).values({
      id: newId(),
      groupId: g.gid,
      displayName: "rec",
      role: "recorder",
      userId: recUser.id,
      createdAt: new Date().toISOString(),
    });
    const rec = await signIn(recUser.id);
    const [byOwner] = await record(g, [ranked(g.p.a, g.p.b, 1)]);
    const own = await api(`/api/groups/${g.gid}/matches`, {
      method: "POST",
      session: rec,
      json: { matches: [ranked(g.p.c, g.p.d, 2)] },
    });
    const {
      matches: [byRec],
    } = await own.json<{ matches: SnapMatch[] }>();
    if (!byOwner || !byRec) throw new Error("not recorded");
    expect((await edit(g, byOwner, { notes: "x" }, rec)).status).toBe(403);
    expect((await edit(g, byRec, { notes: "x" }, rec)).status).toBe(200);
  });
});
