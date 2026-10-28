import {
  displayRating,
  type MatchTeam,
  type Rating,
  teamOutcome,
} from "@mmr/core";
import { Link } from "@tanstack/react-router";

import { PlayerLink } from "@/components/player-link";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const RESULT = { win: "Won", loss: "Lost", tie: "Tied" } as const;

/**
 * One match in a list: winners first, each player's displayed-rating change (BOARD-005).
 * The date links to the match and stretches over the card; names sit above it and link
 * to profiles (STATS-013), since links can't nest. With a `perspective` player, it also
 * shows their result and rating before → after (STATS-012).
 */
export function MatchCard({
  gid,
  match,
  names,
  changes,
  perspective,
}: {
  gid: string;
  match: { id: string; playedAt: string; teams: MatchTeam[] };
  names: Map<string, string>;
  changes: Map<string, { before: Rating; after: Rating }> | undefined;
  perspective?: string;
}) {
  // Stryker disable ConditionalExpression: no player ID is undefined, so the lookups find nothing anyway
  const mine =
    perspective === undefined
      ? undefined
      : match.teams.find((t) => t.playerIds.includes(perspective));
  const change =
    perspective === undefined ? undefined : changes?.get(perspective);
  // Stryker restore ConditionalExpression
  return (
    <div className="relative space-y-2 rounded-lg border p-3 hover:bg-muted/30">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <Link
          to="/g/$gid/matches/$mid"
          params={{ gid, mid: match.id }}
          className="text-muted-foreground after:absolute after:inset-0"
        >
          {dateFormat.format(new Date(match.playedAt))}
        </Link>
        {mine && (
          <span aria-label="Result" className="shrink-0 tabular-nums">
            <span className="font-medium">
              {RESULT[teamOutcome(match, mine)]}
            </span>
            {change &&
              ` · ${String(displayRating(change.before))} → ${String(displayRating(change.after))}`}
          </span>
        )}
      </p>
      {[...match.teams]
        .sort((a, b) => a.rank - b.rank)
        .map((t, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start justify-between gap-2 rounded-md px-2 py-1",
              t.rank === 1 && "bg-muted",
            )}
          >
            <ul className="min-w-0 space-y-0.5">
              {t.playerIds.map((pid) => {
                const c = changes?.get(pid);
                const delta = c
                  ? displayRating(c.after) - displayRating(c.before)
                  : 0;
                return (
                  <li key={pid} className="flex gap-2">
                    <PlayerLink
                      gid={gid}
                      id={pid}
                      names={names}
                      className={cn(
                        "relative truncate",
                        pid === perspective && "font-semibold",
                      )}
                    />
                    <Delta value={delta} />
                  </li>
                );
              })}
            </ul>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {t.score ?? placeLabel(t.rank, match.teams)}
            </span>
          </div>
        ))}
    </div>
  );
}

function placeLabel(rank: number, teams: { rank: number }[]) {
  const tied = teams.filter((t) => t.rank === rank).length > 1;
  if (teams.length === 2) return tied ? "Tie" : rank === 1 ? "Won" : "Lost";
  const suffix =
    rank === 1 ? "st" : rank === 2 ? "nd" : rank === 3 ? "rd" : "th";
  return `${tied ? "Tied " : ""}${String(rank)}${suffix}`;
}

/** Displayed-rating change from one match. */
export function Delta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "text-sm tabular-nums",
        value > 0 && "text-green-600",
        value < 0 && "text-destructive",
        value === 0 && "text-muted-foreground",
      )}
    >
      {value > 0
        ? `+${String(value)}`
        : value < 0
          ? `−${String(-value)}`
          : "±0"}
    </span>
  );
}
