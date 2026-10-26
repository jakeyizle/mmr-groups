import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * PLAN §8 error shape: `{ error: { code, message, details? } }`. Generic in the
 * status so RPC clients can tell error bodies from success bodies.
 */
export function apiError<S extends ContentfulStatusCode>(
  c: Context,
  status: S,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json({ error: { code, message, details } }, status);
}
