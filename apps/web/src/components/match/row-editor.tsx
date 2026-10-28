import type { MatchSettings } from "@mmr/core";
import { type Control, type UseFormReturn, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type BatchForm, type MatchRow, needsPlacement } from "@/lib/batch";
import type { GroupData } from "@/lib/groups";
import { cn } from "@/lib/utils";

type Player = GroupData["players"][number];

const MAX_TEAMS = 8;
const MAX_TEAM_SIZE = 8;

// Stryker disable StringLiteral: class names
export const nativeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";
// Stryker restore StringLiteral

/** One match's teams, scores and placement; rows live in a `BatchForm` (one row when editing). */
export function MatchRowEditor({
  index,
  form,
  players,
  settings,
  predict,
  issues,
  canRemove,
  onRemove,
  onDuplicate,
}: {
  index: number;
  form: UseFormReturn<BatchForm>;
  players: Player[];
  settings: MatchSettings;
  /** MATCH-016: win probability per team, shown once every slot is filled. */
  predict?: (teams: string[][]) => number[];
  issues: string[] | undefined;
  canRemove?: boolean;
  onRemove?: () => void;
  onDuplicate?: () => void;
}) {
  const label = `Match ${String(index + 1)}`;
  const name = `rows.${index}` as const;
  const row = useWatch({ control: form.control, name }) as MatchRow | undefined;
  if (!row) return null;
  const flexible = settings.teamFormat.kind === "flexible";
  const placement = needsPlacement(row, settings);
  const ids = row.teams.flatMap((t) => t.playerIds);
  const chosen = new Set(ids);
  const complete = ids.every(Boolean) && new Set(ids).size === ids.length;
  const odds =
    predict && complete ? predict(row.teams.map((t) => t.playerIds)) : null;
  const setTeams = (teams: MatchRow["teams"]) => {
    form.setValue(`${name}.teams`, teams);
  };

  return (
    <fieldset
      className={cn(
        "space-y-3 rounded-lg border p-3",
        issues && "border-destructive",
      )}
      aria-label={label}
    >
      <div className="flex items-center justify-between gap-2">
        <legend className="font-medium">{label}</legend>
        <div className="flex gap-1">
          {onDuplicate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDuplicate}
            >
              Duplicate
            </Button>
          )}
          {canRemove && onRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <Input
        type="datetime-local"
        aria-label={`${label} date and time`}
        {...form.register(`${name}.playedAt`)}
      />

      {row.teams.map((team, t) => {
        const teamLabel = `${label} team ${String(t + 1)}`;
        return (
          <div key={t} className="space-y-2 rounded-md bg-muted/50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                Team {t + 1}
                {odds?.[t] !== undefined && (
                  <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                    {Math.round(odds[t] * 100)}% to win
                  </span>
                )}
              </span>
              {flexible && row.teams.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTeams(row.teams.filter((_, x) => x !== t));
                  }}
                >
                  Remove team
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {team.playerIds.map((_, s) => (
                <select
                  key={s}
                  aria-label={`${teamLabel} player ${String(s + 1)}`}
                  className={nativeSelect}
                  {...form.register(`${name}.teams.${t}.playerIds.${s}`)}
                >
                  <option value="">Player…</option>
                  {players.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={chosen.has(p.id) && team.playerIds[s] !== p.id}
                    >
                      {p.displayName}
                    </option>
                  ))}
                </select>
              ))}
            </div>
            {flexible && (
              <div className="flex gap-1">
                {team.playerIds.length < MAX_TEAM_SIZE && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTeams(
                        row.teams.map((x, ti) =>
                          ti === t
                            ? { ...x, playerIds: [...x.playerIds, ""] }
                            : x,
                        ),
                      );
                    }}
                  >
                    + Player
                  </Button>
                )}
                {team.playerIds.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTeams(
                        row.teams.map((x, ti) =>
                          ti === t
                            ? { ...x, playerIds: x.playerIds.slice(0, -1) }
                            : x,
                        ),
                      );
                    }}
                  >
                    − Player
                  </Button>
                )}
              </div>
            )}
            {settings.scoringMode !== "none" && (
              <Input
                inputMode="numeric"
                placeholder="Score"
                aria-label={`${teamLabel} score`}
                {...form.register(`${name}.teams.${t}.score`)}
              />
            )}
            {placement && row.teams.length > 2 && (
              <select
                aria-label={`${teamLabel} place`}
                className={nativeSelect}
                {...form.register(`${name}.teams.${t}.rank`)}
              >
                <option value="">Place…</option>
                {row.teams.map((_, r) => (
                  <option key={r} value={String(r + 1)}>
                    {ordinal(r + 1)}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}

      {flexible && row.teams.length < MAX_TEAMS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setTeams([...row.teams, { playerIds: [""], score: "", rank: "" }]);
          }}
        >
          + Team
        </Button>
      )}

      {placement && row.teams.length === 2 && (
        <WinnerPicker
          label={label}
          control={form.control}
          index={index}
          allowTies={settings.allowTies}
          onChange={(ranks) => {
            ranks.forEach((r, t) => {
              form.setValue(`${name}.teams.${t}.rank`, r);
            });
          }}
        />
      )}

      {issues && (
        <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
          {issues.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

const ordinal = (n: number) =>
  `${String(n)}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** MATCH-012 for two teams: pick the winner (or a tie, when allowed). */
function WinnerPicker({
  label,
  control,
  index,
  allowTies,
  onChange,
}: {
  label: string;
  control: Control<BatchForm>;
  index: number;
  allowTies: boolean;
  onChange: (ranks: [string, string]) => void;
}) {
  const teams = useWatch({ control, name: `rows.${index}.teams` });
  const key = teams.map((t) => t.rank).join(",");
  const options: { value: string; text: string; ranks: [string, string] }[] = [
    { value: "1,2", text: "Team 1", ranks: ["1", "2"] },
    { value: "2,1", text: "Team 2", ranks: ["2", "1"] },
    ...(allowTies
      ? [{ value: "1,1", text: "Tie", ranks: ["1", "1"] as [string, string] }]
      : []),
  ];
  return (
    <div role="radiogroup" aria-label={`${label} winner`} className="space-y-1">
      <span className="text-sm font-medium">Winner</span>
      <div className="flex gap-2">
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={key === o.value}
            variant={key === o.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              onChange(o.ranks);
            }}
          >
            {o.text}
          </Button>
        ))}
      </div>
    </div>
  );
}
