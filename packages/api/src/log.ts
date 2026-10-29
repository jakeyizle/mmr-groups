import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

/** PLAN §12: one structured JSON line per request, persisted by Workers Logs. */
export interface RequestLog {
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  error?: string;
}

export const requestLog = createMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  const entry: RequestLog = {
    // Cloudflare's ray ID ties the line to the platform's own request records.
    requestId: c.req.header("cf-ray") ?? crypto.randomUUID(),
    method: c.req.method,
    // The matched pattern (`/api/groups/:gid`), so lines group by endpoint without IDs.
    route: routePath(c, -1),
    status: c.res.status,
    durationMs: Date.now() - start,
  };
  if (c.error) entry.error = String(c.error);
  console.log(JSON.stringify(entry));
});
