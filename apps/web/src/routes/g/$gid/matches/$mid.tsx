import { can, displayRating, isTooFarInFuture } from "@mmr/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { MatchRowEditor } from "@/components/match/row-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, client, unwrap } from "@/lib/api";
import {
  type BatchForm,
  fromMatch,
  matchChanges,
  rowIssues,
} from "@/lib/batch";
import { type GroupData, groupQuery, useGroupActor } from "@/lib/groups";
import { usePredictWin, useReplay } from "@/lib/ratings";

export const Route = createFileRoute("/g/$gid/matches/$mid")({
  component: MatchPage,
});

type Match = GroupData["matches"][number];

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "short",
});

function MatchPage() {
  const { gid, mid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  const [editing, setEditing] = useState(false);
  // Lives here: the form remounts on the newer version after a conflict.
  const [conflict, setConflict] = useState(false);
  const actor = useGroupActor(data);
  if (!data) return null;
  const match = data.matches.find((m) => m.id === mid);
  if (!match) {
    return (
      <p className="text-muted-foreground">
        This match doesn&apos;t exist anymore.{" "}
        <Link to="/g/$gid/matches" params={{ gid }} className="underline">
          Back to matches
        </Link>
      </p>
    );
  }
  const editable = can(actor, "match.edit", {
    recordedByPlayerId: match.recordedByPlayerId ?? null,
  });

  return (
    <div className="space-y-4">
      <MatchView data={data} match={match} />
      {editable &&
        (editing ? (
          <>
            {conflict && (
              <p role="alert" className="text-sm text-destructive">
                This match changed while you were editing. The latest version is
                shown; make your change again.
              </p>
            )}
            {/* Keyed on the version so a newer match resets the form (EDIT-010). */}
            <EditMatch
              key={match.version}
              data={data}
              match={match}
              onConflict={() => {
                setConflict(true);
              }}
              onDone={() => {
                setEditing(false);
                setConflict(false);
              }}
            />
          </>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <DeleteMatch gid={gid} match={match} />
          </div>
        ))}
    </div>
  );
}

function MatchView({ data, match }: { data: GroupData; match: Match }) {
  const ratings = useReplay(data);
  const names = new Map(data.players.map((p) => [p.id, p.displayName]));
  const changes = ratings.matches.get(match.id);
  const recorder =
    match.recordedByPlayerId && names.get(match.recordedByPlayerId);

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">
        {dateFormat.format(new Date(match.playedAt))}
      </p>
      <ol aria-label="Teams" className="space-y-2">
        {[...match.teams]
          .sort((a, b) => a.rank - b.rank)
          .map((t, i) => (
            <li key={i} className="rounded-md bg-muted/50 px-2 py-1">
              <div className="flex justify-between text-sm font-medium">
                <span>
                  {t.rank === 1 ? "Winner" : `Place ${String(t.rank)}`}
                </span>
                <span>{t.score}</span>
              </div>
              <ul>
                {t.playerIds.map((pid) => {
                  // Stryker disable next-line OptionalChaining: every match in the snapshot is replayed
                  const c = changes?.get(pid);
                  const delta = c
                    ? displayRating(c.after) - displayRating(c.before)
                    : 0;
                  return (
                    <li key={pid} className="flex justify-between">
                      <span>{names.get(pid) ?? "Removed player"}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {delta >= 0 ? "+" : "−"}
                        {Math.abs(delta)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
      </ol>
      {match.notes && <p className="text-sm">{match.notes}</p>}
      {recorder && (
        <p className="text-xs text-muted-foreground">Recorded by {recorder}</p>
      )}
    </section>
  );
}

function EditMatch({
  data,
  match,
  onConflict,
  onDone,
}: {
  data: GroupData;
  match: Match;
  onConflict: () => void;
  onDone: () => void;
}) {
  const gid = data.group.id;
  const queryClient = useQueryClient();
  const form = useForm<BatchForm>({
    defaultValues: { rows: [fromMatch(match)] },
  });
  const [notes, setNotes] = useState(match.notes);
  const predict = usePredictWin(data);
  const [issues, setIssues] = useState<string[]>();

  const save = useMutation({
    mutationFn: async (json: ReturnType<typeof matchChanges>) =>
      unwrap(
        await client.groups[":gid"].matches[":mid"].$patch(
          { param: { gid, mid: match.id }, json },
          { headers: { "If-Match": `"${String(match.version)}"` } },
        ),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group", gid] });
      onDone();
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 412) {
        onConflict();
        await queryClient.invalidateQueries({ queryKey: ["group", gid] });
        return;
      }
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setIssues(
          (err.details as { message?: string }[]).map(
            (d) => d.message ?? "Invalid",
          ),
        );
      }
    },
  });

  const onSubmit = (values: BatchForm) => {
    const row = values.rows[0];
    // Stryker disable next-line ConditionalExpression: the form always holds this one row
    if (!row) return;
    const changes = matchChanges(match, row, notes);
    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }
    // Unchanged teams don't have to meet newer settings (EDIT-011).
    const found = changes.teams
      ? rowIssues(row, data.group, new Date())
      : changes.playedAt && isTooFarInFuture(changes.playedAt, new Date())
        ? ["Can't be more than 24 hours from now"]
        : [];
    setIssues(found.length > 0 ? found : undefined);
    if (found.length === 0) save.mutate(changes);
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
      noValidate
    >
      <MatchRowEditor
        index={0}
        form={form}
        players={data.players}
        settings={data.group}
        predict={predict}
        issues={issues}
      />
      <Field>
        <FieldLabel htmlFor="match-notes">Notes</FieldLabel>
        <Textarea
          id="match-notes"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={save.isPending}>
          Save changes
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeleteMatch({ gid, match }: { gid: string; match: Match }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.groups[":gid"].matches[":mid"].$delete(
          { param: { gid, mid: match.id } },
          { headers: { "If-Match": `"${String(match.version)}"` } },
        ),
      ),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group", gid] });
    },
    onSuccess: async () => {
      await navigate({ to: "/g/$gid/matches", params: { gid } });
    },
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this match?</AlertDialogTitle>
          <AlertDialogDescription>
            Ratings are recalculated without it. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              remove.mutate();
            }}
          >
            Delete match
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
