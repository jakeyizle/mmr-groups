import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/g/$gid/teams")({
  component: () => (
    <h1 className="font-heading text-2xl font-semibold">Team generator</h1>
  ),
});
