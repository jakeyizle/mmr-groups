import {
  activity,
  bestDuos,
  biggestUpsets,
  longestStreaks,
  ratingHistogram,
  resolveRatingConfig,
} from "@mmr/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";

import { BarChart } from "@/components/charts/bar-chart";
import { RatingChart } from "@/components/charts/rating-chart";
import { SERIES } from "@/lib/charts";
import { type GroupData, groupQuery } from "@/lib/groups";
import { useLeaderboard, useRatingSeries } from "@/lib/ratings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/g/$gid/stats")({ component: Stats });

function Stats() {
  const { gid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  if (!data) return null;
  if (data.matches.length === 0) {
    return <p className="text-muted-foreground">No matches yet.</p>;
  }
  return <GroupStats data={data} />;
}

/** Monday 00:00 in the viewer's zone (stats.md: weeks start Monday). */
function localWeekStart(d: Date) {
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

const shortDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const pct = (x: number) => `${String(Math.round(x * 100))}%`;

function GroupStats({ data }: { data: GroupData }) {
  const gid = data.group.id;
  const names = useMemo(
    () => new Map(data.players.map((p) => [p.id, p.displayName])),
    [data.players],
  );
  const nameOf = (id: string) => names.get(id) ?? "Removed player";
  const board = useLeaderboard(data);
  const series = useRatingSeries(data);
  const { version, ratingConfig } = data.group;

  const derived = useMemo(() => {
    const byName = (id: string) => names.get(id) ?? id;
    const now = new Date();
    return {
      activity: activity(data.matches, now, localWeekStart, byName),
      duos: bestDuos(data.matches, byName),
      upsets: biggestUpsets(
        data.matches,
        resolveRatingConfig(ratingConfig),
        now.toISOString(),
      ),
      streaks: longestStreaks(data.matches, byName),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version identifies the snapshot
  }, [version, names]);
  const histogram = ratingHistogram(board.map((e) => e.rating));
  const matchById = new Map(data.matches.map((m) => [m.id, m]));

  return (
    <div className="space-y-8">
      <GroupRatings board={board} series={series} nameOf={nameOf} />

      <Section title="Activity">
        <BarChart
          label="Matches per week, last 12 weeks"
          valueName="Matches"
          data={derived.activity.weeks.map((w) => ({
            label: shortDate.format(new Date(w.week)),
            value: w.matches,
          }))}
        />
        <Ranked
          label="Most active, last 30 days"
          empty="No matches in the last 30 days."
          items={derived.activity.mostActive.map((p) => ({
            key: p.playerId,
            name: nameOf(p.playerId),
            value: `${String(p.matches)} ${p.matches === 1 ? "match" : "matches"}`,
          }))}
        />
      </Section>

      <Section title="Best duos">
        <Ranked
          label="Best duos"
          empty="Duos appear after 3 matches as teammates."
          items={derived.duos.map((d) => ({
            key: d.playerIds.join("|"),
            name: d.playerIds.map(nameOf).join(" & "),
            value: `${String(d.wins)}–${String(d.losses)}${d.ties ? `–${String(d.ties)}` : ""} · ${pct(d.winRate)}`,
          }))}
        />
      </Section>

      <Section title="Biggest upsets">
        <Ranked
          label="Biggest upsets"
          empty="No 2-team matches yet."
          items={derived.upsets.map((u) => {
            const m = matchById.get(u.matchId);
            const team = (i: number) =>
              (m?.teams[i]?.playerIds ?? []).map(nameOf).join(" & ");
            return {
              key: u.matchId,
              name: (
                <Link
                  to="/g/$gid/matches/$mid"
                  params={{ gid, mid: u.matchId }}
                  className="hover:underline"
                >
                  {team(u.winner)} beat {team(1 - u.winner)}
                </Link>
              ),
              value: `${pct(u.probability)} chance`,
            };
          })}
        />
      </Section>

      <Section title="Longest win streaks">
        <Ranked
          label="Longest win streaks"
          empty="No wins yet."
          items={derived.streaks.map((s) => ({
            key: s.playerId,
            name: nameOf(s.playerId),
            value: `${String(s.length)} in a row`,
          }))}
        />
      </Section>

      <Section title="Rating distribution">
        <BarChart
          label="Players per rating range"
          valueName="Players"
          data={histogram.map((b) => ({
            label: String(b.from),
            value: b.count,
          }))}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Ranked({
  label,
  items,
  empty,
}: {
  label: string;
  items: { key: string; name: ReactNode; value: string }[];
  empty: string;
}) {
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol aria-label={label} className="divide-y rounded-lg border">
      {items.map((item, i) => (
        <li
          key={item.key}
          className="flex items-center gap-3 px-3 py-2 text-sm"
        >
          <span className="w-4 shrink-0 text-right text-muted-foreground tabular-nums">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {item.value}
          </span>
        </li>
      ))}
    </ol>
  );
}

const MAX_LINES = SERIES.length;

/**
 * STATS-006: the top players by default. Each shown player holds a color slot
 * until removed, so toggling others never repaints them.
 */
function GroupRatings({
  board,
  series,
  nameOf,
}: {
  board: { playerId: string }[];
  series: ReturnType<typeof useRatingSeries>;
  nameOf: (id: string) => string;
}) {
  const [slots, setSlots] = useState<Map<string, number>>(
    () => new Map(board.slice(0, MAX_LINES).map((e, i) => [e.playerId, i])),
  );
  const toggle = (id: string) => {
    setSlots((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else {
        const used = new Set(next.values());
        const free = SERIES.findIndex((_, i) => !used.has(i));
        if (free >= 0) next.set(id, free);
      }
      return next;
    });
  };
  const shown = board.filter((e) => slots.has(e.playerId));

  return (
    <Section title="Ratings over time">
      <RatingChart
        label="Each player's rating over time"
        series={shown.map((e) => ({
          id: e.playerId,
          name: nameOf(e.playerId),
          color: SERIES[slots.get(e.playerId) ?? 0] ?? "",
          points: series.get(e.playerId) ?? [],
        }))}
      />
      {/* Legend and toggles: identity is never color alone. */}
      <ul aria-label="Players shown" className="flex flex-wrap gap-2">
        {board.map((e) => {
          const slot = slots.get(e.playerId);
          const full = slot === undefined && slots.size >= MAX_LINES;
          return (
            <li key={e.playerId}>
              <button
                type="button"
                aria-pressed={slot !== undefined}
                disabled={full}
                onClick={() => {
                  toggle(e.playerId);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  slot === undefined && "text-muted-foreground",
                  full && "opacity-50",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full border"
                  style={
                    slot === undefined
                      ? undefined
                      : { background: SERIES[slot] }
                  }
                />
                {nameOf(e.playerId)}
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
