import { newId, type Role } from "@mmr/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, seedUser, signIn } from "../../test/helpers";
import { auditEvents, groups, players } from "../db/schema";

interface Invite {
  code: string;
  expiresAt: string | null;
}

async function owner() {
  const user = await seedUser();
  const session = await signIn(user.id);
  const res = await api("/api/groups", {
    method: "POST",
    session,
    json: {
      name: "Club",
      playerName: "Olive",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
    },
  });
  const { id } = await res.json<{ id: string }>();
  return { gid: id, session };
}

async function member(gid: string, role: Role) {
  const user = await seedUser();
  await db.insert(players).values({
    id: newId(),
    groupId: gid,
    displayName: `M ${user.id.slice(-5)}`,
    role,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });
  return signIn(user.id);
}

async function createInvite(gid: string, session: string, json: unknown = {}) {
  const res = await api(`/api/groups/${gid}/invite`, {
    method: "PUT",
    session,
    json,
  });
  return {
    res,
    invite: res.ok ? (await res.json<{ invite: Invite }>()).invite : null,
  };
}

async function open(code: string, session?: string) {
  return api(`/api/invites/${code}`, { session });
}

const visitor = async () => signIn((await seedUser()).id);

describe(
  "JOIN-001: admins can create an invite link",
  { tags: ["JOIN-001"] },
  () => {
    it("an admin creates a link that anyone signed in can open", async () => {
      const { gid, session } = await owner();
      const adminSession = await member(gid, "admin");
      const { res, invite } = await createInvite(gid, adminSession);
      expect(res.status).toBe(200);
      expect(invite?.code).toMatch(/^[a-z2-9]{12}$/);
      expect(invite?.expiresAt).toBeNull();

      const opened = await open(invite?.code ?? "", await visitor());
      expect(opened.status).toBe(200);
      expect(await opened.json()).toMatchObject({
        group: { id: gid, name: "Club" },
        member: false,
      });

      // Admins see it in the snapshot; other members don't.
      const snap = await api(`/api/groups/${gid}`, { session });
      expect(await snap.json()).toMatchObject({ invite });
      const rec = await api(`/api/groups/${gid}`, {
        session: await member(gid, "recorder"),
      });
      expect(await rec.json()).not.toHaveProperty("invite");
    });

    it("recorders and viewers can't manage the link", async () => {
      const { gid } = await owner();
      for (const role of ["recorder", "viewer"] as const) {
        const s = await member(gid, role);
        expect((await createInvite(gid, s)).res.status).toBe(403);
        expect(
          (
            await api(`/api/groups/${gid}/invite`, {
              method: "DELETE",
              session: s,
            })
          ).status,
        ).toBe(403);
      }
    });
  },
);

describe(
  "JOIN-002: invite links can have an expiry",
  { tags: ["JOIN-002"] },
  () => {
    it("works until the expiry, then stops", async () => {
      const { gid, session } = await owner();
      const { invite } = await createInvite(gid, session, { expiresInDays: 7 });
      const days =
        (Date.parse(invite?.expiresAt ?? "") - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThanOrEqual(7);
      const code = invite?.code ?? "";
      const someone = await visitor();
      expect((await open(code, someone)).status).toBe(200);

      // Time passes: move the expiry into the past.
      await db
        .update(groups)
        .set({ inviteExpiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(groups.id, gid));
      expect((await open(code, someone)).status).toBe(404);
    });
  },
);

describe(
  "JOIN-003: regenerating or revoking the link invalidates the old one",
  { tags: ["JOIN-003"] },
  () => {
    it("regenerate: only the new code works; revoke: none does", async () => {
      const { gid, session } = await owner();
      const someone = await visitor();
      const first = (await createInvite(gid, session)).invite?.code ?? "";
      const second = (await createInvite(gid, session)).invite?.code ?? "";
      expect(second).not.toBe(first);
      expect((await open(first, someone)).status).toBe(404);
      expect((await open(second, someone)).status).toBe(200);

      const revoked = await api(`/api/groups/${gid}/invite`, {
        method: "DELETE",
        session,
      });
      expect(await revoked.json()).toEqual({ invite: null });
      expect((await open(second, someone)).status).toBe(404);
    });
  },
);

describe(
  "AUDIT-009: settings and invite changes are audited",
  { tags: ["AUDIT-009"] },
  () => {
    it("create, regenerate and revoke are audited without the code", async () => {
      const { gid, session } = await owner();
      const { invite } = await createInvite(gid, session, { expiresInDays: 1 });
      await createInvite(gid, session);
      await api(`/api/groups/${gid}/invite`, { method: "DELETE", session });
      // Revoking again is a no-op, not another event.
      await api(`/api/groups/${gid}/invite`, { method: "DELETE", session });
      const events = await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.groupId, gid),
            eq(auditEvents.entityType, "group"),
          ),
        );
      const invites = events.filter((e) => e.action.startsWith("invite."));
      expect(invites.map((e) => [e.action, e.after])).toEqual([
        ["invite.created", { expiresAt: invite?.expiresAt }],
        ["invite.regenerated", { expiresAt: null }],
        ["invite.revoked", null],
      ]);
      expect(JSON.stringify(events)).not.toContain(invite?.code);
    });
  },
);

describe("GET /invites/:code", () => {
  it("needs a signed-in user", async () => {
    const { gid, session } = await owner();
    const code = (await createInvite(gid, session)).invite?.code ?? "";
    expect((await open(code)).status).toBe(401);
  });

  it("an unknown code is the same 404 as an expired one, with no group details", async () => {
    const res = await open("nosuchcode22", await visitor());
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("Club");
  });
});
