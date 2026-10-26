import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/g/$gid/stats")({
  component: () => (
    <h1 className="font-heading text-2xl font-semibold">Stats</h1>
  ),
});
