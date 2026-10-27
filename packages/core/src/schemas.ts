import { z } from "zod";

import type { DefaultRole, ScoringMode, TeamFormat, Visibility } from "./types";

// Limits: PLAN §3.

/** Group and player names: 1–40 chars after trimming. */
export const nameSchema = z.string().trim().min(1).max(40);

export const teamFormatSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("fixed"),
    teams: z.int().min(2).max(8),
    size: z.int().min(1).max(8),
  }),
  z.strictObject({ kind: z.literal("flexible") }),
]) satisfies z.ZodType<TeamFormat>;

const settings = {
  name: nameSchema,
  description: z.string().trim().max(500),
  visibility: z.enum(["private", "public"]) satisfies z.ZodType<Visibility>,
  scoringMode: z.enum([
    "required",
    "optional",
    "none",
  ]) satisfies z.ZodType<ScoringMode>,
  allowTies: z.boolean(),
  defaultRole: z.enum(["recorder", "viewer"]) satisfies z.ZodType<DefaultRole>,
};

export const createGroupSchema = z.strictObject({
  name: settings.name,
  teamFormat: teamFormatSchema,
  /** The creator's own player name. */
  playerName: nameSchema,
  description: settings.description.default(""),
  visibility: settings.visibility.default("private"),
  scoringMode: settings.scoringMode.default("optional"),
  allowTies: settings.allowTies.default(false),
  defaultRole: settings.defaultRole.default("recorder"),
});
export type CreateGroupInput = z.input<typeof createGroupSchema>;

/** Strict: the team format (and anything unknown) can't be changed after creation. */
export const updateGroupSchema = z
  .strictObject({
    ...settings,
    /** Changing it is site-admin only (VIS-013). */
    hiddenFromIndex: z.boolean(),
  })
  .partial();
export type UpdateGroupInput = z.input<typeof updateGroupSchema>;

/** Public group index (PLAN §8). Name sorts ascending by default, the rest descending. */
export const PUBLIC_GROUP_SORTS = [
  "name",
  "played",
  "matches",
  "players",
  "created",
] as const;
export type PublicGroupSort = (typeof PUBLIC_GROUP_SORTS)[number];

export const defaultSortDir = (sort: PublicGroupSort) =>
  sort === "name" ? "asc" : "desc";

export const publicGroupsQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(PUBLIC_GROUP_SORTS).default("name"),
  dir: z.enum(["asc", "desc"]).optional(),
  cursor: z.string().max(500).optional(),
});
export type PublicGroupsQuery = z.input<typeof publicGroupsQuerySchema>;

export const transferSchema = z.strictObject({ playerId: z.string() });

export const addPlayersSchema = z.strictObject({
  players: z
    .array(
      z.strictObject({
        name: nameSchema,
        /** Unclaimed players can only be recorder or viewer; defaults to the group's default role. */
        role: settings.defaultRole.optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type AddPlayersInput = z.input<typeof addPlayersSchema>;

export const updatePlayerSchema = z
  .strictObject({
    displayName: nameSchema,
    role: z.enum(["owner", "admin", "recorder", "viewer"]),
  })
  .partial()
  .refine((v) => v.displayName !== undefined || v.role !== undefined, {
    message: "Nothing to change",
  });
export type UpdatePlayerInput = z.input<typeof updatePlayerSchema>;
