import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BatchEntry } from "@/components/match/batch-entry";
import { requireUser } from "@/lib/auth";
import { groupQuery } from "@/lib/groups";

export const Route = createFileRoute("/g/$gid/matches/new")({
  beforeLoad: requireUser,
  component: NewMatches,
});

function NewMatches() {
  const { gid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  if (!data) return null;
  return (
    <section className="space-y-4">
      <h2 className="font-heading text-lg font-semibold">Record matches</h2>
      <BatchEntry data={data} />
    </section>
  );
}
