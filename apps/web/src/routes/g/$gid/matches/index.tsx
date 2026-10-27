import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { MatchCard } from "@/components/match/match-card";

import { Button } from "@/components/ui/button";
import { Can } from "@/lib/can";
import { type GroupData, groupQuery, useGroupActor } from "@/lib/groups";
import { useReplay } from "@/lib/ratings";

interface HistorySearch {
  player?: string;
}

export const Route = createFileRoute("/g/$gid/matches/")({
  // BOARD-006: the filter is in the URL so it can be linked to. `undefined` overrides a bad
  // raw value (see validateBrowseSearch).
  validateSearch: (search: Record<string, unknown>): HistorySearch => ({
    player: typeof search.player === "string" ? search.player : undefined,
  }),
  component: Matches,
});

function Matches() {
  const { gid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  if (!data) return null;
  return <History data={data} />;
}

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
          {list.map((m) => (
            <li key={m.id}>
              <MatchCard
                gid={gid}
                match={m}
                names={names}
                changes={ratings.matches.get(m.id)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
