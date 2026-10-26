import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/auth";

export const Route = createFileRoute("/join/$code")({
  beforeLoad: requireUser,
  component: () => (
    <h1 className="font-heading text-2xl font-semibold">Join group</h1>
  ),
});
