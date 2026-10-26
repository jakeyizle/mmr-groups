import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { meQuery } from "@/lib/api";
import { groupsQuery } from "@/lib/groups";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { data: me, isPending } = useQuery(meQuery);
  if (isPending) return null;
  return me ? <MyGroups /> : <Landing />;
}

function Landing() {
  return (
    <section className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">
        Track your group&apos;s ratings
      </h1>
      <p className="text-muted-foreground">
        Record matches with your regular crew and see who&apos;s on top.
      </p>
      <Button asChild>
        <Link to="/login">Sign in to get started</Link>
      </Button>
    </section>
  );
}

function MyGroups() {
  const { data: groups } = useQuery(groupsQuery);
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Your groups</h1>
        <Button asChild size="sm">
          <Link to="/groups/new">New group</Link>
        </Button>
      </div>
      {groups?.length === 0 && (
        <p className="text-muted-foreground">
          You&apos;re not in any groups yet. Create one, or ask a friend for an
          invite link.
        </p>
      )}
      {!!groups?.length && (
        <ul className="divide-y rounded-lg border">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                to="/g/$gid"
                params={{ gid: g.id }}
                className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50"
              >
                <span className="truncate font-medium">{g.name}</span>
                <Badge variant="secondary" className="capitalize">
                  {g.role}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
