import { getCookie } from "hono/cookie";
import { Hono } from "hono";

import { csrf, mutationsRequireUser, session } from "./auth/middleware";
import {
  clearSessionCookie,
  invalidateSession,
  SESSION_COOKIE,
} from "./auth/session";
import type { AppEnv } from "./env";
import { groupsRoutes } from "./groups/routes";

export type { AppEnv, Bindings, SessionUser } from "./env";

export const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(session, csrf, mutationsRequireUser)
  .get("/health", async (c) => {
    await c.env.DB.prepare("select 1").run();
    return c.json({ ok: true });
  })
  .get("/me", (c) => c.json({ user: c.get("user") }))
  .post("/auth/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await invalidateSession(c.get("db"), token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  })
  .route("/groups", groupsRoutes);

export type AppType = typeof app;
