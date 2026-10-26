import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client, unwrap } from "@/lib/api";
import { Can } from "@/lib/can";
import { type GroupData, useGroupActor } from "@/lib/groups";

/** Owner-only actions (GROUP-007, GROUP-008); hidden from everyone else (ROLE-008). */
export function DangerZone({ data }: { data: GroupData }) {
  const actor = useGroupActor(data);
  return (
    <Can actor={actor} action="group.delete">
      <section className="space-y-4 rounded-lg border border-destructive/40 p-4">
        <h2 className="font-heading text-lg font-semibold">Danger zone</h2>
        <TransferOwnership data={data} />
        <DeleteGroup data={data} />
      </section>
    </Can>
  );
}

function TransferOwnership({ data }: { data: GroupData }) {
  const { group, players, me } = data;
  const queryClient = useQueryClient();
  const [playerId, setPlayerId] = useState<string>();
  // Ownership can only go to a linked player (GROUP-009).
  const candidates = players.filter((p) => p.linked && p.id !== me?.playerId);
  const target = candidates.find((p) => p.id === playerId);

  const transfer = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await client.groups[":gid"].transfer.$post({
          param: { gid: group.id },
          json: { playerId: id },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["group", group.id] }),
  });

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        To transfer ownership, another member must first join with an invite
        link.
      </p>
    );
  }
  return (
    <Field>
      <FieldLabel htmlFor="transfer-to">Transfer ownership</FieldLabel>
      <div className="flex gap-2">
        <Select value={playerId} onValueChange={setPlayerId}>
          <SelectTrigger id="transfer-to" className="flex-1">
            <SelectValue placeholder="Choose a member" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={!target}>
              Transfer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Make {target?.displayName} the owner?
              </AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ll become an admin. Only the new owner can undo this.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (target) transfer.mutate(target.id);
                }}
              >
                Transfer ownership
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Field>
  );
}

function DeleteGroup({ data }: { data: GroupData }) {
  const { group } = data;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await client.groups[":gid"].$delete({ param: { gid: group.id } })),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["group", group.id] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await navigate({ to: "/" });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete group</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the group, its players, matches and audit
            log. It can&apos;t be undone.
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
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
