import {
  createGroupSchema,
  newId,
  transferSchema,
  updateGroupSchema,
} from "@mmr/core";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { auditedBatch, guardedBatch } from "../db/guarded-batch";
import { groups, players } from "../db/schema";
import type { AppEnv } from "../env";
import { apiError } from "../errors";
import { validate } from "../validate";
import { authorize, groupAccess, type GroupEnv, type Player } from "./access";
import { playersRoutes } from "./players";
import { serializeGroup, serializePlayer } from "./serialize";

const groupRoutes = new Hono<GroupEnv>()
  .use(groupAccess)
  // Minimal member read until the M2 snapshot replaces it.
  .get("/", async (c) => {
    const group = c.get("group");
    const rows = await c
      .get("db")
      .select()
      .from(players)
      .where(eq(players.groupId, group.id))
      .orderBy(asc(players.displayName));
    const me = c.get("me");
    return c.json({
      group: serializeGroup(group),
      players: rows.map(serializePlayer),
      me: me && { playerId: me.id, role: me.role },
    });
  })
  .patch(
    "/",
    authorize("group.editSettings"),
    validate("json", updateGroupSchema),
    async (c) => {
      const db = c.get("db");
      const group = c.get("group");
      const changes = c.req.valid("json");
      const keys = (Object.keys(changes) as (keyof typeof changes)[]).filter(
        (k) => changes[k] !== group[k],
      );
      if (keys.length === 0) return c.json({ group: serializeGroup(group) });

      const before = Object.fromEntries(keys.map((k) => [k, group[k]]));
      const after = Object.fromEntries(keys.map((k) => [k, changes[k]]));
      await auditedBatch(
        db,
        [db.update(groups).set(after).where(eq(groups.id, group.id))],
        [
          {
            groupId: group.id,
            actorUserId: c.get("user")?.id ?? null,
            action: "group.updated",
            entityType: "group",
            entityId: group.id,
            before,
            after,
          },
        ],
      );
      const updated = await db.query.groups.findFirst({
        where: eq(groups.id, group.id),
      });
      return c.json({ group: serializeGroup(updated ?? group) });
    },
  )
  .delete("/", authorize("group.delete"), async (c) => {
    // Cascades to players, matches and audit events (GROUP-007).
    await c
      .get("db")
      .delete(groups)
      .where(eq(groups.id, c.get("group").id));
    return c.json({ ok: true });
  })
  .post(
    "/transfer",
    authorize("group.transfer"),
    validate("json", transferSchema),
    async (c) => {
      const db = c.get("db");
      const group = c.get("group");
      const { playerId } = c.req.valid("json");
      const inGroup = (id: string) =>
        db.query.players.findFirst({
          where: and(eq(players.groupId, group.id), eq(players.id, id)),
        });

      const target = await inGroup(playerId);
      if (!target) return apiError(c, 404, "not_found", "Player not found");
      if (target.userId === null) {
        return apiError(
          c,
          400,
          "not_linked",
          "Ownership can only go to a linked player",
        );
      }
      const owner = await db.query.players.findFirst({
        where: and(eq(players.groupId, group.id), eq(players.role, "owner")),
      });
      if (!owner)
        return apiError(c, 400, "no_owner", "This group has no owner");
      if (owner.id === target.id) {
        return apiError(c, 400, "already_owner", "Player is already the owner");
      }

      const audit = (p: Player, to: Player["role"]) => ({
        groupId: group.id,
        actorUserId: c.get("user")?.id ?? null,
        action: "player.roleChanged",
        entityType: "player",
        entityId: p.id,
        before: { role: p.role },
        after: { role: to },
      });
      const ok = await guardedBatch(
        db,
        db
          .update(players)
          .set({ role: "admin" })
          .where(and(eq(players.id, owner.id), eq(players.role, "owner"))),
        [audit(owner, "admin"), audit(target, "owner")],
        (committed) => [
          db
            .update(players)
            .set({ role: "owner" })
            .where(
              sql`${and(eq(players.id, target.id), sql`${players.userId} is not null`)} and ${committed}`,
            ),
        ],
      );
      if (!ok)
        return apiError(c, 409, "conflict", "Ownership changed concurrently");
      return c.json({ ok: true });
    },
  )
  .route("/players", playersRoutes);

export const groupsRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ groups: [] });
    const rows = await c
      .get("db")
      .select({
        id: groups.id,
        name: groups.name,
        visibility: groups.visibility,
        role: players.role,
      })
      .from(groups)
      .innerJoin(players, eq(players.groupId, groups.id))
      .where(eq(players.userId, user.id))
      .orderBy(asc(groups.name));
    return c.json({ groups: rows });
  })
  .post("/", validate("json", createGroupSchema), async (c) => {
    const db = c.get("db");
    const user = c.get("user");
    if (!user) return apiError(c, 401, "unauthenticated", "Sign in required");
    const { playerName, ...settings } = c.req.valid("json");
    const now = new Date().toISOString();
    const group = { id: newId(), ...settings, createdAt: now };
    const owner = {
      id: newId(),
      groupId: group.id,
      displayName: playerName,
      role: "owner" as const,
      userId: user.id,
      createdAt: now,
    };
    const audit = { groupId: group.id, actorUserId: user.id };

    await auditedBatch(
      db,
      [db.insert(groups).values(group), db.insert(players).values(owner)],
      [
        {
          ...audit,
          action: "group.created",
          entityType: "group",
          entityId: group.id,
          after: settings,
        },
        {
          ...audit,
          action: "player.created",
          entityType: "player",
          entityId: owner.id,
          after: { displayName: owner.displayName, role: owner.role },
        },
      ],
      { bump: false },
    );
    return c.json({ id: group.id, playerId: owner.id }, 201);
  })
  .route("/:gid", groupRoutes);
