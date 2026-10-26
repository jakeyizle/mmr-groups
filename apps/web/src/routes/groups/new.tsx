import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/auth";

export const Route = createFileRoute("/groups/new")({
  beforeLoad: requireUser,
  component: () => (
    <h1 className="font-heading text-2xl font-semibold">New group</h1>
  ),
});
