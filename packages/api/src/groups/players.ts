import {
  addPlayersSchema,
  can,
  newId,
  type Role,
  updatePlayerSchema,
  validRoleFor,
} from "@mmr/core";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";

import { isUniqueViolation } from "../db/errors";
import { type AuditInput, guardedBatch } from "../db/guarded-batch";
import type { Db } from "../db";
import { matches, players } from "../db/schema";
import { apiError } from "../errors";
import { validate } from "../validate";
import { authorize, type GroupEnv, type Player } from "./access";
import { serializePlayer } from "./serialize";

export const MAX_PLAYERS = 200;

/** INSERT … SELECT of one player, written only `where` holds. Columns in table order. */
function insertPlayerWhere(db: Db, p: Player, where: SQL) {
  return db.insert(players).select(sql`
    select ${p.id}, ${p.groupId}, ${p.displayName}, ${p.role}, ${p.userId}, ${p.createdAt}
    where ${where}`);
}

/** PLAN §5: "player has matches" via json_each over each team's playerIds. */
const inAnyMatch = (groupId: string, playerId: string) => sql`exists (
  select 1 from ${matches}, json_each(${matches.teams}) t, json_each(t.value, '$.playerIds') p
  where ${matches.groupId} = ${groupId} and p.value = ${playerId})`;

const NAME_INDEX = "players_group_name_uq";
const nameTaken = { code: "name_taken", message: "That name is already taken" };

export const playersRoutes = new Hono<GroupEnv>()
  .post(
    "/",
    authorize("player.manage"),
    validate("json", addPlayersSchema),
    async (c) => {
      const db = c.get("db");
      const group = c.get("group");
      const now = new Date().toISOString();
      const added: Player[] = c.req.valid("json").players.map((p) => ({
        id: newId(),
        groupId: group.id,
        displayName: p.name,
        role: p.role ?? group.defaultRole,
        userId: null,
        createdAt: now,
      }));
      const [first, ...rest] = added as [Player, ...Player[]];
      const audits = added.map((p): AuditInput => ({
        groupId: group.id,
        actorUserId: c.get("user")?.id ?? null,
        action: "player.created",
        entityType: "player",
        entityId: p.id,
        after: { displayName: p.displayName, role: p.role },
      })) as [AuditInput, ...AuditInput[]];

      // All-or-nothing: the first insert carries the cap check (PLAYER-013); the rest
      // depend on it via guardedBatch's commit marker.
      const fits = sql`(select count(*) from ${players} where ${players.groupId} = ${group.id}) + ${added.length} <= ${MAX_PLAYERS}`;
      try {
        const ok = await guardedBatch(
          db,
          insertPlayerWhere(db, first, fits),
          audits,
          (committed) => rest.map((p) => insertPlayerWhere(db, p, committed)),
        );
        if (!ok) {
          return apiError(
            c,
            409,
            "player_limit",
            `A group has at most ${String(MAX_PLAYERS)} players`,
          );
        }
      } catch (err) {
        if (isUniqueViolation(err, NAME_INDEX)) {
          return apiError(c, 409, nameTaken.code, nameTaken.message);
        }
        throw err;
      }
      return c.json({ players: added.map((p) => serializePlayer(p)) }, 201);
    },
  )
  .patch("/:pid", validate("json", updatePlayerSchema), async (c) => {
    const db = c.get("db");
    const group = c.get("group");
    const actor = c.get("actor");
    const target = await db.query.players.findFirst({
      where: and(
        eq(players.groupId, group.id),
        eq(players.id, c.req.param("pid")),
      ),
    });
    if (!target) return apiError(c, 404, "not_found", "Player not found");

    const input = c.req.valid("json");
    const changes: Partial<Pick<Player, "displayName" | "role">> = {};
    if (
      input.displayName !== undefined &&
      input.displayName !== target.displayName
    ) {
      if (!can(actor, "player.manage"))
        return apiError(c, 403, "forbidden", "Not allowed");
      changes.displayName = input.displayName;
    }
    if (input.role !== undefined && input.role !== target.role) {
      if (
        !can(actor, "player.setRole", { from: target.role, to: input.role })
      ) {
        return apiError(c, 403, "forbidden", "Not allowed");
      }
      if (!validRoleFor({ linked: target.userId !== null }, input.role)) {
        return apiError(
          c,
          400,
          "invalid_role",
          "Unclaimed players can't be admins",
        );
      }
      changes.role = input.role;
    }
    if (Object.keys(changes).length === 0) {
      return c.json({ player: serializePlayer(target) });
    }

    const before = Object.fromEntries(
      Object.keys(changes).map((k) => [k, target[k as keyof typeof changes]]),
    );
    // Guarded on the role and link we checked, so a concurrent role change or unlink wins.
    const unchanged = and(
      eq(players.id, target.id),
      eq(players.role, target.role),
      target.userId === null
        ? isNull(players.userId)
        : eq(players.userId, target.userId),
    );
    try {
      const ok = await guardedBatch(
        db,
        db.update(players).set(changes).where(unchanged),
        {
          groupId: group.id,
          actorUserId: c.get("user")?.id ?? null,
          action: "player.updated",
          entityType: "player",
          entityId: target.id,
          before,
          after: changes,
        },
      );
      if (!ok)
        return apiError(c, 409, "conflict", "Player changed concurrently");
    } catch (err) {
      if (isUniqueViolation(err, NAME_INDEX)) {
        return apiError(c, 409, nameTaken.code, nameTaken.message);
      }
      throw err;
    }
    return c.json({ player: serializePlayer({ ...target, ...changes }) });
  })
  .delete("/:pid", authorize("player.manage"), async (c) => {
    const db = c.get("db");
    const group = c.get("group");
    const target = await db.query.players.findFirst({
      where: and(
        eq(players.groupId, group.id),
        eq(players.id, c.req.param("pid")),
      ),
    });
    if (!target) return apiError(c, 404, "not_found", "Player not found");
    // Removing a linked player also removes its user from the group: same rule as unlink.
    if (
      target.userId !== null &&
      !can(c.get("actor"), "player.unlink", { role: target.role })
    ) {
      return apiError(c, 403, "forbidden", "Not allowed");
    }

    const ok = await guardedBatch(
      db,
      db
        .delete(players)
        .where(
          and(
            eq(players.id, target.id),
            sql`not ${inAnyMatch(group.id, target.id)}`,
          ),
        ),
      {
        groupId: group.id,
        actorUserId: c.get("user")?.id ?? null,
        action: "player.deleted",
        entityType: "player",
        entityId: target.id,
        before: serializePlayer(target),
      },
    );
    if (!ok) {
      return apiError(
        c,
        409,
        "has_matches",
        "Players who appear in matches can't be removed. Rename them instead.",
      );
    }
    return c.json({ ok: true });
  })
  .post("/:pid/unlink", async (c) => {
    const db = c.get("db");
    const group = c.get("group");
    const target = await db.query.players.findFirst({
      where: and(
        eq(players.groupId, group.id),
        eq(players.id, c.req.param("pid")),
      ),
    });
    if (!target) return apiError(c, 404, "not_found", "Player not found");
    if (!can(c.get("actor"), "player.unlink", { role: target.role })) {
      return apiError(c, 403, "forbidden", "Not allowed");
    }
    if (target.userId === null) {
      return apiError(c, 400, "not_linked", "Player is not claimed");
    }

    // Admin requires a linked user, so an unlinked admin falls back to the default role.
    const role: Role =
      target.role === "admin" ? group.defaultRole : target.role;
    const ok = await guardedBatch(
      db,
      db
        .update(players)
        .set({ userId: null, role })
        .where(
          and(
            eq(players.id, target.id),
            eq(players.userId, target.userId),
            eq(players.role, target.role),
          ),
        ),
      {
        groupId: group.id,
        actorUserId: c.get("user")?.id ?? null,
        action: "player.unlinked",
        entityType: "player",
        entityId: target.id,
        before: { linked: true, role: target.role },
        after: { linked: false, role },
      },
    );
    if (!ok) return apiError(c, 409, "conflict", "Player changed concurrently");
    return c.json({
      player: serializePlayer({ ...target, userId: null, role }),
    });
  });
