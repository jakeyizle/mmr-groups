import { can } from "@mmr/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { MatchRowEditor } from "@/components/match/row-editor";
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
  nextMinute,
  rowIssues,
  saveDraft,
  toLocalInput,
  toMatchInput,
} from "@/lib/batch";
import { type GroupData, useGroupActor } from "@/lib/groups";
import { usePredictWin } from "@/lib/ratings";

type Issues = Record<number, string[]>;

/** Server issues carry `matches.<i>.…` paths; group their messages by row. */
function issuesByRow(err: unknown): Issues | null {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return null;
  const out: Issues = {};
  for (const d of err.details as { path?: unknown[]; message?: string }[]) {
    const i = d.path?.[1];
    // Stryker disable next-line ConditionalExpression: issues without a row index show on no row either way
    if (typeof i === "number") (out[i] ??= []).push(d.message ?? "Invalid");
  }
  return out;
}

export function BatchEntry({ data }: { data: GroupData }) {
  const { group, players } = data;
  const gid = group.id;
  const draftKey = `mmr:draft:${gid}`;
  const actor = useGroupActor(data);
  const predict = usePredictWin(data);
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
    // Stryker disable next-line ArrayDeclaration: both are fixed for this mount
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
            predict={predict}
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
