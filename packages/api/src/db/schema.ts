import type {
  DefaultRole,
  MatchTeam,
  RatingConfig,
  Role,
  ScoringMode,
  TeamFormat,
  Visibility,
} from "@mmr/core";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// IDs are monotonic ULIDs; timestamps are ISO strings (UTC), set by the app.

export const users = sqliteTable("users", {
  id: text().primaryKey(),
  googleSub: text().notNull().unique(),
  email: text().notNull(),
  name: text().notNull(),
  isSiteAdmin: integer({ mode: "boolean" }).notNull().default(false),
  createdAt: text().notNull(),
});

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    /** sha256 of the session token */
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text().notNull(),
    createdAt: text().notNull(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const groups = sqliteTable("groups", {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(""),
  visibility: text().$type<Visibility>().notNull().default("private"),
  isDemo: integer({ mode: "boolean" }).notNull().default(false),
  teamFormat: text({ mode: "json" }).$type<TeamFormat>().notNull(),
  scoringMode: text().$type<ScoringMode>().notNull(),
  allowTies: integer({ mode: "boolean" }).notNull(),
  defaultRole: text().$type<DefaultRole>().notNull(),
  /** Overrides of core's defaults. */
  ratingConfig: text({ mode: "json" })
    .$type<Partial<RatingConfig>>()
    .notNull()
    .default({}),
  inviteCode: text().unique(),
  inviteExpiresAt: text(),
  /** Bumped on every change; snapshot ETag. */
  version: integer().notNull().default(1),
  createdAt: text().notNull(),
});

export const players = sqliteTable(
  "players",
  {
    id: text().primaryKey(),
    groupId: text()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    displayName: text().notNull(),
    role: text().$type<Role>().notNull(),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: text().notNull(),
  },
  (t) => [
    uniqueIndex("players_group_user_uq").on(t.groupId, t.userId),
    uniqueIndex("players_group_name_uq").on(
      t.groupId,
      sql`lower(${t.displayName})`,
    ),
    index("players_user_idx").on(t.userId),
  ],
);

export const matches = sqliteTable(
  "matches",
  {
    id: text().primaryKey(),
    groupId: text()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    playedAt: text().notNull(),
    teams: text({ mode: "json" }).$type<MatchTeam[]>().notNull(),
    notes: text().notNull().default(""),
    recordedByPlayerId: text().references(() => players.id, {
      onDelete: "set null",
    }),
    version: integer().notNull().default(1),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (t) => [index("matches_group_played_idx").on(t.groupId, t.playedAt, t.id)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text().primaryKey(),
    groupId: text()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    actorUserId: text().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    before: text({ mode: "json" }),
    after: text({ mode: "json" }),
    createdAt: text().notNull(),
  },
  (t) => [index("audit_events_group_idx").on(t.groupId, t.id)],
);
