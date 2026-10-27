import {
  type MatchInput,
  type MatchTeam,
  type MatchUpdate,
  matchInputSchema,
  type MatchSettings,
  type TeamFormat,
  validateMatch,
} from "@mmr/core";

/** Form model: strings as the inputs hold them; `""` is an empty slot / no score / no placement. */
export interface TeamRow {
  playerIds: string[];
  score: string;
  rank: string;
}
export interface MatchRow {
  /** `datetime-local` value, in the viewer's zone. */
  playedAt: string;
  teams: TeamRow[];
}
export interface BatchForm {
  rows: MatchRow[];
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalInput(d: Date) {
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** MATCH-005: each next row defaults to one minute after the previous one. */
export function nextMinute(local: string) {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return toLocalInput(new Date());
  d.setMinutes(d.getMinutes() + 1);
  return toLocalInput(d);
}

const emptyTeam = (size: number): TeamRow => ({
  playerIds: Array.from({ length: size }, () => ""),
  score: "",
  rank: "",
});

export function blankRow(format: TeamFormat, playedAt: string): MatchRow {
  const [teams, size] =
    format.kind === "fixed" ? [format.teams, format.size] : [2, 1];
  return {
    playedAt,
    teams: Array.from({ length: teams }, () => emptyTeam(size)),
  };
}

/** MATCH-004: same players on the same teams, no scores or placements. */
export function duplicateRow(prev: MatchRow): MatchRow {
  return {
    playedAt: nextMinute(prev.playedAt),
    teams: prev.teams.map((t) => ({
      playerIds: [...t.playerIds],
      score: "",
      rank: "",
    })),
  };
}

export function toMatchInput(row: MatchRow): MatchInput {
  const at = new Date(row.playedAt);
  return {
    // MATCH-020: the browser reads datetime-local in the viewer's zone.
    playedAt: Number.isNaN(at.getTime()) ? row.playedAt : at.toISOString(),
    teams: row.teams.map((t) => ({
      playerIds: t.playerIds.filter(Boolean),
      score: t.score.trim() === "" ? null : Number(t.score),
      ...(t.rank === "" ? {} : { rank: Number(t.rank) }),
    })),
  };
}

/** A stored match as an editable row (placements only for unscored teams). */
export function fromMatch(m: {
  playedAt: string;
  teams: MatchTeam[];
}): MatchRow {
  return {
    playedAt: toLocalInput(new Date(m.playedAt)),
    teams: m.teams.map((t) => ({
      playerIds: [...t.playerIds],
      score: t.score === null ? "" : String(t.score),
      rank: t.score === null ? String(t.rank) : "",
    })),
  };
}

/**
 * EDIT-011: send only what changed, so untouched fields aren't re-validated
 * against newer settings. Teams compare on what the recorder entered.
 */
export function matchChanges(
  original: { playedAt: string; teams: MatchTeam[]; notes: string },
  row: MatchRow,
  notes: string,
): MatchUpdate {
  const input = toMatchInput(row);
  const entered = (teams: MatchInput["teams"] | MatchTeam[]) =>
    JSON.stringify(
      teams.map((t) => ({
        playerIds: t.playerIds,
        score: t.score ?? null,
        rank: t.score == null ? t.rank : undefined,
      })),
    );
  const changes: MatchUpdate = {};
  // Compared at minute precision, as the input shows it.
  if (toLocalInput(new Date(original.playedAt)) !== row.playedAt)
    changes.playedAt = input.playedAt;
  if (entered(original.teams) !== entered(input.teams))
    changes.teams = input.teams;
  if (original.notes !== notes.trim()) changes.notes = notes;
  return changes;
}

const hasScores = (row: MatchRow) => row.teams.some((t) => t.score !== "");

/** Placement is chosen by hand only when the row has no scores (MATCH-012). */
export function needsPlacement(row: MatchRow, settings: MatchSettings) {
  return settings.scoringMode !== "required" && !hasScores(row);
}

/** Human-readable problems with one row, from the same rules the API runs. */
export function rowIssues(
  row: MatchRow,
  settings: MatchSettings,
  now: Date,
): string[] {
  const parsed = matchInputSchema.safeParse(toMatchInput(row));
  if (!parsed.success) {
    return unique(
      parsed.error.issues.map((i) => {
        if (i.path.includes("playerIds")) return "Pick players for every team";
        if (i.path.includes("score"))
          return "Scores are whole numbers from 0 to 999";
        if (i.path.includes("playedAt")) return "Enter a date and time";
        return i.message;
      }),
    );
  }
  const result = validateMatch(parsed.data, settings, now);
  return result.ok ? [] : unique(result.issues.map((i) => i.message));
}

const unique = (xs: string[]) => [...new Set(xs)];

/** MATCH-014: drafts live in this browser only; storage may be unavailable. */
export function loadDraft(key: string): BatchForm | null {
  try {
    const raw = localStorage.getItem(key);
    const draft = raw ? (JSON.parse(raw) as BatchForm) : null;
    return draft && Array.isArray(draft.rows) && draft.rows.length > 0
      ? draft
      : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the draft just won't survive a reload.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // See saveDraft.
  }
}
