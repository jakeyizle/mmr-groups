import { and, eq, gt, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { Db } from "../db";
import { auditedBatch } from "../db/guarded-batch";
import { groups } from "../db/schema";
import type { AppEnv } from "../env";
import { apiError } from "../errors";
import { validate } from "../validate";
import { authorize, type Group, type GroupEnv } from "./access";

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i
const CODE_LENGTH = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes]
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
}

export function serializeInvite(g: Group) {
  return g.inviteCode
    ? { code: g.inviteCode, expiresAt: g.inviteExpiresAt }
    : null;
}

/** JOIN-002/003/009: the group for a code that is current and unexpired, else undefined. */
export async function groupForInvite(db: Db, code: string, now = new Date()) {
  return db.query.groups.findFirst({
    where: and(
      eq(groups.inviteCode, code),
      or(
        isNull(groups.inviteExpiresAt),
        gt(groups.inviteExpiresAt, now.toISOString()),
      ),
    ),
  });
}

const inviteSchema = z.strictObject({
  /** Omitted or null: never expires. */
  expiresInDays: z.int().min(1).max(365).nullable().optional(),
});

/** `/groups/:gid/invite`: (re)generate or revoke the group's single invite link. */
export const inviteRoutes = new Hono<GroupEnv>()
  .put(
    "/",
    authorize("invite.manage"),
    validate("json", inviteSchema),
    async (c) => {
      const db = c.get("db");
      const group = c.get("group");
      const { expiresInDays } = c.req.valid("json");
      const code = generateCode();
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * DAY_MS).toISOString()
        : null;
      await auditedBatch(
        db,
        [
          db
            .update(groups)
            .set({ inviteCode: code, inviteExpiresAt: expiresAt })
            .where(eq(groups.id, group.id)),
        ],
        [
          {
            groupId: group.id,
            actorUserId: c.get("user")?.id ?? null,
            action: group.inviteCode ? "invite.regenerated" : "invite.created",
            entityType: "group",
            entityId: group.id,
            // Never the code itself: the audit log is readable by every member.
            after: { expiresAt },
          },
        ],
      );
      return c.json({ invite: { code, expiresAt } });
    },
  )
  .delete("/", authorize("invite.manage"), async (c) => {
    const db = c.get("db");
    const group = c.get("group");
    if (group.inviteCode) {
      await auditedBatch(
        db,
        [
          db
            .update(groups)
            .set({ inviteCode: null, inviteExpiresAt: null })
            .where(eq(groups.id, group.id)),
        ],
        [
          {
            groupId: group.id,
            actorUserId: c.get("user")?.id ?? null,
            action: "invite.revoked",
            entityType: "group",
            entityId: group.id,
          },
        ],
      );
    }
    return c.json({ invite: null });
  });

/** `/invites/:code`: what a signed-in visitor of an invite link sees (PLAN §8). */
export const invitesRoutes = new Hono<AppEnv>().get("/:code", async (c) => {
  const user = c.get("user");
  if (!user) return apiError(c, 401, "unauthenticated", "Sign in required");
  const db = c.get("db");
  const group = await groupForInvite(db, c.req.param("code"));
  // JOIN-009: revoked, expired and unknown codes look the same, with no group details.
  if (!group)
    return apiError(
      c,
      404,
      "invalid_invite",
      "This invite link is no longer valid",
    );

  const rows = await db.query.players.findMany({
    where: (p, { eq }) => eq(p.groupId, group.id),
    orderBy: (p, { asc }) => asc(p.displayName),
  });
  const member = rows.some((p) => p.userId === user.id);
  return c.json({
    group: { id: group.id, name: group.name },
    // JOIN-008: members go straight to the group.
    member,
    // JOIN-007: only unclaimed players are offered.
    players: member
      ? []
      : rows
          .filter((p) => p.userId === null)
          .map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
  });
});
