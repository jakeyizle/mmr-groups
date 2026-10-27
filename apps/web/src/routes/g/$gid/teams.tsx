import {
  can,
  generateTeams,
  resolveRatingConfig,
  type Suggestion,
} from "@mmr/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { nativeSelect } from "@/components/match/row-editor";
import { Button } from "@/components/ui/button";
import {
  type BatchForm,
  nextMinute,
  saveDraft,
  toLocalInput,
} from "@/lib/batch";
import { type GroupData, groupQuery, useGroupActor } from "@/lib/groups";
import { useReplay } from "@/lib/ratings";

export const Route = createFileRoute("/g/$gid/teams")({ component: Teams });

function Teams() {
  const { gid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  if (!data) return null;
  return <Generator data={data} />;
}

const pct = (x: number) => `${String(Math.round(x * 100))}%`;
const RANGE = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function loadAttendees(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function Generator({ data }: { data: GroupData }) {
  const gid = data.group.id;
  const attendeesKey = `mmr:attendees:${gid}`;
  const actor = useGroupActor(data);
  const navigate = useNavigate();
  const ratings = useReplay(data);
  const groupFormat = data.group.teamFormat;
  const [selected, setSelected] = useState<Set<string>>(() => {
    const ids = new Set(data.players.map((p) => p.id));
    return new Set(loadAttendees(attendeesKey).filter((id) => ids.has(id)));
  });
  // TEAMS-007: flexible groups pick the shape for this suggestion.
  const [format, setFormat] = useState(
    groupFormat.kind === "fixed"
      ? { teams: groupFormat.teams, size: groupFormat.size }
      : { teams: 2, size: 2 },
  );
  const [run, setRun] = useState<{
    skip: number;
    counts: Map<string, number>;
  } | null>(null);

  const names = new Map(data.players.map((p) => [p.id, p.displayName]));
  const setAttendees = (next: Set<string>) => {
    setSelected(next);
    setRun(null);
    try {
      localStorage.setItem(attendeesKey, JSON.stringify([...next]));
    } catch {
      // Not remembered in this browser; harmless.
    }
  };

  const config = resolveRatingConfig(data.group.ratingConfig);
  const suggestion: Suggestion | null = useMemo(
    () =>
      run &&
      generateTeams({
        playerIds: [...selected],
        ratings: ratings.players,
        config,
        format,
        sitOutCounts: run.counts,
        skip: run.skip,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config derives from the snapshot in `ratings`
    [run, selected, ratings, format],
  );

  const regenerate = () => {
    if (!suggestion || "needed" in suggestion || !run) return;
    if (suggestion.sittingOut.length > 0) {
      // TEAMS-003: whoever sat out this time has sat out once more.
      const counts = new Map(run.counts);
      for (const id of suggestion.sittingOut)
        counts.set(id, (counts.get(id) ?? 0) + 1);
      setRun({ skip: 0, counts });
    } else {
      // TEAMS-004: the next most balanced split.
      setRun({ ...run, skip: run.skip + 1 });
    }
  };

  const record = () => {
    if (!suggestion || "needed" in suggestion) return;
    let playedAt = toLocalInput(new Date());
    const draft: BatchForm = {
      rows: suggestion.matches.map((m, i) => {
        if (i > 0) playedAt = nextMinute(playedAt);
        return {
          playedAt,
          teams: m.teams.map((t) => ({ playerIds: t, score: "", rank: "" })),
        };
      }),
    };
    saveDraft(`mmr:draft:${gid}`, draft);
    void navigate({ to: "/g/$gid/matches/new", params: { gid } });
  };
  // Suggestions in a different shape than the group's can't be recorded as-is.
  const recordable =
    groupFormat.kind === "flexible" ||
    (format.teams === groupFormat.teams && format.size === groupFormat.size);

  return (
    <div className="space-y-6">
      {groupFormat.kind === "flexible" && (
        <section aria-label="Format" className="flex gap-2">
          {(["teams", "size"] as const).map((key) => (
            <label key={key} className="flex-1 space-y-1 text-sm">
              <span className="block font-medium">
                {key === "teams" ? "Teams per match" : "Players per team"}
              </span>
              <select
                className={nativeSelect}
                value={format[key]}
                onChange={(e) => {
                  setFormat({ ...format, [key]: Number(e.target.value) });
                  setRun(null);
                }}
              >
                {RANGE(key === "teams" ? 2 : 1, 8).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-lg font-semibold">
            Who&apos;s playing? ({selected.size})
          </h2>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => {
              setAttendees(
                selected.size === data.players.length
                  ? new Set()
                  : new Set(data.players.map((p) => p.id)),
              );
            }}
          >
            {selected.size === data.players.length ? "Clear" : "Everyone"}
          </button>
        </div>
        <ul aria-label="Players" className="grid grid-cols-2 gap-2">
          {data.players.map((p) => (
            <li key={p.id}>
              <label className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm has-checked:border-foreground">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    setAttendees(next);
                  }}
                />
                <span className="truncate">{p.displayName}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            if (run) regenerate();
            else setRun({ skip: 0, counts: new Map() });
          }}
        >
          {run && suggestion && !("needed" in suggestion)
            ? "Regenerate"
            : "Generate teams"}
        </Button>
      </div>

      {suggestion && "needed" in suggestion && (
        <p role="alert" className="text-sm text-destructive">
          Select {suggestion.needed} more{" "}
          {suggestion.needed === 1 ? "player" : "players"} for a match of{" "}
          {format.teams} teams of {format.size}.
        </p>
      )}

      {suggestion && !("needed" in suggestion) && (
        <section aria-label="Suggestion" className="space-y-3">
          {suggestion.matches.map((m, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Match {i + 1}</p>
              <ul className="space-y-1">
                {m.teams.map((t, ti) => (
                  <li
                    key={ti}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1"
                  >
                    <span className="min-w-0 truncate">
                      {t.map((id) => names.get(id) ?? id).join(" & ")}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {pct(m.probabilities[ti] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {suggestion.sittingOut.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Sitting out:{" "}
              {suggestion.sittingOut
                .map((id) => names.get(id) ?? id)
                .join(", ")}
            </p>
          )}
          {can(actor, "match.record") && recordable && (
            <Button variant="outline" className="w-full" onClick={record}>
              Record these
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
