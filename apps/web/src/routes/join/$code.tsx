import { nameSchema } from "@mmr/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Navigate,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, client, unwrap } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ROLE_OPTIONS } from "@/lib/groups";

// JOIN-004: signed-out visitors sign in and come back here.
export const Route = createFileRoute("/join/$code")({
  beforeLoad: requireUser,
  component: Join,
});

function Join() {
  const { code } = Route.useParams();
  const offer = useQuery({
    queryKey: ["invite", code],
    queryFn: async () =>
      unwrap(await client.invites[":code"].$get({ param: { code } })),
  });

  if (offer.error) {
    // JOIN-009: no group details for revoked, expired or unknown links.
    return (
      <section className="space-y-3 text-center">
        <h1 className="font-heading text-2xl font-semibold">Invite link</h1>
        <p className="text-muted-foreground">
          This invite link is no longer valid. Ask the group for a new one.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Go home</Link>
        </Button>
      </section>
    );
  }
  if (!offer.data) return null;
  const { group, member, players } = offer.data;
  // JOIN-008: members go straight to the group.
  if (member)
    return <Navigate to="/g/$gid" params={{ gid: group.id }} replace />;
  return (
    <Claim
      code={code}
      groupId={group.id}
      groupName={group.name}
      players={players}
    />
  );
}

function Claim({
  code,
  groupId,
  groupName,
  players,
}: {
  code: string;
  groupId: string;
  groupName: string;
  players: { id: string; displayName: string; role: string }[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState<string | null>(null);
  const claim = useMutation({
    mutationFn: async (
      json: { playerId: string } | { newPlayerName: string },
    ) =>
      unwrap(
        await client.invites[":code"].claim.$post({ param: { code }, json }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await navigate({ to: "/g/$gid", params: { gid: groupId } });
    },
    onError: async (err) => {
      // JOIN-013: someone else claimed it first; offer what's left.
      if (err instanceof ApiError && err.code === "claim_lost") {
        await queryClient.invalidateQueries({ queryKey: ["invite", code] });
      }
    },
  });
  const nameValid = newName !== null && nameSchema.safeParse(newName).success;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Join {groupName}
        </h1>
        <p className="text-muted-foreground">Which player are you?</p>
      </div>
      {claim.error && (
        <p role="alert" className="text-sm text-destructive">
          {claim.error instanceof ApiError && claim.error.code === "claim_lost"
            ? "Someone else just claimed that player. Pick again."
            : claim.error.message}
        </p>
      )}
      {players.length > 0 && (
        <ul aria-label="Unclaimed players" className="grid gap-2">
          {players.map((p) => (
            <li key={p.id}>
              <Button
                variant="outline"
                className="h-12 w-full justify-between"
                disabled={claim.isPending}
                onClick={() => {
                  claim.mutate({ playerId: p.id });
                }}
              >
                <span>{p.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {ROLE_OPTIONS[p.role as keyof typeof ROLE_OPTIONS]}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {newName === null ? (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setNewName("");
          }}
        >
          I&apos;m not listed
        </Button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nameValid) claim.mutate({ newPlayerName: newName });
          }}
        >
          <Field>
            <FieldLabel htmlFor="new-name">Your name in this group</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="new-name"
                autoFocus
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  claim.reset();
                }}
              />
              <Button type="submit" disabled={!nameValid || claim.isPending}>
                Join
              </Button>
            </div>
          </Field>
        </form>
      )}
    </section>
  );
}
