import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/auth";

export const Route = createFileRoute("/g/$gid/settings")({
  beforeLoad: requireUser,
  component: () => (
    <h1 className="font-heading text-2xl font-semibold">Settings</h1>
  ),
});
