import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { nativeSelect } from "@/components/match/row-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { client, unwrap } from "@/lib/api";
import type { GroupData } from "@/lib/groups";

// A list: object keys like "1" would sort before "never".
const EXPIRY = [
  ["never", "Never"],
  ["1", "1 day"],
  ["7", "7 days"],
  ["30", "30 days"],
] as const;
type Expiry = (typeof EXPIRY)[number][0];

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** JOIN-001/002/003: one link per group; regenerating replaces it. */
export function InviteSettings({ data }: { data: GroupData }) {
  const gid = data.group.id;
  const invite = data.invite;
  const queryClient = useQueryClient();
  const [expiry, setExpiry] = useState<Expiry>("never");
  const [copied, setCopied] = useState(false);
  const url = invite ? `${location.origin}/join/${invite.code}` : null;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["group", gid] });
  const generate = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.groups[":gid"].invite.$put({
          param: { gid },
          // Stryker disable next-line ConditionalExpression,StringLiteral: Number("never") is NaN, sent as null too
          json: { expiresInDays: expiry === "never" ? null : Number(expiry) },
        }),
      ),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: async () =>
      unwrap(await client.groups[":gid"].invite.$delete({ param: { gid } })),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-4">
      {url ? (
        <Field>
          <FieldLabel htmlFor="invite-url">Invite link</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="invite-url"
              readOnly
              value={url}
              onFocus={(e) => {
                e.target.select();
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    setCopied(true);
                  })
                  .catch(() => {
                    // No clipboard access: the field stays selectable.
                  });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <FieldDescription>
            Anyone with this link can join and claim an unclaimed player.{" "}
            {
              // Stryker disable next-line OptionalChaining: there's a URL only with an invite
              invite?.expiresAt
                ? `Expires ${dateFormat.format(new Date(invite.expiresAt))}.`
                : "It doesn't expire."
            }
          </FieldDescription>
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          No invite link. Create one to let people join and claim their player.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Expires after</span>
          <select
            className={nativeSelect}
            value={expiry}
            onChange={(e) => {
              setExpiry(e.target.value as Expiry);
            }}
          >
            {EXPIRY.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={generate.isPending}
          onClick={() => {
            setCopied(false);
            generate.mutate();
          }}
        >
          {url ? "New link" : "Create link"}
        </Button>
        {url && (
          <Button
            type="button"
            variant="ghost"
            disabled={revoke.isPending}
            onClick={() => {
              revoke.mutate();
            }}
          >
            Revoke
          </Button>
        )}
      </div>
    </div>
  );
}
