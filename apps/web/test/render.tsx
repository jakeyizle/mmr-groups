import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

export interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

/**
 * Stubs `fetch` for the API client. Handlers are keyed `"GET /api/me"`; each returns (or resolves to)
 * a JSON body, or a `Response` for other statuses. Unhandled requests fail the test with a 500.
 */
export function stubApi(handlers: Record<string, (body: unknown) => unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      await Promise.resolve();
      const raw = input instanceof Request ? input.url : input.toString();
      const url = new URL(raw, "http://localhost");
      const method = init?.method ?? "GET";
      const body: unknown =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
      });
      const handler = handlers[`${method} ${url.pathname}`];
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
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
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
