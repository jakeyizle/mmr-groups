import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { client, meQuery, unwrap } from "@/lib/api";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  { component: Layout },
);

function Layout() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between gap-2 px-4">
          <Link
            to="/"
            className="shrink-0 font-heading text-lg font-semibold whitespace-nowrap"
          >
            MMR Groups
          </Link>
          <Account />
        </div>
      </header>
      <main className="mx-auto max-w-screen-md px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function Account() {
  const { data: me, isPending } = useQuery(meQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: async () => unwrap(await client.auth.logout.$post()),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/" });
    },
  });

  if (isPending) return null;
  if (!me) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm text-muted-foreground">{me.name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          signOut.mutate();
        }}
        disabled={signOut.isPending}
      >
        Sign out
      </Button>
    </div>
  );
}
