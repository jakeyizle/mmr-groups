import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/g/$gid/players/$pid")({
  component: () => (
    <h1 className="font-heading text-2xl font-semibold">Player</h1>
  ),
});
