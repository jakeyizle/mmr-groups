import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {},
  component: Login,
});

function Login() {
  const { returnTo } = Route.useSearch();
  // The API validates returnTo (same-origin paths only, AUTH-006).
  const href = `/api/auth/google${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  return (
    <section className="mx-auto max-w-sm space-y-4 text-center">
      <h1 className="font-heading text-2xl font-semibold">Sign in</h1>
      <Button asChild className="w-full">
        <a href={href}>Continue with Google</a>
      </Button>
    </section>
  );
}
