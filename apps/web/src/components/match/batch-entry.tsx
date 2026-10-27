import { can, type MatchSettings } from "@mmr/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type Control,
  useFieldArray,
  useForm,
  type UseFormReturn,
  useWatch,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, client, unwrap } from "@/lib/api";
import {
  type BatchForm,
  blankRow,
  clearDraft,
  duplicateRow,
  loadDraft,
  type MatchRow,
  needsPlacement,
  nextMinute,
  rowIssues,
  saveDraft,
  toLocalInput,
  toMatchInput,
} from "@/lib/batch";
import { type GroupData, useGroupActor } from "@/lib/groups";
import { cn } from "@/lib/utils";

type Player = GroupData["players"][number];
type Issues = Record<number, string[]>;

const MAX_TEAMS = 8;
const MAX_TEAM_SIZE = 8;

const nativeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** Server issues carry `matches.<i>.…` paths; group their messages by row. */
function issuesByRow(err: unknown): Issues | null {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return null;
  const out: Issues = {};
  for (const d of err.details as { path?: unknown[]; message?: string }[]) {
    const i = d.path?.[1];
    if (typeof i === "number") (out[i] ??= []).push(d.message ?? "Invalid");
  }
  return out;
}

export function BatchEntry({ data }: { data: GroupData }) {
  const { group, players } = data;
  const gid = group.id;
  const draftKey = `mmr:draft:${gid}`;
  const actor = useGroupActor(data);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [issues, setIssues] = useState<Issues>({});

  const form = useForm<BatchForm>({
    defaultValues: () =>
      Promise.resolve(
        loadDraft(draftKey) ?? {
          rows: [blankRow(group.teamFormat, toLocalInput(new Date()))],
        },
      ),
  });
  const rows = useFieldArray({ control: form.control, name: "rows" });

  useEffect(
    () =>
      form.subscribe({
        formState: { values: true },
        callback: ({ values }) => {
          saveDraft(draftKey, values);
        },
      }),
    [form, draftKey],
  );

  const submit = useMutation({
    mutationFn: async (values: BatchForm) =>
      unwrap(
        await client.groups[":gid"].matches.$post({
          param: { gid },
          json: { matches: values.rows.map(toMatchInput) },
        }),
      ),
    onSuccess: async () => {
      clearDraft(draftKey);
      await queryClient.invalidateQueries({ queryKey: ["group", gid] });
      await navigate({ to: "/g/$gid/matches", params: { gid } });
    },
    onError: (err) => {
      setIssues(issuesByRow(err) ?? {});
    },
  });

  const onSubmit = (values: BatchForm) => {
    const now = new Date();
    const found: Issues = {};
    values.rows.forEach((row, i) => {
      const list = rowIssues(row, group, now);
      if (list.length > 0) found[i] = list;
    });
    setIssues(found);
    if (Object.keys(found).length === 0) submit.mutate(values);
  };

  const lastRow = () => form.getValues(`rows.${rows.fields.length - 1}`);
  const count = rows.fields.length;

  if (!can(actor, "match.record")) {
    return (
      <p className="text-muted-foreground">
        You can view this group but not record matches.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {can(actor, "player.manage") && <AddPlayerInline gid={gid} />}
      <form
        className="space-y-4"
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        noValidate
      >
        {rows.fields.map((field, i) => (
          <MatchRowEditor
            key={field.id}
            index={i}
            form={form}
            players={players}
            settings={group}
            issues={issues[i]}
            canRemove={count > 1}
            onRemove={() => {
              rows.remove(i);
              setIssues({});
            }}
            onDuplicate={() => {
              rows.insert(i + 1, duplicateRow(form.getValues(`rows.${i}`)));
            }}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={count >= 50}
            onClick={() => {
              rows.append(
                blankRow(group.teamFormat, nextMinute(lastRow().playedAt)),
              );
            }}
          >
            Add match
          </Button>
        </div>
        {submit.isError && !issuesByRow(submit.error) && (
          <FieldError errors={[submit.error]} />
        )}
        <Button type="submit" className="w-full" disabled={submit.isPending}>
          Save {count === 1 ? "match" : `${String(count)} matches`}
        </Button>
      </form>
    </div>
  );
}

function MatchRowEditor({
  index,
  form,
  players,
  settings,
  issues,
  canRemove,
  onRemove,
  onDuplicate,
}: {
  index: number;
  form: UseFormReturn<BatchForm>;
  players: Player[];
  settings: MatchSettings;
  issues: string[] | undefined;
  canRemove: boolean;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const label = `Match ${String(index + 1)}`;
  const name = `rows.${index}` as const;
  const row = useWatch({ control: form.control, name }) as MatchRow | undefined;
  if (!row) return null;
  const flexible = settings.teamFormat.kind === "flexible";
  const chosen = new Set(row.teams.flatMap((t) => t.playerIds).filter(Boolean));
  const placement = needsPlacement(row, settings);
  const setTeams = (teams: MatchRow["teams"]) => {
    form.setValue(`${name}.teams`, teams, { shouldDirty: true });
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
          <Button type="button" variant="ghost" size="sm" onClick={onDuplicate}>
            Duplicate
          </Button>
          {canRemove && (
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
              <span className="text-sm font-medium">Team {t + 1}</span>
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
              form.setValue(`${name}.teams.${t}.rank`, r, {
                shouldDirty: true,
              });
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

/** MATCH-015: add a missing player without leaving the batch. */
function AddPlayerInline({ gid }: { gid: string }) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.groups[":gid"].players.$post({
          param: { gid },
          json: { players: [{ name }] },
        }),
      ),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["group", gid] });
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <Field data-invalid={add.isError}>
        <FieldLabel htmlFor="new-player">New player</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="new-player"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              add.reset();
            }}
            aria-invalid={add.isError}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={name.trim() === "" || add.isPending}
          >
            Add
          </Button>
        </div>
        <FieldError errors={[add.error ?? undefined]} />
      </Field>
    </form>
  );
}
