import { displayRating } from "@mmr/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Can } from "@/lib/can";
import { type GroupData, groupQuery, useGroupActor } from "@/lib/groups";
import { useReplay } from "@/lib/ratings";
import { cn } from "@/lib/utils";

interface HistorySearch {
  player?: string;
}

export const Route = createFileRoute("/g/$gid/matches/")({
  // BOARD-006: the filter is in the URL so it can be linked to.
  validateSearch: (search: Record<string, unknown>): HistorySearch =>
    typeof search.player === "string" ? { player: search.player } : {},
  component: Matches,
});

function Matches() {
  const { gid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  if (!data) return null;
  return <History data={data} />;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function History({ data }: { data: GroupData }) {
  const { player } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const actor = useGroupActor(data);
  const ratings = useReplay(data);
  const names = new Map(data.players.map((p) => [p.id, p.displayName]));
  const gid = data.group.id;

  // BOARD-004: newest first; the snapshot is oldest first.
  const list = data.matches
    .filter((m) => !player || m.teams.some((t) => t.playerIds.includes(player)))
    .reverse();

  return (
    <div className="space-y-4">
      <Can actor={actor} action="match.record">
        <Button asChild className="w-full">
          <Link to="/g/$gid/matches/new" params={{ gid }}>
            Record matches
          </Link>
        </Button>
      </Can>

      <label className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">Player</span>
        <select
          aria-label="Filter by player"
          className="h-9 w-full rounded-md border border-input bg-transparent px-2"
          value={player ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            void navigate({ search: value ? { player: value } : {} });
          }}
        >
          <option value="">Everyone</option>
          {data.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>

      {list.length === 0 ? (
        <p className="text-muted-foreground">No matches yet.</p>
      ) : (
        <ol aria-label="Matches" className="space-y-3">
          {list.map((m) => {
            const changes = ratings.matches.get(m.id);
            return (
              <li key={m.id} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">
                  {dateFormat.format(new Date(m.playedAt))}
                </p>
                {[...m.teams]
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
                              <span className="truncate">
                                {names.get(pid) ?? "Removed player"}
                              </span>
                              <Delta value={delta} />
                            </li>
                          );
                        })}
                      </ul>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {t.score ?? placeLabel(t.rank, m.teams)}
                      </span>
                    </div>
                  ))}
              </li>
            );
          })}
        </ol>
      )}
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

/** BOARD-005: displayed-rating change from this match. */
function Delta({ value }: { value: number }) {
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
