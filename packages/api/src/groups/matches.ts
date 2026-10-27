import {
  batchSchema,
  can,
  isTooFarInFuture,
  type MatchIssue,
  type MatchTeam,
  matchUpdateSchema,
  newId,
  validateMatch,
} from "@mmr/core";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";

import type { Db } from "../db";
import {
  type AuditInput,
  auditedBatch,
  guardedBatch,
} from "../db/guarded-batch";
import { matches, players } from "../db/schema";
import { apiError } from "../errors";
import { validate } from "../validate";
import { authorize, type GroupEnv, actorId } from "./access";
import { serializeMatch } from "./serialize";

type Match = typeof matches.$inferSelect;

async function groupPlayerIds(db: Db, groupId: string) {
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.groupId, groupId));
  return new Set(rows.map((p) => p.id));
}

/** Player references are the API's job; core doesn't know the group's players. */
function unknownPlayers(
  teams: { playerIds: string[] }[],
  known: Set<string>,
): MatchIssue[] {
  return teams.flatMap((t, ti) =>
    t.playerIds.flatMap((pid, pi): MatchIssue[] =>
      known.has(pid)
        ? []
        : [
            {
              path: ["teams", ti, "playerIds", pi],
              code: "unknown_player",
              message: "Not a player in this group",
            },
          ],
    ),
  );
}

/** `If-Match: "<version>"` (quotes optional); undefined when absent or malformed. */
function ifMatch(c: Context) {
  const raw = c.req.header("If-Match")?.replaceAll('"', "").trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
}

const stale = (c: Context, current: Match | undefined) =>
  apiError(c, 412, "stale", "This match changed since you opened it", {
    // Stryker disable next-line StringLiteral: any audience but "public" gets member fields
    match: current ? serializeMatch(current) : null,
  });

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export const matchesRoutes = new Hono<GroupEnv>()
  .post(
    "/",
    authorize("match.record"),
    validate("json", batchSchema),
    async (c) => {
      const db = c.get("db");
      const group = c.get("group");
      const now = new Date();
      const known = await groupPlayerIds(db, group.id);

      // All-or-nothing (MATCH-003): every match is checked before anything is written.
      const issues: MatchIssue[] = [];
      const rows: Match[] = [];
      c.req.valid("json").matches.forEach((input, i) => {
        const at = (issue: MatchIssue): MatchIssue => ({
          ...issue,
          path: ["matches", i, ...issue.path],
        });
        issues.push(...unknownPlayers(input.teams, known).map(at));
        // Current settings apply to new matches (GROUP-011).
        const result = validateMatch(input, group, now);
        if (!result.ok) {
          issues.push(...result.issues.map(at));
          return;
        }
        rows.push({
          id: newId(),
          groupId: group.id,
          ...result.match,
          recordedByPlayerId: c.get("me")?.id ?? null,
          version: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      });
      if (issues.length > 0) {
        return apiError(c, 400, "invalid", "Validation failed", issues);
      }

      // AUDIT-007: one event per match; AUDIT-002: same batch as the inserts.
      const audits = rows.map((m): AuditInput => ({
        groupId: group.id,
        actorUserId: actorId(c),
        action: "match.created",
        entityType: "match",
        entityId: m.id,
        after: { playedAt: m.playedAt, teams: m.teams, notes: m.notes },
      }));
      await auditedBatch(
        db,
        rows.map((m) => db.insert(matches).values(m)),
        audits,
      );
      return c.json({ matches: rows.map((m) => serializeMatch(m)) }, 201);
    },
  )
  .patch("/:mid", validate("json", matchUpdateSchema), async (c) => {
    const db = c.get("db");
    const group = c.get("group");
    const match = await db.query.matches.findFirst({
      where: and(
        eq(matches.id, c.req.param("mid")),
        eq(matches.groupId, group.id),
      ),
    });
    if (!match) return apiError(c, 404, "not_found", "Match not found");
    if (!can(c.get("actor"), "match.edit", match)) {
      return apiError(c, 403, "forbidden", "Not allowed");
    }
    const version = ifMatch(c);
    if (version === undefined) {
      return apiError(c, 428, "version_required", "If-Match is required");
    }
    // Stryker disable next-line ConditionalExpression: the guarded write rejects a stale version too; this answers early
    if (version !== match.version) return stale(c, match);

    const input = c.req.valid("json");
    const now = new Date();
    const next: Pick<Match, "playedAt" | "teams" | "notes"> = {
      playedAt: input.playedAt
        ? new Date(input.playedAt).toISOString()
        : match.playedAt,
      teams: match.teams,
      notes: input.notes ?? match.notes,
    };
    // EDIT-008/011: only changed fields must meet the current settings.
    if (input.teams) {
      const known = await groupPlayerIds(db, group.id);
      const issues = unknownPlayers(input.teams, known);
      const result = validateMatch(
        {
          playedAt: next.playedAt,
          teams: input.teams,
          notes: next.notes,
        },
        group,
        now,
      );
      if (!result.ok) issues.push(...result.issues);
      if (issues.length > 0) {
        return apiError(c, 400, "invalid", "Validation failed", issues);
      }
      // Stryker disable next-line ConditionalExpression: an invalid result returned above
      next.teams = result.ok ? result.match.teams : match.teams;
    } else if (input.playedAt && isTooFarInFuture(next.playedAt, now)) {
      return apiError(c, 400, "invalid", "Validation failed", [
        {
          path: ["playedAt"],
          code: "too_far_in_future",
          message: "Can't be more than 24 hours from now",
        },
      ]);
    }

    const keys = (["playedAt", "teams", "notes"] as const).filter(
      (k) => !sameJson(next[k], match[k]),
    );
    if (keys.length === 0) {
      return c.json({ match: serializeMatch(match) });
    }
    const pick = (m: typeof next) =>
      Object.fromEntries(keys.map((k) => [k, m[k]]));
    const updated: Match = {
      ...match,
      ...next,
      version: match.version + 1,
      updatedAt: now.toISOString(),
    };
    const ok = await guardedBatch(
      db,
      db
        .update(matches)
        .set({
          ...next,
          version: updated.version,
          updatedAt: updated.updatedAt,
        })
        .where(and(eq(matches.id, match.id), eq(matches.version, version))),
      {
        groupId: group.id,
        actorUserId: actorId(c),
        action: "match.updated",
        entityType: "match",
        entityId: match.id,
        // playedAt always included as context for the audit line.
        before: { playedAt: match.playedAt, ...pick(match) },
        after: pick(next),
      },
    );
    // Stryker disable all: only under concurrent writes; the guard is tested in guarded-batch.test.ts
    if (!ok) {
      return stale(
        c,
        await db.query.matches.findFirst({ where: eq(matches.id, match.id) }),
      );
    }
    // Stryker restore all
    return c.json({ match: serializeMatch(updated) });
  })
  .delete("/:mid", async (c) => {
    const db = c.get("db");
    const group = c.get("group");
    const match = await db.query.matches.findFirst({
      where: and(
        eq(matches.id, c.req.param("mid")),
        eq(matches.groupId, group.id),
      ),
    });
    if (!match) return apiError(c, 404, "not_found", "Match not found");
    if (!can(c.get("actor"), "match.delete", match)) {
      return apiError(c, 403, "forbidden", "Not allowed");
    }
    const version = ifMatch(c);
    if (version === undefined) {
      return apiError(c, 428, "version_required", "If-Match is required");
    }
    // Stryker disable next-line ConditionalExpression: the guarded write rejects a stale version too; this answers early
    if (version !== match.version) return stale(c, match);

    const ok = await guardedBatch(
      db,
      db
        .delete(matches)
        .where(and(eq(matches.id, match.id), eq(matches.version, version))),
      {
        groupId: group.id,
        actorUserId: actorId(c),
        action: "match.deleted",
        entityType: "match",
        entityId: match.id,
        before: {
          playedAt: match.playedAt,
          teams: match.teams satisfies MatchTeam[],
          notes: match.notes,
        },
      },
    );
    // Stryker disable all: only under concurrent writes; the guard is tested in guarded-batch.test.ts
    if (!ok) {
      return stale(
        c,
        await db.query.matches.findFirst({ where: eq(matches.id, match.id) }),
      );
    }
    // Stryker restore all
    return c.json({ ok: true });
  });
