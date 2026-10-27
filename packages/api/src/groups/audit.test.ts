import { newId, type Role } from "@mmr/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, seedUser, signIn } from "../../test/helpers";
import { auditEvents, players } from "../db/schema";
import { AUDIT_PAGE_SIZE } from "./audit";

interface Event {
  id: string;
  action: string;
  entityId: string;
  actorName: string | null;
  before: unknown;
  after: unknown;
}
interface Page {
  events: Event[];
  nextCursor: string | null;
}

async function owner(visibility = "private") {
  const user = await seedUser({
    name: "Alice Account",
    email: "alice@gmail.com",
  });
  const session = await signIn(user.id);
  const res = await api("/api/groups", {
    method: "POST",
    session,
    json: {
      name: "G",
      playerName: "Alice",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
      visibility,
    },
  });
  const { id, playerId } = await res.json<{ id: string; playerId: string }>();
  return { user, session, gid: id, playerId };
}

async function member(gid: string, role: Role) {
  const user = await seedUser();
  const id = newId();
  await db.insert(players).values({
    id,
    groupId: gid,
    displayName: `M ${id.slice(-5)}`,
    role,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });
  return { playerId: id, user, session: await signIn(user.id) };
}

async function log(gid: string, session?: string, cursor?: string) {
  const res = await api(
    `/api/groups/${gid}/audit${cursor ? `?cursor=${cursor}` : ""}`,
    { session },
  );
  return { res, page: res.ok ? await res.json<Page>() : null };
}

const actions = async (gid: string, session: string) =>
  ((await log(gid, session)).page?.events ?? []).map((e) => e.action);

describe(
  "AUDIT-003: members can view the audit log",
  { tags: ["AUDIT-003"] },
  () => {
    it.each(["viewer", "recorder", "admin"] as const)(
      "a %s sees entries newest first, with the actor's player name only",
      async (role) => {
        const { gid, session, user } = await owner();
        await api(`/api/groups/${gid}/players`, {
          method: "POST",
          session,
          json: { players: [{ name: "Bob" }] },
        });
        const m = await member(gid, role);
        const { res, page } = await log(gid, m.session);
        expect(res.status).toBe(200);
        expect(page?.events.map((e) => e.action)).toEqual([
          "player.created",
          "player.created",
          "group.created",
        ]);
        expect(page?.events[0]).toMatchObject({
          actorName: "Alice",
          after: { displayName: "Bob" },
        });
        const text = JSON.stringify(page);
        for (const secret of [user.id, user.email, user.name, user.googleSub])
          expect(text).not.toContain(secret);
      },
    );
  },
);

describe(
  "AUDIT-004: the audit log is paginated",
  { tags: ["AUDIT-004"] },
  () => {
    it("returns pages of 50 with a cursor to older ones", async () => {
      const { gid, session, user } = await owner();
      const now = new Date().toISOString();
      const rows = Array.from({ length: 120 }, () => ({
        id: newId(),
        groupId: gid,
        actorUserId: user.id,
        action: "test.event",
        entityType: "group",
        entityId: gid,
        createdAt: now,
      }));
      // D1 allows 100 bound variables per statement: 10 rows each.
      for (let i = 0; i < rows.length; i += 10)
        await db.insert(auditEvents).values(rows.slice(i, i + 10));
      const seen: string[] = [];
      let cursor: string | undefined;
      const sizes: number[] = [];
      do {
        const { page } = await log(gid, session, cursor);
        if (!page) throw new Error("no page");
        sizes.push(page.events.length);
        seen.push(...page.events.map((e) => e.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      // 120 inserted + group.created + player.created
      expect(sizes).toEqual([AUDIT_PAGE_SIZE, AUDIT_PAGE_SIZE, 22]);
      expect(new Set(seen).size).toBe(122);
      expect([...seen].sort().reverse()).toEqual(seen);
    });
  },
);

describe(
  "AUDIT-005: the audit log is not public",
  { tags: ["AUDIT-005"] },
  () => {
    it("non-members of a public group are denied; private groups stay hidden", async () => {
      const pub = await owner("public");
      const visitor = await signIn((await seedUser()).id);
      expect((await log(pub.gid, visitor)).res.status).toBe(403);
      expect((await log(pub.gid)).res.status).toBe(403);
      // The group itself is viewable.
      expect((await api(`/api/groups/${pub.gid}`)).status).toBe(200);

      const priv = await owner("private");
      expect((await log(priv.gid, visitor)).res.status).toBe(404);
    });
  },
);

describe(
  "AUDIT-006: audit entries cannot be edited or deleted",
  { tags: ["AUDIT-006"] },
  () => {
    it("no method on the audit log or an entry changes anything, even for the owner", async () => {
      const { gid, session } = await owner();
      const { page } = await log(gid, session);
      const before = page?.events;
      const id = before?.[0]?.id ?? "";
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        for (const path of [
          `/api/groups/${gid}/audit`,
          `/api/groups/${gid}/audit/${id}`,
        ]) {
          const res = await api(path, { method, session, json: {} });
          expect(res.status).toBe(404);
        }
      }
      expect((await log(gid, session)).page?.events).toEqual(before);
    });
  },
);

describe(
  "AUDIT-008: player and role changes are audited",
  { tags: ["AUDIT-008"] },
  () => {
    it("add, rename, role change and remove each write an entry", async () => {
      const { gid, session } = await owner();
      const added = await api(`/api/groups/${gid}/players`, {
        method: "POST",
        session,
        json: { players: [{ name: "Bob" }] },
      });
      const {
        players: [bob],
      } = await added.json<{ players: { id: string }[] }>();
      const path = `/api/groups/${gid}/players/${bob?.id ?? ""}`;
      await api(path, {
        method: "PATCH",
        session,
        json: { displayName: "Rob" },
      });
      await api(path, { method: "PATCH", session, json: { role: "viewer" } });
      await api(path, { method: "DELETE", session });

      const { page } = await log(gid, session);
      const bobEvents = page?.events.filter((e) => e.entityId === bob?.id);
      expect(bobEvents?.map((e) => [e.action, e.before, e.after])).toEqual([
        [
          "player.deleted",
          expect.objectContaining({ displayName: "Rob" }),
          null,
        ],
        ["player.updated", { role: "recorder" }, { role: "viewer" }],
        ["player.updated", { displayName: "Bob" }, { displayName: "Rob" }],
        ["player.created", null, { displayName: "Bob", role: "recorder" }],
      ]);
    });
  },
);

describe(
  "AUDIT-009: settings and invite changes are audited",
  { tags: ["AUDIT-009"] },
  () => {
    // Invite link events arrive with M4 (joining).
    it("a settings change records the changed fields before and after", async () => {
      const { gid, session } = await owner();
      await api(`/api/groups/${gid}`, {
        method: "PATCH",
        session,
        json: { name: "Renamed", allowTies: true },
      });
      const [latest] = (await log(gid, session)).page?.events ?? [];
      expect(latest).toMatchObject({
        action: "group.updated",
        before: { name: "G", allowTies: false },
        after: { name: "Renamed", allowTies: true },
      });
    });
  },
);

describe(
  "AUDIT-010: membership and ownership changes are audited",
  { tags: ["AUDIT-010"] },
  () => {
    // Claims, joins and leaving arrive with M4 (joining).
    it("unlinking and transferring ownership write entries", async () => {
      const { gid, session, playerId } = await owner();
      const rec = await member(gid, "recorder");
      const adm = await member(gid, "admin");
      await api(`/api/groups/${gid}/players/${rec.playerId}/unlink`, {
        method: "POST",
        session,
        json: {},
      });
      await api(`/api/groups/${gid}/transfer`, {
        method: "POST",
        session,
        json: { playerId: adm.playerId },
      });
      const events = (await log(gid, session)).page?.events ?? [];
      expect(
        events.slice(0, 3).map((e) => [e.action, e.entityId, e.after]),
      ).toEqual(
        expect.arrayContaining([
          ["player.roleChanged", playerId, { role: "admin" }],
          ["player.roleChanged", adm.playerId, { role: "owner" }],
          [
            "player.unlinked",
            rec.playerId,
            { linked: false, role: "recorder" },
          ],
        ]),
      );
      expect(await actions(gid, session)).toContain("player.unlinked");
      expect(
        await db.$count(auditEvents, eq(auditEvents.groupId, gid)),
      ).toBeGreaterThanOrEqual(5);
    });
  },
);
