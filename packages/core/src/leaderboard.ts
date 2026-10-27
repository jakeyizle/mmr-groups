import {
  displayRating,
  isProvisional,
  type PlayerRating,
  replay,
  type ReplayMatch,
} from "./rating";
import { type Outcome, teamOutcome } from "./stats";
import { byText } from "./text";
import type { RatingConfig } from "./types";

const PLURAL = {
  win: "wins",
  loss: "losses",
  tie: "ties",
} as const satisfies Record<Outcome, string>;

export interface LeaderboardEntry {
  playerId: string;
  /** 1-based; players with equal displayed ratings share a rank. */
  rank: number;
  rating: number;
  provisional: boolean;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  /**
   * BOARD-003: places gained (+) or lost (−) in this player's latest match;
   * null when that match was their first.
   */
  rankChange: number | null;
}

/** Highest displayed rating first; ties broken by μ, then ID, so the order is stable. */
function order(players: ReadonlyMap<string, PlayerRating>) {
  return [...players.entries()]
    .map(([id, r]) => ({ id, r, display: displayRating(r) }))
    .sort(
      (a, b) => b.display - a.display || b.r.mu - a.r.mu || byText(a.id, b.id),
    );
}

/** Competition ranks by displayed rating ("1224"). */
function ranks(players: ReadonlyMap<string, PlayerRating>) {
  const out = new Map<string, number>();
  let rank = 0;
  order(players).forEach((p, i, all) => {
    if (all[i - 1]?.display !== p.display) rank = i + 1;
    out.set(p.id, rank);
  });
  return out;
}

/**
 * BOARD-001/003: players who have played, best first. Unrated players are the
 * group's players missing from this list (BOARD-002).
 */
export function leaderboard(
  history: readonly ReplayMatch[],
  config: RatingConfig,
  asOf: string,
): LeaderboardEntry[] {
  const record = new Map<
    string,
    { wins: number; losses: number; ties: number }
  >();
  const rankChange = new Map<string, number | null>();

  // Standings around each match use undecayed ratings at that moment.
  const result = replay(history, config, asOf, (match, before, after) => {
    const rankBefore = ranks(before);
    const rankAfter = ranks(after);
    for (const team of match.teams) {
      const outcome = PLURAL[teamOutcome(match, team)];
      for (const id of team.playerIds) {
        const r = record.get(id) ?? { wins: 0, losses: 0, ties: 0 };
        r[outcome] += 1;
        record.set(id, r);
        const was = rankBefore.get(id);
        const now = rankAfter.get(id);
        rankChange.set(
          id,
          // Stryker disable next-line ConditionalExpression: players are always ranked after their match
          was === undefined || now === undefined ? null : was - now,
        );
      }
    }
  });

  const current = ranks(result.players);
  return order(result.players).map(({ id, r, display }) => ({
    playerId: id,
    rank: current.get(id) ?? 0,
    rating: display,
    provisional: isProvisional(r, config),
    matches: r.matches,
    // Stryker disable next-line ObjectLiteral: every rated player has a record
    ...(record.get(id) ?? { wins: 0, losses: 0, ties: 0 }),
    rankChange: rankChange.get(id) ?? null,
  }));
}
