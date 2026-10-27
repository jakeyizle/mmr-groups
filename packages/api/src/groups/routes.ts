import {
  createGroupSchema,
  newId,
  transferSchema,
  updateGroupSchema,
} from "@mmr/core";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { auditedBatch, guardedBatch } from "../db/guarded-batch";
import { groups, matches, players } from "../db/schema";
import type { AppEnv } from "../env";
import { apiError } from "../errors";
import { validate } from "../validate";
import {
  authorize,
  groupAccess,
  type GroupEnv,
  type Player,
  actorId,
} from "./access";
import { auditRoutes } from "./audit";
import { inviteRoutes, serializeInvite } from "./invite";
import { leaveRoutes } from "./join";
import { matchesRoutes } from "./matches";
import { playersRoutes } from "./players";
import {
  audienceFor,
  serializeGroup,
  serializeMatch,
  serializePlayer,
} from "./serialize";

const groupRoutes = new Hono<GroupEnv>()
  .use(groupAccess)
  /** Snapshot (PLAN §8): settings, players, matches, shaped per audience. */
  .get("/", async (c) => {
    const group = c.get("group");
    const audience = audienceFor(c.get("actor"));
    const etag = `"${String(group.version)}-${audience}"`;
    c.header("ETag", etag);
    c.header("Cache-Control", "private, no-cache");
    if (c.req.header("If-None-Match") === etag) return c.body(null, 304);

    const db = c.get("db");
    const [playerRows, matchRows] = await Promise.all([
      db
        .select()
        .from(players)
        .where(eq(players.groupId, group.id))
        .orderBy(asc(players.displayName)),
      db
        .select()
        .from(matches)
        .where(eq(matches.groupId, group.id))
        .orderBy(asc(matches.playedAt), asc(matches.id)),
    ]);
    const me = c.get("me");
    return c.json({
      group: serializeGroup(group),
      players: playerRows.map((p) => serializePlayer(p, audience)),
      matches: matchRows.map((m) => serializeMatch(m, audience)),
      me: me && { playerId: me.id, role: me.role },
      ...(audience === "admin" && {
        invite: serializeInvite(group),
        hiddenFromIndex: group.hiddenFromIndex,
      }),
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
      // VIS-013: owners can't hide or unhide, but may resend the current value.
      if (keys.includes("hiddenFromIndex") && !c.get("actor").isSiteAdmin) {
        return apiError(c, 403, "forbidden", "Only site admins can do that");
      }

      const before = Object.fromEntries(keys.map((k) => [k, group[k]]));
      const after = Object.fromEntries(keys.map((k) => [k, changes[k]]));
      await auditedBatch(
        db,
        [db.update(groups).set(after).where(eq(groups.id, group.id))],
        [
          {
            groupId: group.id,
            actorUserId: actorId(c),
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
      // Stryker disable next-line LogicalOperator: the row was just updated
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
        actorUserId: actorId(c),
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
      // Stryker disable all: only under concurrent writes; the guard is tested in guarded-batch.test.ts
      if (!ok)
        return apiError(c, 409, "conflict", "Ownership changed concurrently");
      // Stryker restore all
      return c.json({ ok: true });
    },
  )
  .route("/players", playersRoutes)
  .route("/matches", matchesRoutes)
  .route("/audit", auditRoutes)
  .route("/invite", inviteRoutes)
  .route("/leave", leaveRoutes);

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
    // Stryker disable next-line all: mutationsRequireUser answers first (AUTH-007)
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
