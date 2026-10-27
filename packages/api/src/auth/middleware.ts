import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { getDb } from "../db";
import type { AppEnv } from "../env";
import { apiError } from "../errors";
import { SESSION_COOKIE, setSessionCookie, validateSession } from "./session";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Mutations allowed without a session. */
const PUBLIC_MUTATIONS = new Set(["/api/test/login", "/api/auth/logout"]);

/** Sets `db` and `user` (null when signed out); refreshes the cookie when the session was extended. */
export const session = createMiddleware<AppEnv>(async (c, next) => {
  const db = getDb(c.env.DB);
  c.set("db", db);
  c.set("user", null);

  const token = getCookie(c, SESSION_COOKIE);
  // Stryker disable next-line ConditionalExpression: skips a lookup that would find nothing
  if (token) {
    const result = await validateSession(db, token);
    if (result) {
      c.set("user", result.user);
      if (result.extendedTo) setSessionCookie(c, token, result.extendedTo);
    }
  }
  await next();
});

/**
 * CSRF (PLAN §7): beyond SameSite=Lax, every mutation must be a JSON fetch with
 * `X-Requested-With: fetch`, which a cross-site form can't send without CORS.
 */
export const csrf = createMiddleware<AppEnv>(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const json = c.req.header("Content-Type")?.startsWith("application/json");
    if (!json || c.req.header("X-Requested-With") !== "fetch") {
      return apiError(c, 403, "csrf", "Missing JSON or X-Requested-With");
    }
  }
  await next();
});

/** AUTH-007: every create/update/delete needs a signed-in user. */
export const mutationsRequireUser = createMiddleware<AppEnv>(
  async (c, next) => {
    if (
      !SAFE_METHODS.has(c.req.method) &&
      !PUBLIC_MUTATIONS.has(c.req.path) &&
      !c.get("user")
    ) {
      return apiError(c, 401, "unauthenticated", "Sign in required");
    }
    await next();
  },
);
