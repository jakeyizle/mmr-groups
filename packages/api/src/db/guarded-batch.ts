import { newId } from "@mmr/core";
import { eq, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Db } from ".";
import { auditEvents, groups } from "./schema";

export interface AuditInput {
  groupId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Optimistic-concurrency write in one atomic `db.batch()`:
 *
 * 1. `guard`: an UPDATE/DELETE that must affect exactly one row, e.g.
 *    `… WHERE id = ? AND version = ?`.
 * 2. The audit row, inserted only `WHERE changes() = 1` (changes() = the guard).
 *    The audit row is the commit marker.
 * 3. `then(committed)` statements and the `groups.version` bump, each conditioned on
 *    `committed` (the marker exists). Conditioning on the marker rather than on
 *    `changes()` keeps it correct when a follow-up touches 0 or many rows.
 *
 * Returns false, having written nothing, when the guard matched no row (stale
 * version or concurrently deleted).
 */
export async function guardedBatch(
  db: Db,
  guard: BatchItem<"sqlite">,
  audit: AuditInput,
  then: (committed: SQL) => BatchItem<"sqlite">[] = () => [],
): Promise<boolean> {
  const auditId = newId();
  const committed = sql`exists (select 1 from ${auditEvents} where ${auditEvents.id} = ${auditId})`;
  const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

  const [, inserted] = await db.batch([
    guard,
    // Columns in table order.
    db.insert(auditEvents).select(sql`
      select ${auditId}, ${audit.groupId}, ${audit.actorUserId}, ${audit.action}, ${audit.entityType},
        ${audit.entityId}, ${json(audit.before)}, ${json(audit.after)}, ${new Date().toISOString()}
      where changes() = 1`),
    ...then(committed),
    db
      .update(groups)
      .set({ version: sql`${groups.version} + 1` })
      .where(sql`${eq(groups.id, audit.groupId)} and ${committed}`),
  ]);
  return inserted.meta.changes === 1;
}
