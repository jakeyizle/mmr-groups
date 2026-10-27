import { and, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { auditEvents, players } from "../db/schema";
import { validate } from "../validate";
import { authorize, type GroupEnv } from "./access";

export const AUDIT_PAGE_SIZE = 50;

/**
 * AUDIT-003/004/005: members only (`group.view` is false for non-members, so a
 * public group's visitors get 403). Newest first, keyset-paged on the ULID id.
 * Read-only by design: there are no routes that change audit rows (AUDIT-006).
 */
export const auditRoutes = new Hono<GroupEnv>().get(
  "/",
  authorize("group.view"),
  validate("query", z.object({ cursor: z.string().optional() })),
  async (c) => {
    const group = c.get("group");
    const { cursor } = c.req.valid("query");
    const rows = await c
      .get("db")
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        before: auditEvents.before,
        after: auditEvents.after,
        createdAt: auditEvents.createdAt,
        // The actor as a player in this group; never their account details.
        actorName: players.displayName,
      })
      .from(auditEvents)
      .leftJoin(
        players,
        and(
          eq(players.groupId, auditEvents.groupId),
          eq(players.userId, auditEvents.actorUserId),
        ),
      )
      .where(
        and(
          eq(auditEvents.groupId, group.id),
          cursor ? lt(auditEvents.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(auditEvents.id))
      .limit(AUDIT_PAGE_SIZE + 1);

    const page = rows.slice(0, AUDIT_PAGE_SIZE);
    return c.json({
      events: page,
      nextCursor:
        rows.length > AUDIT_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
    });
  },
);
