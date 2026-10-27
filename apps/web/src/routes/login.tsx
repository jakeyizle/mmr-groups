import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

interface LoginSearch {
  returnTo?: string;
  error?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    ...(typeof search.returnTo === "string" && { returnTo: search.returnTo }),
    ...(typeof search.error === "string" && { error: search.error }),
  }),
  component: Login,
});

function Login() {
  const { returnTo, error } = Route.useSearch();
  // The API validates returnTo (same-origin paths only, AUTH-006).
  const href = `/api/auth/google${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  return (
    <section className="mx-auto max-w-sm space-y-4 text-center">
      <h1 className="font-heading text-2xl font-semibold">Sign in</h1>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Sign-in didn&apos;t complete. Please try again.
        </p>
      )}
      <Button asChild className="w-full">
        <a href={href}>Continue with Google</a>
      </Button>
    </section>
  );
}
