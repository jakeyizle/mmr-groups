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

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

/** INSERT … SELECT of one audit row, written only `where` holds. */
function insertAudit(db: Db, id: string, audit: AuditInput, where: SQL) {
  // Columns in table order.
  return db.insert(auditEvents).select(sql`
    select ${id}, ${audit.groupId}, ${audit.actorUserId}, ${audit.action}, ${audit.entityType},
      ${audit.entityId}, ${json(audit.before)}, ${json(audit.after)}, ${new Date().toISOString()}
    where ${where}`);
}

const bumpVersion = (db: Db, groupId: string, where: SQL = sql`1`) =>
  db
    .update(groups)
    .set({ version: sql`${groups.version} + 1` })
    .where(sql`${eq(groups.id, groupId)} and ${where}`);

/**
 * A mutation, its audit rows and the `groups.version` bump in one atomic batch
 * (PLAN §5). `bump: false` for group creation, which starts at version 1.
 */
export async function auditedBatch(
  db: Db,
  statements: BatchItem<"sqlite">[],
  audits: AuditInput[],
  { bump = true }: { bump?: boolean } = {},
) {
  const [first] = audits;
  if (!first) throw new Error("auditedBatch needs at least one audit row");
  await db.batch([
    ...(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]),
    ...audits.map((a) => insertAudit(db, newId(), a, sql`1`)),
    ...(bump ? [bumpVersion(db, first.groupId)] : []),
  ]);
}

/**
 * Optimistic-concurrency write in one atomic `db.batch()`:
 *
 * 1. `guard`: an UPDATE/DELETE that must affect exactly one row, e.g.
 *    `… WHERE id = ? AND version = ?`.
 * 2. The first audit row, inserted only `WHERE changes() = 1` (changes() = the
 *    guard). It is the commit marker.
 * 3. `then(committed)` statements, any further audit rows and the `groups.version`
 *    bump, each conditioned on `committed` (the marker exists). Conditioning on the
 *    marker rather than on `changes()` keeps it correct when a follow-up touches 0 or
 *    many rows.
 *
 * Returns false, having written nothing, when the guard matched no row (stale
 * version or concurrently deleted).
 */
export async function guardedBatch(
  db: Db,
  guard: BatchItem<"sqlite">,
  audit: AuditInput | [AuditInput, ...AuditInput[]],
  then: (committed: SQL) => BatchItem<"sqlite">[] = () => [],
): Promise<boolean> {
  const [marker, ...more] = Array.isArray(audit) ? audit : [audit];
  const markerId = newId();
  const committed = sql`exists (select 1 from ${auditEvents} where ${auditEvents.id} = ${markerId})`;

  const [, inserted] = await db.batch([
    guard,
    insertAudit(db, markerId, marker, sql`changes() = 1`),
    ...then(committed),
    ...more.map((a) => insertAudit(db, newId(), a, committed)),
    bumpVersion(db, marker.groupId, committed),
  ]);
  return inserted.meta.changes === 1;
}
