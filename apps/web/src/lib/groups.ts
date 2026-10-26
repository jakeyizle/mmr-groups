import type { Actor } from "@mmr/core";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { client, meQuery, unwrap } from "./api";

export const groupsQuery = queryOptions({
  queryKey: ["groups"],
  queryFn: async () => (await unwrap(await client.groups.$get())).groups,
});

const groupGet = client.groups[":gid"].$get;
export type GroupData = InferResponseType<typeof groupGet, 200>;

export const groupQuery = (gid: string) =>
  queryOptions({
    queryKey: ["group", gid],
    queryFn: async () => unwrap(await groupGet({ param: { gid } })),
  });

/** The signed-in user as an actor in this group, for `can()` / `<Can>`. */
export function useGroupActor(data: GroupData | undefined): Actor {
  const { data: me } = useQuery(meQuery);
  return {
    role: data?.me?.role ?? null,
    playerId: data?.me?.playerId ?? null,
    isSiteAdmin: me?.isSiteAdmin ?? false,
  };
}

export const SCORING_LABELS = {
  required: "Scores required",
  optional: "Scores optional",
  none: "No scores (winner only)",
} as const;

export function formatLabel(f: GroupData["group"]["teamFormat"]) {
  return f.kind === "flexible"
    ? "Flexible (any teams and sizes)"
    : `${String(f.teams)} teams of ${String(f.size)}`;
}

export const ROLE_OPTIONS = { recorder: "Recorder", viewer: "Viewer" };
export const VISIBILITY_OPTIONS = {
  private: "Private (members only)",
  public: "Public (anyone with the link)",
};
