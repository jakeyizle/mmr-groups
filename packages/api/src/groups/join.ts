import { nameSchema, newId, type Role } from "@mmr/core";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { isUniqueViolation } from "../db/errors";
import { guardedBatch } from "../db/guarded-batch";
import { players } from "../db/schema";
import type { AppEnv } from "../env";
import { apiError } from "../errors";
import { validate } from "../validate";
import type { GroupEnv, Player } from "./access";
import { groupForInvite } from "./invite";
import {
  insertPlayerWhere,
  MAX_PLAYERS,
  NAME_INDEX,
  nameTaken,
} from "./players";

/** Unique (group, user): a user has at most one player per group. */
const USER_INDEX = "players.user_id";

const claimSchema = z.union([
  z.strictObject({ playerId: z.string().min(1) }),
  z.strictObject({ newPlayerName: nameSchema }),
]);

/** `POST /invites/:code/claim` (JOIN-005/006/013). */
export const claimRoutes = new Hono<AppEnv>().post(
  "/:code/claim",
  validate("json", claimSchema),
  async (c) => {
    const db = c.get("db");
    const user = c.get("user");
    if (!user) return apiError(c, 401, "unauthenticated", "Sign in required");
    const group = await groupForInvite(db, c.req.param("code"));
    if (!group) {
      return apiError(
        c,
        404,
        "invalid_invite",
        "This invite link is no longer valid",
      );
    }
    // VIS-008: the demo group is managed by site admins only.
    if (group.isDemo) {
      return apiError(c, 403, "demo", "The demo group can't be joined");
    }
    const existing = await db.query.players.findFirst({
      where: and(eq(players.groupId, group.id), eq(players.userId, user.id)),
    });
    // JOIN-008: already a member, nothing to claim.
    if (existing) return c.json({ groupId: group.id, playerId: existing.id });

    const input = c.req.valid("json");
    try {
      if ("playerId" in input) {
        const target = await db.query.players.findFirst({
          where: and(
            eq(players.id, input.playerId),
            eq(players.groupId, group.id),
          ),
        });
        if (!target) return apiError(c, 404, "not_found", "Player not found");
        // JOIN-013: first claim wins; the role stays as pre-assigned (JOIN-005).
        const ok = await guardedBatch(
          db,
          db
            .update(players)
            .set({ userId: user.id })
            .where(and(eq(players.id, target.id), isNull(players.userId))),
          {
            groupId: group.id,
            actorUserId: user.id,
            action: "player.claimed",
            entityType: "player",
            entityId: target.id,
            after: { linked: true, role: target.role },
          },
        );
        if (!ok) {
          return apiError(
            c,
            409,
            "claim_lost",
            "Someone else just claimed that player",
          );
        }
        return c.json({ groupId: group.id, playerId: target.id });
      }

      // JOIN-006: a new player with the group's default role.
      const player: Player = {
        id: newId(),
        groupId: group.id,
        displayName: input.newPlayerName,
        role: group.defaultRole,
        userId: user.id,
        createdAt: new Date().toISOString(),
      };
      const fits = sql`(select count(*) from ${players} where ${players.groupId} = ${group.id}) < ${MAX_PLAYERS}`;
      const ok = await guardedBatch(db, insertPlayerWhere(db, player, fits), {
        groupId: group.id,
        actorUserId: user.id,
        action: "player.joined",
        entityType: "player",
        entityId: player.id,
        after: { displayName: player.displayName, role: player.role },
      });
      if (!ok) {
        return apiError(
          c,
          409,
          "player_limit",
          `A group has at most ${String(MAX_PLAYERS)} players`,
        );
      }
      return c.json({ groupId: group.id, playerId: player.id }, 201);
    } catch (err) {
      if (isUniqueViolation(err, NAME_INDEX)) {
        return apiError(c, 409, nameTaken.code, nameTaken.message);
      }
      // A concurrent claim or join by the same user.
      if (isUniqueViolation(err, USER_INDEX)) {
        return apiError(
          c,
          409,
          "already_member",
          "You're already in this group",
        );
      }
      throw err;
    }
  },
);

/** `POST /groups/:gid/leave` (JOIN-010/011). */
export const leaveRoutes = new Hono<GroupEnv>().post("/", async (c) => {
  const db = c.get("db");
  const group = c.get("group");
  const me = c.get("me");
  if (!me) return apiError(c, 403, "not_member", "You're not in this group");
  if (me.role === "owner") {
    return apiError(
      c,
      409,
      "owner_must_transfer",
      "Transfer ownership before leaving",
    );
  }
  // Same rule as unlinking: an unclaimed player can't be an admin.
  const role: Role = me.role === "admin" ? group.defaultRole : me.role;
  const ok = await guardedBatch(
    db,
    db
      .update(players)
      .set({ userId: null, role })
      .where(
        and(
          eq(players.id, me.id),
          eq(players.userId, me.userId ?? ""),
          eq(players.role, me.role),
        ),
      ),
    {
      groupId: group.id,
      actorUserId: c.get("user")?.id ?? null,
      action: "player.left",
      entityType: "player",
      entityId: me.id,
      before: { linked: true, role: me.role },
      after: { linked: false, role },
    },
  );
  if (!ok)
    return apiError(c, 409, "conflict", "Your player changed concurrently");
  return c.json({ ok: true });
});
