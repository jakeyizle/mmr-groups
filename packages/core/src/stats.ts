import {
  compareMatches,
  displayRating,
  type Rating,
  ratingSystem,
  replay,
  type ReplayMatch,
} from "./rating";
import type { MatchTeam, RatingConfig } from "./types";

// Definitions: the header of scenarios/stats.md.

/** Partner, opponent and duo stats need at least this many shared matches. */
export const MIN_SHARED = 3;

export type Outcome = "win" | "loss" | "tie";

/** A sole first place is a win, a shared first place a tie, anything else a loss. */
export function teamOutcome(match: ReplayMatch, team: MatchTeam): Outcome {
  if (team.rank > 1) return "loss";
  return match.teams.filter((t) => t.rank === 1).length > 1 ? "tie" : "win";
}

export interface WinRecord {
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  /** Ties count as half a win. */
  winRate: number;
}

const emptyRecord = (): WinRecord => ({
  matches: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  winRate: 0,
});

function add(r: WinRecord, o: Outcome) {
  r.matches += 1;
  if (o === "win") r.wins += 1;
  else if (o === "loss") r.losses += 1;
  else r.ties += 1;
  r.winRate = (r.wins + r.ties / 2) / r.matches;
}

export type NameOf = (playerId: string) => string;

export interface PairRecord extends WinRecord {
  playerId: string;
}

/** Highest win rate first, then more shared matches, then name (stats.md). */
function byWinRate(nameOf: NameOf, dir: 1 | -1) {
  return (a: PairRecord, b: PairRecord) =>
    dir * (b.winRate - a.winRate) ||
    b.matches - a.matches ||
    nameOf(a.playerId).localeCompare(nameOf(b.playerId));
}

export interface PlayerStats {
  record: WinRecord;
  /** The run of identical outcomes at the end of the history. */
  currentStreak: { outcome: Outcome; length: number } | null;
  longestWinStreak: number;
  partners: { best: PairRecord[]; worst: PairRecord[] };
  /** Against each opponent; win/loss/tie by relative placement. */
  headToHead: PairRecord[];
}

/** STATS-002/003/004 for one player. */
export function playerStats(
  history: readonly ReplayMatch[],
  playerId: string,
  nameOf: NameOf = (id) => id,
): PlayerStats {
  const record = emptyRecord();
  const partners = new Map<string, PairRecord>();
  const opponents = new Map<string, PairRecord>();
  const pair = (map: Map<string, PairRecord>, id: string) => {
    let r = map.get(id);
    if (!r) map.set(id, (r = { playerId: id, ...emptyRecord() }));
    return r;
  };
  let current = null as PlayerStats["currentStreak"];
  let run = 0;
  let longest = 0;

  for (const match of [...history].sort(compareMatches)) {
    const mine = match.teams.find((t) => t.playerIds.includes(playerId));
    if (!mine) continue;
    const outcome = teamOutcome(match, mine);
    add(record, outcome);
    current =
      current?.outcome === outcome
        ? { outcome, length: current.length + 1 }
        : { outcome, length: 1 };
    run = outcome === "win" ? run + 1 : 0;
    longest = Math.max(longest, run);

    for (const id of mine.playerIds)
      if (id !== playerId) add(pair(partners, id), outcome);
    for (const other of match.teams) {
      if (other === mine) continue;
      const vs: Outcome =
        mine.rank < other.rank
          ? "win"
          : mine.rank > other.rank
            ? "loss"
            : "tie";
      for (const id of other.playerIds) add(pair(opponents, id), vs);
    }
  }

  const qualified = [...partners.values()].filter(
    (p) => p.matches >= MIN_SHARED,
  );
  const best = [...qualified].sort(byWinRate(nameOf, 1)).slice(0, 3);
  const worst = qualified
    .filter((p) => !best.includes(p))
    .sort(byWinRate(nameOf, -1))
    .slice(0, 3);
  return {
    record,
    currentStreak: current,
    longestWinStreak: longest,
    partners: { best, worst },
    headToHead: [...opponents.values()]
      .filter((p) => p.matches >= MIN_SHARED)
      .sort(
        (a, b) =>
          b.matches - a.matches ||
          nameOf(a.playerId).localeCompare(nameOf(b.playerId)),
      ),
  };
}

export interface RatingPoint {
  matchId: string;
  at: string;
  rating: number;
}

/** STATS-001/006: each player's displayed rating after each of their matches. */
export function ratingSeries(
  history: readonly ReplayMatch[],
  config: RatingConfig,
  asOf: string,
): Map<string, RatingPoint[]> {
  const { matches } = replay(history, config, asOf);
  const series = new Map<string, RatingPoint[]>();
  for (const match of [...history].sort(compareMatches)) {
    for (const [pid, change] of matches.get(match.id) ?? []) {
      const points = series.get(pid) ?? [];
      points.push({
        matchId: match.id,
        at: match.playedAt,
        rating: displayRating(change.after),
      });
      series.set(pid, points);
    }
  }
  return series;
}

export interface Activity {
  /** Oldest first; `week` is the ISO start of each week. */
  weeks: { week: string; matches: number }[];
  /** Most matches in the last 30 days (ties by name). */
  mostActive: { playerId: string; matches: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * STATS-007. `weekStart` maps an instant to the start of its week; the caller
 * passes one for the viewer's zone (weeks start Monday), keeping core zone-free.
 */
export function activity(
  history: readonly ReplayMatch[],
  now: Date,
  weekStart: (d: Date) => Date,
  nameOf: NameOf = (id) => id,
): Activity {
  const weeks: { week: string; matches: number }[] = [];
  let start = weekStart(now);
  for (let i = 0; i < 12; i++) {
    weeks.unshift({ week: start.toISOString(), matches: 0 });
    // Step back into the previous week and snap to its start (DST-safe).
    start = weekStart(new Date(start.getTime() - DAY_MS));
  }
  const index = new Map(weeks.map((w, i) => [w.week, i]));
  const since = now.getTime() - 30 * DAY_MS;
  const recent = new Map<string, number>();

  for (const m of history) {
    const at = new Date(m.playedAt);
    const i = index.get(weekStart(at).toISOString());
    const week = i === undefined ? undefined : weeks[i];
    if (week) week.matches += 1;
    if (at.getTime() >= since && at.getTime() <= now.getTime()) {
      for (const id of m.teams.flatMap((t) => t.playerIds))
        recent.set(id, (recent.get(id) ?? 0) + 1);
    }
  }
  const mostActive = [...recent.entries()]
    .map(([playerId, matches]) => ({ playerId, matches }))
    .sort(
      (a, b) =>
        b.matches - a.matches ||
        nameOf(a.playerId).localeCompare(nameOf(b.playerId)),
    )
    .slice(0, 5);
  return { weeks, mostActive };
}

export interface Duo extends WinRecord {
  playerIds: [string, string];
}

/** STATS-008: teammate pairs with the best win rate together (≥ MIN_SHARED matches). */
export function bestDuos(
  history: readonly ReplayMatch[],
  nameOf: NameOf = (id) => id,
): Duo[] {
  const duos = new Map<string, Duo>();
  for (const match of history) {
    for (const team of match.teams) {
      const outcome = teamOutcome(match, team);
      const ids = [...team.playerIds].sort();
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i] ?? "";
          const b = ids[j] ?? "";
          const key = `${a}|${b}`;
          let duo = duos.get(key);
          if (!duo)
            duos.set(key, (duo = { playerIds: [a, b], ...emptyRecord() }));
          add(duo, outcome);
        }
    }
  }
  const label = (d: Duo) => d.playerIds.map(nameOf).sort().join(" & ");
  return [...duos.values()]
    .filter((d) => d.matches >= MIN_SHARED)
    .sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.matches - a.matches ||
        label(a).localeCompare(label(b)),
    )
    .slice(0, 5);
}

export interface Upset {
  matchId: string;
  /** The winning team's index in `match.teams`. */
  winner: number;
  /** Its predicted win probability just before the match. */
  probability: number;
}

/** STATS-009: 2-team matches whose winner was the least likely to win. */
export function biggestUpsets(
  history: readonly ReplayMatch[],
  config: RatingConfig,
  asOf: string,
): Upset[] {
  const system = ratingSystem(config);
  const { matches } = replay(history, config, asOf);
  const upsets: Upset[] = [];
  for (const match of history) {
    if (match.teams.length !== 2) continue;
    const winner = match.teams.findIndex(
      (t) => teamOutcome(match, t) === "win",
    );
    if (winner < 0) continue;
    const before = matches.get(match.id);
    const teams = match.teams.map((t) =>
      t.playerIds.map(
        (id): Rating => before?.get(id)?.before ?? system.initial(),
      ),
    );
    const probability = system.predictWin(teams)[winner] ?? 0;
    upsets.push({ matchId: match.id, winner, probability });
  }
  return upsets
    .sort(
      (a, b) =>
        a.probability - b.probability || (a.matchId < b.matchId ? -1 : 1),
    )
    .slice(0, 5);
}

/** STATS-010: each player's longest win streak, top 5 (ties by name). */
export function longestStreaks(
  history: readonly ReplayMatch[],
  nameOf: NameOf = (id) => id,
): { playerId: string; length: number }[] {
  const run = new Map<string, number>();
  const best = new Map<string, number>();
  for (const match of [...history].sort(compareMatches)) {
    for (const team of match.teams) {
      const won = teamOutcome(match, team) === "win";
      for (const id of team.playerIds) {
        const n = won ? (run.get(id) ?? 0) + 1 : 0;
        run.set(id, n);
        best.set(id, Math.max(best.get(id) ?? 0, n));
      }
    }
  }
  return [...best.entries()]
    .filter(([, length]) => length > 0)
    .map(([playerId, length]) => ({ playerId, length }))
    .sort(
      (a, b) =>
        b.length - a.length ||
        nameOf(a.playerId).localeCompare(nameOf(b.playerId)),
    )
    .slice(0, 5);
}

/** STATS-011: counts of displayed ratings in buckets of 50, lowest first, no gaps. */
export function ratingHistogram(ratings: readonly number[], size = 50) {
  if (ratings.length === 0) return [];
  const floor = (r: number) => Math.floor(r / size) * size;
  const lo = Math.min(...ratings.map(floor));
  const hi = Math.max(...ratings.map(floor));
  const buckets: { from: number; count: number }[] = [];
  for (let from = lo; from <= hi; from += size)
    buckets.push({ from, count: 0 });
  for (const r of ratings) {
    const b = buckets[(floor(r) - lo) / size];
    if (b) b.count += 1;
  }
  return buckets;
}
