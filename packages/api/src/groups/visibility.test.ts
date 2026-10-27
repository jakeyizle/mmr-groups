import { newId } from "@mmr/core";
import { describe, expect, it } from "vitest";

import { api, db, seedGroup, seedUser, signIn } from "../../test/helpers";
import { players } from "../db/schema";

/** Every group endpoint, as [method, path suffix, body]. */
const ENDPOINTS: [string, string, unknown?][] = [
  ["GET", ""],
  ["PATCH", "", { name: "x" }],
  ["DELETE", ""],
  ["POST", "/transfer", { playerId: "p" }],
  ["POST", "/players", { players: [{ name: "x" }] }],
  ["PATCH", "/players/p", { displayName: "x" }],
  ["DELETE", "/players/p"],
  ["POST", "/players/p/unlink", {}],
  ["POST", "/matches", { matches: [] }],
  ["PATCH", "/matches/m", { notes: "x" }],
  ["DELETE", "/matches/m"],
  ["GET", "/audit"],
  ["PUT", "/invite", {}],
  ["DELETE", "/invite"],
  ["POST", "/leave", {}],
];

async function call(
  gid: string,
  [method, suffix, json]: (typeof ENDPOINTS)[number],
  session?: string,
) {
  const res = await api(`/api/groups/${gid}${suffix}`, {
    method,
    json,
    session,
  });
  return { status: res.status, body: await res.text() };
}

async function ownedGroup(visibility: "private" | "public", extra = {}) {
  const user = await seedUser();
  const { group } = await seedGroup(
    { id: user.id, name: "Owner" },
    { visibility, ...extra },
  );
  return { gid: group.id, owner: await signIn(user.id) };
}

describe(
  "VIS-001: private groups are indistinguishable from missing ones",
  { tags: ["VIS-001"] },
  () => {
    it("every endpoint answers a private group exactly like a missing one", async () => {
      const { gid } = await ownedGroup("private");
      const missing = newId();
      const outsider = await signIn((await seedUser()).id);
      for (const session of [undefined, outsider]) {
        for (const endpoint of ENDPOINTS) {
          const a = await call(gid, endpoint, session);
          const b = await call(missing, endpoint, session);
          expect({ endpoint, ...a }).toEqual({ endpoint, ...b });
          // Signed out, mutations stop at authentication (401) for both.
          expect([404, 401]).toContain(a.status);
        }
      }
    });
  },
);

describe(
  "VIS-003: public groups are read-only to non-members",
  { tags: ["VIS-003"] },
  () => {
    it("reads work; every mutation is rejected", async () => {
      const { gid } = await ownedGroup("public");
      const outsider = await signIn((await seedUser()).id);
      for (const endpoint of ENDPOINTS) {
        const { status } = await call(gid, endpoint, outsider);
        if (endpoint[0] === "GET") {
          // The audit log is members-only (AUDIT-005).
          expect(status).toBe(endpoint[1] === "/audit" ? 403 : 200);
        } else {
          expect(
            status,
            `${endpoint[0]} ${endpoint[1]}`,
          ).toBeGreaterThanOrEqual(403);
        }
      }
    });
  },
);

describe(
  "VIS-004: changing visibility takes effect immediately",
  { tags: ["VIS-004"] },
  () => {
    it("making a public group private cuts off non-members on the next request", async () => {
      const { gid, owner } = await ownedGroup("public");
      const outsider = await signIn((await seedUser()).id);
      const before = await api(`/api/groups/${gid}`, { session: outsider });
      expect(before.status).toBe(200);
      const etag = before.headers.get("ETag") ?? "";

      await api(`/api/groups/${gid}`, {
        method: "PATCH",
        session: owner,
        json: { visibility: "private" },
      });
      for (const session of [outsider, undefined]) {
        const res = await api(`/api/groups/${gid}`, { session });
        expect(res.status).toBe(404);
      }
      // A cached validator doesn't get a 304 either.
      const revalidate = await api(`/api/groups/${gid}`, { session: outsider });
      expect(revalidate.status).toBe(404);
      expect(etag).toMatch(/-public"$/);
    });
  },
);

describe("VIS-008: the demo group is read-only", { tags: ["VIS-008"] }, () => {
  it("only site admins can change it, and nobody can join it", async () => {
    const { group } = await seedGroup(undefined, {
      visibility: "public",
      isDemo: true,
      inviteCode: `demo${newId()}`,
    });
    await db.insert(players).values({
      id: newId(),
      groupId: group.id,
      displayName: "Demo Player",
      role: "recorder",
      createdAt: new Date().toISOString(),
    });
    const someone = await signIn((await seedUser()).id);
    const admin = await signIn((await seedUser({ isSiteAdmin: true })).id);

    const rename = (session: string) =>
      api(`/api/groups/${group.id}`, {
        method: "PATCH",
        session,
        json: { name: "Mine" },
      });
    expect((await rename(someone)).status).toBe(403);
    const claim = await api(`/api/invites/${group.inviteCode ?? ""}/claim`, {
      method: "POST",
      session: someone,
      json: { newPlayerName: "Me" },
    });
    expect(claim.status).toBe(403);
    expect((await rename(admin)).status).toBe(200);

    const row = await db.query.groups.findFirst({
      where: (g, { eq }) => eq(g.id, group.id),
    });
    expect(row?.name).toBe("Mine");
  });
});
