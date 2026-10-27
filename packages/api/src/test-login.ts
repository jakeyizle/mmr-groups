import { newId } from "@mmr/core";
import { Hono } from "hono";

import type { Bindings } from "./env";
import { createSession, setSessionCookie } from "./auth/session";
import { getDb } from "./db";
import { users } from "./db/schema";

/**
 * `POST /api/test/login { name, email, isSiteAdmin? }` for E2E. Mounted only by builds with the
 * `__TEST_LOGIN__` flag (see apps/web/worker), and refuses unless ENABLE_TEST_LOGIN.
 */
export const testLogin = new Hono<{ Bindings: Bindings }>().post(
  "/login",
  async (c) => {
    if (c.env.ENABLE_TEST_LOGIN !== "true") return c.notFound();

    const body = await c.req.json<{
      name?: unknown;
      email?: unknown;
      isSiteAdmin?: unknown;
    }>();
    if (typeof body.name !== "string" || typeof body.email !== "string") {
      return c.json(
        { error: { code: "bad_request", message: "name and email required" } },
        400,
      );
    }

    const isSiteAdmin = body.isSiteAdmin === true;
    const db = getDb(c.env.DB);
    const [user] = await db
      .insert(users)
      .values({
        id: newId(),
        googleSub: `test:${body.email}`,
        email: body.email,
        name: body.name,
        isSiteAdmin,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: users.googleSub,
        set: { name: body.name, email: body.email, isSiteAdmin },
      })
      .returning({ id: users.id });
    // Stryker disable next-line ConditionalExpression,BlockStatement: an upsert always returns its row
    if (!user) throw new Error("user upsert returned no row");

    const { token, expiresAt } = await createSession(db, user.id);
    setSessionCookie(c, token, expiresAt);
    return c.json({ userId: user.id });
  },
);
