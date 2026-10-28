import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/lib/can";
import { type GroupData, groupQuery, useGroupActor } from "@/lib/groups";
import { useLeaderboard } from "@/lib/ratings";

export const Route = createFileRoute("/g/$gid/")({ component: Leaderboard });

function Leaderboard() {
  const { gid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  if (!data) return null;
  return <Board data={data} />;
}

function Board({ data }: { data: GroupData }) {
  const actor = useGroupActor(data);
  const board = useLeaderboard(data);
  const names = new Map(data.players.map((p) => [p.id, p.displayName]));
  const ranked = new Set(board.map((e) => e.playerId));
  const unrated = data.players.filter((p) => !ranked.has(p.id));
  const gid = data.group.id;

  return (
    <div className="space-y-6">
      <Can actor={actor} action="match.record">
        <Button asChild className="w-full">
          <Link to="/g/$gid/matches/new" params={{ gid }}>
            Record matches
          </Link>
        </Button>
      </Can>

      {board.length === 0 ? (
        <p className="text-muted-foreground">
          No matches yet. Ratings appear once matches are recorded.
        </p>
      ) : (
        <ol aria-label="Leaderboard" className="divide-y rounded-lg border">
          {board.map((e) => (
            <li key={e.playerId} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                {e.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <Link
                    to="/g/$gid/players/$pid"
                    params={{ gid, pid: e.playerId }}
                    className="truncate font-medium hover:underline"
                  >
                    {names.get(e.playerId) ?? "Removed player"}
                  </Link>
                  {e.provisional && (
                    <Badge variant="outline" className="shrink-0">
                      Provisional
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {e.wins}W {e.losses}L{e.ties > 0 && ` ${String(e.ties)}T`} ·{" "}
                  {e.matches} {e.matches === 1 ? "match" : "matches"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">{e.rating}</p>
                <RankChange value={e.rankChange} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {unrated.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">
            Unrated
          </h2>
          <ul aria-label="Unrated" className="flex flex-wrap gap-2">
            {unrated.map((p) => (
              <li key={p.id}>
                <Badge variant="secondary">{p.displayName}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** BOARD-003: places moved in the player's latest match. */
function RankChange({ value }: { value: number | null }) {
  if (value === null || value === 0) return null;
  // Stryker disable next-line EqualityOperator: 0 returned above
  const up = value > 0;
  return (
    <p
      className={up ? "text-xs text-green-600" : "text-xs text-destructive"}
      aria-label={`${up ? "Up" : "Down"} ${String(Math.abs(value))}`}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}
    </p>
  );
}
