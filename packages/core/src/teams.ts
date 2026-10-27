import { type Rating, ratingSystem } from "./rating";
import type { RatingConfig } from "./types";

// PLAN §9 (Team generator) and scenarios/team-generator.md.

/** Exhaustive search up to this many playing players; local search beyond. */
export const EXHAUSTIVE_LIMIT = 12;

export interface GenerateInput {
  playerIds: readonly string[];
  /** Current ratings; players missing here use the initial rating (TEAMS-005). */
  ratings: ReadonlyMap<string, Rating>;
  config: RatingConfig;
  format: { teams: number; size: number };
  /** Times each player has sat out this session (TEAMS-003); kept by the caller. */
  sitOutCounts?: ReadonlyMap<string, number>;
  /** 0 = best; k = the k-th next most balanced distinct split (TEAMS-004). */
  skip?: number;
}

export interface SuggestedMatch {
  teams: string[][];
  /** Predicted win probability per team. */
  probabilities: number[];
}

export type Suggestion =
  | { matches: SuggestedMatch[]; sittingOut: string[]; imbalance: number }
  | { needed: number };

/** Partitions sorted `ids` into groups of `size`, each group led by the smallest remaining id. */
function* groupings(
  ids: readonly string[],
  size: number,
): Generator<string[][]> {
  if (ids.length === 0) {
    yield [];
    return;
  }
  const [first, ...rest] = ids as [string, ...string[]];
  for (const others of combinations(rest, size - 1)) {
    const chosen = new Set(others);
    const remaining = rest.filter((id) => !chosen.has(id));
    for (const tail of groupings(remaining, size))
      yield [[first, ...others], ...tail];
  }
}

function* combinations(
  ids: readonly string[],
  k: number,
  from = 0,
): Generator<string[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = from; i <= ids.length - k; i++) {
    for (const tail of combinations(ids, k - 1, i + 1))
      yield [ids[i] ?? "", ...tail];
  }
}

interface Split {
  teams: string[][];
  probabilities: number[];
  score: number;
}

/** Deterministic PRNG for the local search (fixed seed: same input, same answer). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTeams(input: GenerateInput): Suggestion {
  const { teams: T, size: S } = input.format;
  const perMatch = T * S;
  const ids = [...new Set(input.playerIds)].sort();
  if (ids.length < perMatch) return { needed: perMatch - ids.length };

  const system = ratingSystem(input.config);
  const rating = (id: string) => input.ratings.get(id) ?? system.initial();
  const target = 1 / T;
  const splitOf = (teams: string[][]): Split => {
    const probabilities = system.predictWin(teams.map((t) => t.map(rating)));
    const score = probabilities.reduce(
      (sum, p) => sum + Math.abs(p - target),
      0,
    );
    return { teams, probabilities, score };
  };

  // TEAMS-003: sit out those who have sat out least; ties by id.
  const matchCount = Math.floor(ids.length / perMatch);
  const sitOut = ids.length - matchCount * perMatch;
  const counts = input.sitOutCounts ?? new Map<string, number>();
  const sittingOut = [...ids]
    .sort(
      (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || (a < b ? -1 : 1),
    )
    .slice(0, sitOut)
    .sort();
  const out = new Set(sittingOut);
  const playing = ids.filter((id) => !out.has(id));

  const result = (matches: Split[]) => ({
    matches: matches.map(({ teams, probabilities }) => ({
      teams,
      probabilities,
    })),
    sittingOut,
    imbalance: matches.reduce((s, m) => s + m.score, 0),
  });

  if (playing.length > EXHAUSTIVE_LIMIT) {
    return result(
      localSearch(playing, matchCount, T, S, splitOf, input.skip ?? 0),
    );
  }

  // Every way to split one match's players into teams, best first (cached per player set).
  const splitsCache = new Map<string, Split[]>();
  const splitsFor = (players: string[]) => {
    const key = players.join(",");
    let splits = splitsCache.get(key);
    if (!splits) {
      splits = [...groupings(players, S)]
        .map(splitOf)
        .sort((a, b) => a.score - b.score);
      splitsCache.set(key, splits);
    }
    return splits;
  };

  // Keep the best skip+1 distinct full partitions; ties keep enumeration order,
  // which is canonical, so equal scores break deterministically.
  const keep = (input.skip ?? 0) + 1;
  const top: { score: number; matches: Split[] }[] = [];
  const offer = (score: number, matches: Split[]) => {
    if (
      top.length === keep &&
      score >= (top[keep - 1]?.score ?? Infinity) - 1e-12
    )
      return;
    let i = top.length;
    while (i > 0 && (top[i - 1]?.score ?? 0) > score + 1e-12) i--;
    top.splice(i, 0, { score, matches });
    if (top.length > keep) top.pop();
  };
  for (const grouping of groupings(playing, perMatch)) {
    const options = grouping.map(splitsFor);
    const walk = (m: number, score: number, chosen: Split[]) => {
      if (m === options.length) {
        offer(score, chosen);
        return;
      }
      for (const split of options[m] ?? []) {
        const next = score + split.score;
        // Splits are sorted, so the rest of this match's options are no better.
        if (
          top.length === keep &&
          next >= (top[keep - 1]?.score ?? Infinity) - 1e-12
        )
          break;
        walk(m + 1, next, [...chosen, split]);
      }
    };
    walk(0, 0, []);
  }
  // Fewer distinct splits than requested: wrap around.
  const pick = top[Math.min(input.skip ?? 0, top.length - 1)] ?? top[0];
  return result(pick?.matches ?? []);
}

/** Seeded swap search for large groups: start from a snake draft, keep improving swaps. */
function localSearch(
  playing: string[],
  matchCount: number,
  T: number,
  S: number,
  splitOf: (teams: string[][]) => Split,
  skip: number,
): Split[] {
  const rand = mulberry32(0x5eed + skip);
  const slots = matchCount * T;
  const teams: string[][] = Array.from({ length: slots }, () => []);
  // Snake draft by id order, then shuffled by the seed for regenerations.
  const order = [...playing];
  for (let i = order.length - 1; i > 0 && skip > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j] ?? "", order[i] ?? ""];
  }
  order.forEach((id, i) => {
    const round = Math.floor(i / slots);
    const pos = round % 2 === 0 ? i % slots : slots - 1 - (i % slots);
    teams[pos]?.push(id);
  });
  const matchOf = (t: number) => Math.floor(t / T);
  const build = () =>
    Array.from({ length: matchCount }, (_, m) =>
      splitOf(teams.slice(m * T, m * T + T)),
    );
  let matches = build();
  let total = matches.reduce((s, m) => s + m.score, 0);

  for (let iter = 0; iter < 3000; iter++) {
    const a = Math.floor(rand() * slots);
    const b = Math.floor(rand() * slots);
    if (a === b) continue;
    const ta = teams[a] ?? [];
    const tb = teams[b] ?? [];
    const i = Math.floor(rand() * S);
    const j = Math.floor(rand() * S);
    [ta[i], tb[j]] = [tb[j] ?? "", ta[i] ?? ""];
    const touched = new Set([matchOf(a), matchOf(b)]);
    const candidate = matches.map((m, k) =>
      touched.has(k) ? splitOf(teams.slice(k * T, k * T + T)) : m,
    );
    const score = candidate.reduce((s, m) => s + m.score, 0);
    if (score < total - 1e-12) {
      matches = candidate;
      total = score;
    } else {
      [ta[i], tb[j]] = [tb[j] ?? "", ta[i] ?? ""];
    }
  }
  return build();
}
