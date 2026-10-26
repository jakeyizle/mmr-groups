import type { AppType } from "@mmr/api";
import { queryOptions } from "@tanstack/react-query";
import { hc, type InferResponseType } from "hono/client";

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

/** Unwraps a Hono client response: JSON on success, `ApiError` otherwise. */
export async function unwrap<T>(res: {
  ok: boolean;
  status: number;
  json: () => Promise<T>;
}): Promise<T> {
  if (res.ok) return res.json();
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
