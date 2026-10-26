import { type Action, type Actor, can, type Target } from "@mmr/core";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { groups, players } from "../db/schema";
import type { AppEnv } from "../env";
import { apiError } from "../errors";

export type Group = typeof groups.$inferSelect;
export type Player = typeof players.$inferSelect;

export interface GroupEnv extends AppEnv {
  Variables: AppEnv["Variables"] & {
    group: Group;
    /** The signed-in user's player in this group, if any. */
    me: Player | null;
    actor: Actor;
  };
}

/**
 * Resolves `(user, group, player, role)` for `/groups/:gid/*`. A private group the
 * user can't view gets the same 404 as a missing one.
 */
export const groupAccess = createMiddleware<GroupEnv>(async (c, next) => {
  const db = c.get("db");
  const user = c.get("user");
  const gid = c.req.param("gid") ?? "";

  const group = await db.query.groups.findFirst({ where: eq(groups.id, gid) });
  const me =
    group && user
      ? ((await db.query.players.findFirst({
          where: and(eq(players.groupId, gid), eq(players.userId, user.id)),
        })) ?? null)
      : null;
  const actor: Actor = {
    role: me?.role ?? null,
    playerId: me?.id ?? null,
    isSiteAdmin: user?.isSiteAdmin ?? false,
  };

  if (!group || (group.visibility === "private" && !can(actor, "group.view"))) {
    return apiError(c, 404, "not_found", "Group not found");
  }
  c.set("group", group);
  c.set("me", me);
  c.set("actor", actor);
  await next();
});

/** 403 unless the actor may perform `action` (ROLE-009). */
export function authorize(action: Action, target?: Target) {
  return createMiddleware<GroupEnv>(async (c, next) => {
    if (!can(c.get("actor"), action, target)) {
      return apiError(c, 403, "forbidden", "Not allowed");
    }
    await next();
  });
}
