import { z } from "zod";

import type { MatchTeam, ScoringMode, TeamFormat } from "./types";

// Limits: PLAN §3. Shape and limits here; group-dependent rules in validateMatch.

export const MAX_TEAMS = 8;
export const MAX_TEAM_SIZE = 8;
export const MAX_BATCH = 50;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

export const scoreSchema = z.int().min(0).max(999);

export const matchInputSchema = z.strictObject({
  /** Any offset; stored as UTC (MATCH-020). */
  playedAt: z.iso.datetime({ offset: true }),
  teams: z
    .array(
      z.strictObject({
        playerIds: z.array(z.string().min(1)).min(1).max(MAX_TEAM_SIZE),
        score: scoreSchema.nullable().default(null),
        /** Required when there are no scores; ignored (derived) when there are. */
        rank: z.int().min(1).max(MAX_TEAMS).optional(),
      }),
    )
    .min(2)
    .max(MAX_TEAMS),
  notes: z.string().trim().max(500).default(""),
});
export type MatchInput = z.input<typeof matchInputSchema>;
export type ParsedMatchInput = z.output<typeof matchInputSchema>;

export const batchSchema = z.strictObject({
  matches: z.array(matchInputSchema).min(1).max(MAX_BATCH),
});
export type BatchInput = z.input<typeof batchSchema>;

export interface MatchSettings {
  teamFormat: TeamFormat;
  scoringMode: ScoringMode;
  allowTies: boolean;
}

export type MatchIssueCode =
  | "team_count"
  | "team_size"
  | "duplicate_player"
  | "scores_required"
  | "scores_not_allowed"
  | "scores_incomplete"
  | "rank_required"
  | "invalid_ranks"
  | "tie_not_allowed"
  | "too_far_in_future"
  /** Checked by the API: core doesn't know the group's players. */
  | "unknown_player";

export interface MatchIssue {
  path: (string | number)[];
  code: MatchIssueCode;
  message: string;
}

export interface ValidMatch {
  playedAt: string;
  teams: MatchTeam[];
  notes: string;
}

export type MatchValidation =
  { ok: true; match: ValidMatch } | { ok: false; issues: MatchIssue[] };

/** Standard competition ranking ("1224"): 1 + the number of teams strictly ahead. */
function competitionRanks(
  values: number[],
  better: (a: number, b: number) => boolean,
) {
  return values.map((v) => 1 + values.filter((o) => better(o, v)).length);
}

/**
 * Group-dependent rules for a match that already passed `matchInputSchema`:
 * format (MATCH-007/008), one appearance per player (009), scoring mode
 * (010/017/018), placement (011/012), ties (013/019), and playedAt (020).
 */
export function validateMatch(
  input: ParsedMatchInput,
  settings: MatchSettings,
  now: Date,
): MatchValidation {
  const issues: MatchIssue[] = [];
  const issue = (
    path: MatchIssue["path"],
    code: MatchIssueCode,
    message: string,
  ) => issues.push({ path, code, message });
  const { teams } = input;

  const format = settings.teamFormat;
  if (format.kind === "fixed") {
    if (teams.length !== format.teams) {
      issue(["teams"], "team_count", `Needs ${String(format.teams)} teams`);
    }
    teams.forEach((t, i) => {
      if (t.playerIds.length !== format.size) {
        issue(
          ["teams", i, "playerIds"],
          "team_size",
          `Each team needs ${String(format.size)} player${format.size === 1 ? "" : "s"}`,
        );
      }
    });
  }

  const seen = new Set<string>();
  teams.forEach((t, i) => {
    t.playerIds.forEach((id, j) => {
      if (seen.has(id)) {
        issue(
          ["teams", i, "playerIds", j],
          "duplicate_player",
          "A player can only appear once",
        );
      }
      seen.add(id);
    });
  });

  const scored = teams.filter((t) => t.score !== null).length;
  let ranks: number[] | undefined;
  if (settings.scoringMode === "none" && scored > 0) {
    issue(["teams"], "scores_not_allowed", "This group doesn't record scores");
  } else if (settings.scoringMode === "required" && scored < teams.length) {
    teams.forEach((t, i) => {
      if (t.score === null)
        issue(["teams", i, "score"], "scores_required", "Score required");
    });
  } else if (scored > 0 && scored < teams.length) {
    teams.forEach((t, i) => {
      if (t.score === null)
        issue(
          ["teams", i, "score"],
          "scores_incomplete",
          "Enter a score for every team, or none",
        );
    });
  } else if (scored === teams.length) {
    ranks = competitionRanks(
      teams.map((t) => t.score ?? 0),
      (a, b) => a > b,
    );
  } else {
    const given = teams.map((t) => t.rank);
    if (given.some((r) => r === undefined)) {
      teams.forEach((t, i) => {
        if (t.rank === undefined)
          issue(["teams", i, "rank"], "rank_required", "Choose a placement");
      });
    } else {
      const values = given as number[];
      const expected = competitionRanks(values, (a, b) => a < b);
      if (values.some((r, i) => r !== expected[i])) {
        issue(["teams"], "invalid_ranks", "Placements don't add up");
      } else {
        ranks = values;
      }
    }
  }

  if (ranks && !settings.allowTies && new Set(ranks).size < ranks.length) {
    issue(["teams"], "tie_not_allowed", "This group doesn't allow ties");
  }

  const playedAt = new Date(input.playedAt);
  if (playedAt.getTime() > now.getTime() + MAX_FUTURE_MS) {
    issue(
      ["playedAt"],
      "too_far_in_future",
      "Can't be more than 24 hours from now",
    );
  }

  if (issues.length > 0 || !ranks) return { ok: false, issues };
  const final = ranks;
  return {
    ok: true,
    match: {
      playedAt: playedAt.toISOString(),
      teams: teams.map((t, i) => ({
        playerIds: t.playerIds,
        score: t.score,
        rank: final[i] ?? 1,
      })),
      notes: input.notes,
    },
  };
}
