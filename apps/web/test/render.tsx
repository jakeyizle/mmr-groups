import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { AppType } from "@mmr/api";
import { render } from "@testing-library/react";
import type { ExtractSchema } from "hono/types";
import type { SuccessStatusCode } from "hono/utils/http-status";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

export interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

type Schema = ExtractSchema<AppType>;
type Route = Extract<keyof Schema, string>;
type Segments<P extends string> = P extends `${infer H}/${infer T}`
  ? [H, ...Segments<T>]
  : [P];
type SegmentsMatch<K extends string[], P extends string[]> = K extends [
  infer k extends string,
  ...infer ks extends string[],
]
  ? P extends [infer p extends string, ...infer ps extends string[]]
    ? (
        p extends `:${string}`
          ? k extends ""
            ? false
            : true
          : k extends p
            ? true
            : false
      ) extends true
      ? SegmentsMatch<ks, ps>
      : false
    : false
  : P extends []
    ? true
    : false;
/** Route patterns (`/api/groups/:gid`) that a concrete path (`/api/groups/g1`) matches. */
type RouteOf<Path extends string> = {
  [R in Route]: SegmentsMatch<Segments<Path>, Segments<R>> extends true
    ? R
    : never;
}[Route];
type EndpointOf<Key extends string> = Key extends `${infer M} ${infer Path}`
  ? {
      [R in RouteOf<Path>]: Schema[R][`$${Lowercase<M>}` & keyof Schema[R]];
    }[RouteOf<Path>]
  : never;
// As `unwrap`'s `SuccessBody`: a variant whose status can be 2xx (`c.json` without one is any code).
type SuccessOutput<E> = E extends {
  output: infer O;
  status: infer S;
  outputFormat: "json";
}
  ? [Extract<S, SuccessStatusCode>] extends [never]
    ? never
    : O
  : never;
/** The JSON body the real route sends on success; `never` for an unknown route or method. */
export type StubBody<Key extends string> = SuccessOutput<EndpointOf<Key>>;
export type StubHandler<Key extends string> = (
  body: unknown,
) => StubBody<Key> | Response | Promise<StubBody<Key> | Response>;

/**
 * Stubs `fetch` for the API client. Handlers are keyed `"GET /api/groups/g1"`; each returns (or
 * resolves to) the real route's success body, or a `Response` for other statuses and malformed
 * bodies. Unhandled requests fail the test with a 500.
 */
export type Stubs<K extends string> = { [Key in K]: StubHandler<Key> };

export function stubApi<K extends string>(handlers: Partial<Stubs<K>>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      await Promise.resolve();
      const raw = input instanceof Request ? input.url : input.toString();
      // A page-relative request would miss the handlers.
      const url = new URL(raw, "http://localhost/some/page");
      const method = init?.method ?? "GET";
      const body: unknown =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
      });
      const handler = (
        handlers as Record<string, StubHandler<string> | undefined>
      )[`${method} ${url.pathname}`];
      if (!handler) return new Response("unhandled", { status: 500 });
      const result = await handler(body);
      return result instanceof Response ? result : Response.json(result);
    }),
  );
  return calls;
}

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

export function renderWithQuery(ui: ReactElement) {
  const queryClient = newQueryClient();
  // As a wrapper, so `rerender` keeps the provider.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper }) };
}

/** Renders the app's real route tree at `path`. */
export function renderRoute(path: string) {
  const queryClient = newQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

/** Renders `ui` at `/here` in a bare router, for components that link or navigate. */
export function renderInRouter(ui: ReactElement) {
  const queryClient = newQueryClient();
  const rootRoute = createRootRoute({ component: Outlet });
  const page = (path: string, component: () => ReactNode) =>
    createRoute({ getParentRoute: () => rootRoute, path, component });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      page("/here", () => ui),
      page("$", () => null),
    ]),
    history: createMemoryHistory({ initialEntries: ["/here"] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}
