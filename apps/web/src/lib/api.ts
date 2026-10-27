import type { AppType } from "@mmr/api";
import { queryOptions } from "@tanstack/react-query";
import { type ClientResponse, hc, type InferResponseType } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";

/** Every request carries the CSRF headers the API requires on mutations (PLAN §7). */
export const client = hc<AppType>("/", {
  headers: {
    "Content-Type": "application/json",
    "X-Requested-With": "fetch",
  },
}).api;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** The body type of the response variants that can be 2xx. */
type SuccessBody<R> =
  R extends ClientResponse<infer T, infer S, "json">
    ? [Extract<S, SuccessStatusCode>] extends [never]
      ? never
      : T
    : never;

/**
 * Unwraps a Hono client response: the JSON body on 2xx, `ApiError` otherwise.
 * Non-JSON variants (the snapshot's 304, which browsers resolve from cache) drop out of the type.
 */
export async function unwrap<R extends ClientResponse<unknown>>(
  res: R,
): Promise<SuccessBody<R>> {
  if (res.ok) return (await res.json()) as SuccessBody<R>;
  const body = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string; details?: unknown };
  };
  throw new ApiError(
    res.status,
    body.error?.code ?? "unknown",
    body.error?.message ?? `HTTP ${String(res.status)}`,
    body.error?.details,
  );
}

export type Me = InferResponseType<typeof client.me.$get>["user"];

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await unwrap(await client.me.$get())).user,
  staleTime: 5 * 60_000,
});
