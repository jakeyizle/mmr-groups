import { can } from "@mmr/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { ApiError } from "@/lib/api";
import { groupQuery, useGroupActor } from "@/lib/groups";

export const Route = createFileRoute("/g/$gid")({ component: GroupLayout });

const TABS = [
  { to: "/g/$gid", label: "Leaderboard", exact: true },
  { to: "/g/$gid/matches", label: "Matches" },
  { to: "/g/$gid/stats", label: "Stats" },
  { to: "/g/$gid/teams", label: "Teams" },
  { to: "/g/$gid/audit", label: "Audit", members: true },
  { to: "/g/$gid/settings", label: "Settings", members: true },
] as const;

function GroupLayout() {
  const { gid } = Route.useParams();
  const { data, error } = useQuery(groupQuery(gid));
  const actor = useGroupActor(data);
  // Public visitors don't get member-only tabs (VIS-003, AUDIT-005).
  const tabs = TABS.filter(
    (t) => !("members" in t) || can(actor, "group.view"),
  );

  if (error instanceof ApiError && error.status === 404) {
    return (
      <p className="text-muted-foreground">
        This group doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="truncate font-heading text-2xl font-semibold">
        {data?.group.name ?? " "}
      </h1>
      {/* Border lives on the ul so the tabs' -mb-px overlap doesn't overflow the scroller vertically. */}
      <nav className="-mx-4 overflow-x-auto">
        <ul className="flex w-max min-w-full gap-4 border-b px-4 text-sm whitespace-nowrap">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <Link
                to={tab.to}
                params={{ gid }}
                activeOptions={{ exact: "exact" in tab }}
                className="-mb-px block border-b-2 border-transparent py-2 text-muted-foreground"
                // Stryker disable next-line ObjectLiteral: only styles the tab; aria-current marks it
                activeProps={{
                  className: "border-foreground! text-foreground!",
                }}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
