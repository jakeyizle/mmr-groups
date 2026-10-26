import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/g/$gid/matches/$mid")({
  component: () => (
    <h1 className="font-heading text-2xl font-semibold">Match</h1>
  ),
});
