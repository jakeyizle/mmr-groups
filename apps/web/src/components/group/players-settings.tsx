import { type Actor, can, type Role, validRoleFor } from "@mmr/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { client, unwrap } from "@/lib/api";
import { Can } from "@/lib/can";
import { type GroupData, useGroupActor } from "@/lib/groups";

type Player = GroupData["players"][number];

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  recorder: "Recorder",
  viewer: "Viewer",
};

/** Roles this actor may give this player (always including its current one). */
function roleChoices(actor: Actor, p: Player): Role[] {
  return (["admin", "recorder", "viewer"] as const).filter(
    (to) =>
      to === p.role ||
      (can(actor, "player.setRole", { from: p.role, to }) &&
        validRoleFor({ linked: p.linked }, to)),
  );
}

export function PlayersSettings({ data }: { data: GroupData }) {
  const actor = useGroupActor(data);
  return (
    <div className="space-y-4">
      <Can actor={actor} action="player.manage">
        <AddPlayers gid={data.group.id} />
      </Can>
      <ul className="divide-y rounded-lg border">
        {data.players.map((p) => (
          <PlayerRow key={p.id} gid={data.group.id} player={p} actor={actor} />
        ))}
      </ul>
    </div>
  );
}

function useInvalidateGroup(gid: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["group", gid] });
}

function AddPlayers({ gid }: { gid: string }) {
  const [text, setText] = useState("");
  const invalidate = useInvalidateGroup(gid);
  const names = text
    .split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean);
  const add = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.groups[":gid"].players.$post({
          param: { gid },
          json: { players: names.map((name) => ({ name })) },
        }),
      ),
    onSuccess: async () => {
      setText("");
      await invalidate();
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
        <FieldLabel htmlFor="add-players">Add players</FieldLabel>
        <Textarea
          id="add-players"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            add.reset();
          }}
          placeholder={"Dave\nSue"}
          rows={3}
          aria-invalid={add.isError}
        />
        <FieldDescription>
          One name per line. They can claim their player later with an invite
          link.
        </FieldDescription>
        <FieldError errors={[add.error ?? undefined]} />
        <Button
          type="submit"
          variant="outline"
          className="w-fit"
          disabled={names.length === 0 || add.isPending}
        >
          Add {names.length > 1 ? `${String(names.length)} players` : "player"}
        </Button>
      </Field>
    </form>
  );
}

function PlayerRow({
  gid,
  player,
  actor,
}: {
  gid: string;
  player: Player;
  actor: Actor;
}) {
  const [editing, setEditing] = useState(false);
  const choices = roleChoices(actor, player);
  const canRename = can(actor, "player.manage");
  const canUnlink =
    player.linked && can(actor, "player.unlink", { role: player.role });
  // Removing a claimed player also removes its user: same permission as unlinking.
  const canRemove = canRename && (!player.linked || canUnlink);
  const editable = canRename || choices.length > 1 || canUnlink;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{player.displayName}</p>
          <p className="text-sm text-muted-foreground">
            {player.linked ? "Claimed" : "Unclaimed"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">{ROLE_LABELS[player.role]}</Badge>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={editing}
              aria-label={`Edit ${player.displayName}`}
              onClick={() => {
                setEditing((v) => !v);
              }}
            >
              {editing ? "Done" : "Edit"}
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <PlayerEditor
          gid={gid}
          player={player}
          choices={choices}
          canRename={canRename}
          canRemove={canRemove}
          canUnlink={canUnlink}
        />
      )}
    </li>
  );
}

function PlayerEditor({
  gid,
  player,
  choices,
  canRename,
  canRemove,
  canUnlink,
}: {
  gid: string;
  player: Player;
  choices: Role[];
  canRename: boolean;
  canRemove: boolean;
  canUnlink: boolean;
}) {
  const invalidate = useInvalidateGroup(gid);
  const [name, setName] = useState(player.displayName);
  const param = { gid, pid: player.id };

  const update = useMutation({
    mutationFn: async (json: { displayName?: string; role?: Role }) =>
      unwrap(
        await client.groups[":gid"].players[":pid"].$patch({ param, json }),
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await client.groups[":gid"].players[":pid"].$delete({ param })),
    onSuccess: invalidate,
  });
  const unlink = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.groups[":gid"].players[":pid"].unlink.$post({ param }),
      ),
    onSuccess: invalidate,
  });
  const nameId = `name-${player.id}`;
  const roleId = `role-${player.id}`;

  return (
    <div className="mt-3 space-y-4">
      {canRename && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ displayName: name });
          }}
        >
          <Field data-invalid={update.isError}>
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <div className="flex gap-2">
              <Input
                id={nameId}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  update.reset();
                }}
                aria-invalid={update.isError}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={
                  name.trim() === player.displayName || update.isPending
                }
              >
                Rename
              </Button>
            </div>
            <FieldError errors={[update.error ?? undefined]} />
          </Field>
        </form>
      )}
      {choices.length > 1 && (
        <Field>
          <FieldLabel htmlFor={roleId}>Role</FieldLabel>
          <Select
            value={player.role}
            onValueChange={(role) => {
              update.mutate({ role: role as Role });
            }}
          >
            <SelectTrigger id={roleId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!player.linked && (
            <FieldDescription>
              Whoever claims this player gets this role. Only claimed players
              can be admins.
            </FieldDescription>
          )}
        </Field>
      )}
      {(canUnlink || canRemove) && (
        <div className="flex flex-wrap gap-2">
          {canUnlink && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                unlink.mutate();
              }}
            >
              Unlink account
            </Button>
          )}
          {canRemove && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                remove.mutate();
              }}
            >
              Remove player
            </Button>
          )}
        </div>
      )}
      <FieldError errors={[remove.error ?? unlink.error ?? undefined]} />
    </div>
  );
}
