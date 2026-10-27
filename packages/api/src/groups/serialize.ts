import { type Actor, can, type MatchTeam, type Role } from "@mmr/core";

import type { matches } from "../db/schema";
import type { Group, Player } from "./access";

type Match = typeof matches.$inferSelect;

/**
 * PLAN §8 audiences. Never, for any audience: emails, Google names/avatars, user IDs.
 * - public: settings, player names, matches without who recorded them (VIS-006)
 * - member: + roles, claimed flag, recordedByPlayerId, my player (VIS-007)
 * - admin: + invite code/expiry (M4)
 */
export type Audience = "public" | "member" | "admin";

export function audienceFor(actor: Actor): Audience {
  if (can(actor, "group.editSettings")) return "admin";
  return actor.role ? "member" : "public";
}

export function serializeGroup(g: Group) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    visibility: g.visibility,
    isDemo: g.isDemo,
    teamFormat: g.teamFormat,
    scoringMode: g.scoringMode,
    allowTies: g.allowTies,
    defaultRole: g.defaultRole,
    ratingConfig: g.ratingConfig,
    version: g.version,
    createdAt: g.createdAt,
  };
}

/** Member-only fields are optional so every audience shares one response type. */
export interface SnapshotPlayer {
  id: string;
  displayName: string;
  role?: Role;
  linked?: boolean;
}

export interface SnapshotMatch {
  id: string;
  playedAt: string;
  teams: MatchTeam[];
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  recordedByPlayerId?: string | null;
}

/** Never exposes user IDs: only whether the player is claimed. */
export function serializePlayer(
  p: Player,
  // Stryker disable next-line StringLiteral: any audience but "public" gets member fields
  audience: Audience = "member",
): SnapshotPlayer {
  const base = { id: p.id, displayName: p.displayName };
  if (audience === "public") return base;
  return { ...base, role: p.role, linked: p.userId !== null };
}

export function serializeMatch(
  m: Match,
  // Stryker disable next-line StringLiteral: any audience but "public" gets member fields
  audience: Audience = "member",
): SnapshotMatch {
  const base = {
    id: m.id,
    playedAt: m.playedAt,
    teams: m.teams,
    notes: m.notes,
    version: m.version,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
  if (audience === "public") return base;
  return { ...base, recordedByPlayerId: m.recordedByPlayerId };
}
