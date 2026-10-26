import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { meQuery } from "./api";

/** `beforeLoad` guard for pages that need a signed-in user; returns them after sign-in. */
export async function requireUser({
  context,
  location,
}: {
  context: { queryClient: QueryClient };
  location: { href: string };
}) {
  const me = await context.queryClient.query({
    ...meQuery,
    staleTime: "static",
  });
  if (!me) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect API
    throw redirect({ to: "/login", search: { returnTo: location.href } });
  }
  return { me };
}
