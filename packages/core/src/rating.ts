import { predictWin as osPredictWin, rate, type Rating } from "openskill";

import type { MatchTeam, RatingConfig } from "./types";

export type { Rating } from "openskill";

/** RATE-013. Groups store only overrides of these. */
export const DEFAULT_RATING_CONFIG: RatingConfig = {
  model: "plackett-luce",
  mu: 25,
  sigma: 25 / 3,
  tau: 25 / 300,
  decayPerWeek: 0.5,
  provisionalSigma: 5,
  useScores: false,
};

export function resolveRatingConfig(
  overrides: Partial<RatingConfig> = {},
): RatingConfig {
  return { ...DEFAULT_RATING_CONFIG, ...overrides };
}

/** RATE-009: conservative estimate on a ~1000 scale. */
export function displayRating({ mu, sigma }: Rating) {
  return Math.round(1000 + 20 * (mu - 3 * sigma));
}

/** RATE-010 */
export function isProvisional({ sigma }: Rating, config: RatingConfig) {
  return sigma > config.provisionalSigma;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** RATE-007: σ² grows by d² per (fractional) week inactive, capped at σ₀; μ is unchanged. */
export function decay(
  rating: Rating,
  from: string,
  to: string,
  config: RatingConfig,
): Rating {
  const weeks = Math.max(0, (Date.parse(to) - Date.parse(from)) / WEEK_MS);
  const sigma = Math.min(
    Math.sqrt(rating.sigma ** 2 + weeks * config.decayPerWeek ** 2),
    config.sigma,
  );
  return { mu: rating.mu, sigma };
}

/** The only RatingSystem (PLAN §6): openskill with the group's config. */
export function ratingSystem(config: RatingConfig) {
  const options = { mu: config.mu, sigma: config.sigma, tau: config.tau };
  return {
    initial: (): Rating => ({ mu: config.mu, sigma: config.sigma }),
    rateMatch: (teams: Rating[][], match: MatchTeam[]) => {
      const scores = match.map((t) => t.score);
      const useScores =
        config.useScores && scores.every((s): s is number => s !== null);
      return rate(teams, {
        ...options,
        ...(useScores ? { score: scores } : { rank: match.map((t) => t.rank) }),
      });
    },
    predictWin: (teams: Rating[][]) => osPredictWin(teams, options),
  };
}

export interface ReplayMatch {
  id: string;
  playedAt: string;
  teams: MatchTeam[];
}

export interface PlayerRating extends Rating {
  matches: number;
  lastPlayedAt: string;
}

export interface Replay {
  /** Only players who have played; others have `ratingSystem(config).initial()`. */
  players: Map<string, PlayerRating>;
  /** RATE-012: each participant's rating just before and after the match. */
  matches: Map<string, Map<string, { before: Rating; after: Rating }>>;
}

/** MATCH-006: date-time order; same date-time falls back to creation (ULID) order. */
export function compareMatches(a: ReplayMatch, b: ReplayMatch) {
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * RATE-002: ratings are a pure function of history, config and `asOf`.
 * Players are decayed before each match (RATE-014) and finally to `asOf` (RATE-007).
 */
export function replay(
  history: readonly ReplayMatch[],
  config: RatingConfig,
  asOf: string,
  /** Called after each match with the ratings just before and just after it (undecayed). */
  observe?: (
    match: ReplayMatch,
    before: ReadonlyMap<string, PlayerRating>,
    after: ReadonlyMap<string, PlayerRating>,
  ) => void,
): Replay {
  const system = ratingSystem(config);
  const players = new Map<string, PlayerRating>();
  const matches: Replay["matches"] = new Map();

  for (const match of [...history].sort(compareMatches)) {
    const previous = observe && new Map(players);
    const before = match.teams.map((team) =>
      team.playerIds.map((id) => {
        const current = players.get(id);
        return current
          ? decay(current, current.lastPlayedAt, match.playedAt, config)
          : system.initial();
      }),
    );
    const after = system.rateMatch(before, match.teams);

    const changes = new Map<string, { before: Rating; after: Rating }>();
    match.teams.forEach((team, t) => {
      team.playerIds.forEach((id, p) => {
        // Stryker disable OptionalChaining,ConditionalExpression,LogicalOperator: openskill returns the input's shape
        const b = before[t]?.[p];
        const a = after[t]?.[p];
        if (!b || !a) throw new Error("openskill returned a different shape");
        // Stryker restore OptionalChaining,ConditionalExpression,LogicalOperator
        const next = { mu: a.mu, sigma: a.sigma };
        changes.set(id, { before: b, after: next });
        players.set(id, {
          ...next,
          matches: (players.get(id)?.matches ?? 0) + 1,
          lastPlayedAt: match.playedAt,
        });
      });
    });
    matches.set(match.id, changes);
    // Stryker disable next-line LogicalOperator: `previous` is set exactly when `observe` is
    if (observe && previous) observe(match, previous, players);
  }

  for (const [id, p] of players) {
    players.set(id, { ...p, ...decay(p, p.lastPlayedAt, asOf, config) });
  }
  return { players, matches };
}
