import { compareMatches, type PairRecord, playerStats } from "@mmr/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { RatingChart } from "@/components/charts/rating-chart";
import { MatchCard } from "@/components/match/match-card";
import { PlayerLink } from "@/components/player-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SERIES } from "@/lib/charts";
import { type GroupData, groupQuery } from "@/lib/groups";
import { useLeaderboard, useRatingSeries, useReplay } from "@/lib/ratings";

export const Route = createFileRoute("/g/$gid/players/$pid")({
  component: PlayerPage,
});

function PlayerPage() {
  const { gid, pid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  if (!data) return null;
  const player = data.players.find((p) => p.id === pid);
  if (!player) {
    return <p className="text-muted-foreground">No such player.</p>;
  }
  // Keyed so paging restarts on another player's profile.
  return <Profile key={pid} data={data} pid={pid} name={player.displayName} />;
}

const pct = (x: number) => `${String(Math.round(x * 100))}%`;
const wlt = (r: { wins: number; losses: number; ties: number }) =>
  `${String(r.wins)}–${String(r.losses)}${r.ties > 0 ? `–${String(r.ties)}` : ""}`;
const STREAK = { win: "W", loss: "L", tie: "T" } as const;
const PAGE = 20;

function Profile({
  data,
  pid,
  name,
}: {
  data: GroupData;
  pid: string;
  name: string;
}) {
  const gid = data.group.id;
  const names = useMemo(
    () => new Map(data.players.map((p) => [p.id, p.displayName])),
    [data.players],
  );
  const board = useLeaderboard(data);
  const ratings = useReplay(data);
  const series = useRatingSeries(data);
  const stats = useMemo(
    () => playerStats(data.matches, pid, (id) => names.get(id) ?? id),
    [data.matches, pid, names],
  );
  const entry = board.find((e) => e.playerId === pid);
  // STATS-012: all their matches, newest first.
  const history = useMemo(
    () =>
      data.matches
        .filter((m) => m.teams.some((t) => t.playerIds.includes(pid)))
        .sort((a, b) => compareMatches(b, a)),
    [data.matches, pid],
  );
  const [shown, setShown] = useState(PAGE);
  const { record } = stats;

  return (
    <div className="space-y-6">
      <section className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-xl font-semibold">
            {name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {entry ? `#${String(entry.rank)} on the leaderboard` : "Unrated"}
          </p>
        </div>
        {entry && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold tabular-nums">
              {entry.rating}
            </p>
            {entry.provisional && <Badge variant="outline">Provisional</Badge>}
          </div>
        )}
      </section>

      {record.matches === 0 ? (
        <p className="text-muted-foreground">No matches yet.</p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Rating over time</h3>
            <RatingChart
              label={`${name}'s rating over time`}
              series={[
                {
                  id: pid,
                  name,
                  // Stryker disable all: SERIES has colors, and every rated player a series
                  color: SERIES[0] ?? "",
                  points: series.get(pid) ?? [],
                  // Stryker restore all
                },
              ]}
            />
          </section>

          <section aria-label="Record">
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Record", wlt(record)],
                ["Win rate", pct(record.winRate)],
                ["Matches", String(record.matches)],
                [
                  "Streak",
                  // Stryker disable next-line all: a player with matches always has a current streak
                  stats.currentStreak
                    ? `${STREAK[stats.currentStreak.outcome]}${String(stats.currentStreak.length)}`
                    : "–",
                ],
                ["Best streak", `W${String(stats.longestWinStreak)}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <PairList
            title="Best partners"
            pairs={stats.partners.best}
            gid={gid}
            names={names}
          />
          <PairList
            title="Toughest partnerships"
            pairs={stats.partners.worst}
            gid={gid}
            names={names}
          />
          <PairList
            title="Head to head"
            pairs={stats.headToHead}
            gid={gid}
            names={names}
          />

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Match history</h3>
            <ol aria-label="Match history" className="space-y-3">
              {history.slice(0, shown).map((m) => (
                <li key={m.id}>
                  <MatchCard
                    gid={gid}
                    match={m}
                    names={names}
                    changes={ratings.matches.get(m.id)}
                    perspective={pid}
                  />
                </li>
              ))}
            </ol>
            {shown < history.length && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShown((n) => n + PAGE);
                }}
              >
                Show more
              </Button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PairList({
  title,
  pairs,
  gid,
  names,
}: {
  title: string;
  pairs: PairRecord[];
  gid: string;
  names: Map<string, string>;
}) {
  if (pairs.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul aria-label={title} className="divide-y rounded-lg border">
        {pairs.map((p) => (
          <li
            key={p.playerId}
            className="flex justify-between px-3 py-2 text-sm"
          >
            <PlayerLink
              gid={gid}
              id={p.playerId}
              names={names}
              className="truncate"
            />
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {wlt(p)} · {pct(p.winRate)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
