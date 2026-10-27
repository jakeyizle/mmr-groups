import { batchSchema, type MatchIssue, newId, validateMatch } from "@mmr/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { type AuditInput, auditedBatch } from "../db/guarded-batch";
import { matches, players } from "../db/schema";
import { apiError } from "../errors";
import { validate } from "../validate";
import { authorize, type GroupEnv } from "./access";
import { serializeMatch } from "./serialize";

type Match = typeof matches.$inferSelect;

export const matchesRoutes = new Hono<GroupEnv>().post(
  "/",
  authorize("match.record"),
  validate("json", batchSchema),
  async (c) => {
    const db = c.get("db");
    const group = c.get("group");
    const now = new Date();
    const known = new Set(
      (
        await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.groupId, group.id))
      ).map((p) => p.id),
    );

    // All-or-nothing (MATCH-003): every match is checked before anything is written.
    const issues: MatchIssue[] = [];
    const rows: Match[] = [];
    c.req.valid("json").matches.forEach((input, i) => {
      const at = (issue: MatchIssue): MatchIssue => ({
        ...issue,
        path: ["matches", i, ...issue.path],
      });
      input.teams.forEach((t, ti) => {
        t.playerIds.forEach((pid, pi) => {
          if (!known.has(pid)) {
            issues.push(
              at({
                path: ["teams", ti, "playerIds", pi],
                code: "unknown_player",
                message: "Not a player in this group",
              }),
            );
          }
        });
      });
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
      actorUserId: c.get("user")?.id ?? null,
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
    return c.json(
      {
        matches: rows.map((m) => serializeMatch(m, "member")),
      },
      201,
    );
  },
);
