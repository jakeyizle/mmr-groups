import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { client, unwrap } from "@/lib/api";
import { describeEvent } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { groupQuery } from "@/lib/groups";

export const Route = createFileRoute("/g/$gid/audit")({
  beforeLoad: requireUser,
  component: Audit,
});

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function Audit() {
  const { gid } = Route.useParams();
  const { data: group } = useQuery(groupQuery(gid));
  const log = useInfiniteQuery({
    queryKey: ["audit", gid],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await client.groups[":gid"].audit.$get({
          param: { gid },
          query: pageParam ? { cursor: pageParam } : {},
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (log.error) {
    return (
      <p className="text-muted-foreground">
        The audit log is only visible to members.
      </p>
    );
  }
  const names = new Map(group?.players.map((p) => [p.id, p.displayName]));
  const events = log.data?.pages.flatMap((p) => p.events) ?? [];

  return (
    <div className="space-y-4">
      <ol aria-label="Audit log" className="divide-y rounded-lg border">
        {events.map((e) => (
          <li key={e.id} className="space-y-0.5 px-4 py-3">
            <p className="text-sm">{describeEvent(e, names)}</p>
            <p className="text-xs text-muted-foreground">
              {timeFormat.format(new Date(e.createdAt))}
            </p>
          </li>
        ))}
      </ol>
      {log.hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          Show older
        </Button>
      )}
    </div>
  );
}
