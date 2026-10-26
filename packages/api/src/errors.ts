import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** PLAN §8 error shape: `{ error: { code, message, details? } }`. */
export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json({ error: { code, message, details } }, status);
}
