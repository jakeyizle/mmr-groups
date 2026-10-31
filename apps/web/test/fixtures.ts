import type { MatchTeam } from "@mmr/core";

import type { GroupData } from "@/lib/groups";

import type { StubBody } from "./render";

type Group = GroupData["group"];
type Player = GroupData["players"][number];
type Match = GroupData["matches"][number];
export type User = NonNullable<StubBody<"GET /api/me">["user"]>;

/** The signed-in user as `/api/me` returns it. */
export const user = (extra: Partial<User> = {}): User => ({
  id: "u1",
  name: "Ann",
  email: "ann@example.com",
  isSiteAdmin: false,
  ...extra,
});

export const PLAYERS: Player[] = [
  { id: "a", displayName: "Ann", role: "owner", linked: true },
  { id: "b", displayName: "Bob", role: "recorder", linked: true },
  { id: "c", displayName: "Cy", role: "viewer", linked: false },
];

/** A match `hours` after 2026-10-01 18:00 UTC; `teams` as [playerIds, rank, score?]. */
export function match(
  id: string,
  hours: number,
  teams: [string[], number, number?][],
  extra: Partial<Match> = {},
): Match {
  const playedAt = new Date(
    Date.UTC(2026, 9, 1, 18) + hours * 3_600_000,
  ).toISOString();
  return {
    id,
    playedAt,
    teams: teams.map(([playerIds, rank, score = null]): MatchTeam => ({
      playerIds,
      rank,
      score,
    })),
    notes: "",
    version: 1,
    createdAt: playedAt,
    updatedAt: playedAt,
    recordedByPlayerId: "a",
    ...extra,
  };
}

interface SnapshotOptions {
  role?: string | null;
  group?: Partial<Group>;
  players?: Player[];
  matches?: Match[];
  extra?: Partial<GroupData>;
}

/** A group snapshot as the API returns it; `role: null` is a public visitor. */
export function snapshot({
  role = "owner",
  group = {},
  players = PLAYERS,
  matches = [],
  extra = {},
}: SnapshotOptions = {}): GroupData {
  const member = role !== null;
  return {
    group: {
      id: "g1",
      name: "Chess club",
      description: "",
      visibility: "private",
      isDemo: false,
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
      scoringMode: "optional",
      allowTies: false,
      defaultRole: "recorder",
      ratingConfig: null,
      version: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      ...group,
    },
    players: member
      ? players
      : players.map(({ id, displayName }) => ({ id, displayName })),
    matches: member
      ? matches
      : matches.map((m) => {
          const visible = { ...m };
          delete visible.recordedByPlayerId;
          return visible;
        }),
    me: member ? { playerId: "a", role } : null,
    ...extra,
  } as GroupData;
}
