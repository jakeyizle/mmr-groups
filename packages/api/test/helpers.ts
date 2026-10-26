import { newId } from "@mmr/core";
import { env } from "cloudflare:workers";

import { app } from "../src";
import { createSession, SESSION_COOKIE } from "../src/auth/session";
import { getDb, schema } from "../src/db";

export const db = getDb(env.DB);

export function request(path: string, init?: RequestInit) {
  return app.request(path, init, env);
}

/** Starts a session for `userId`; pass the token to `api()`. */
export async function signIn(userId: string, now?: Date) {
  return (await createSession(db, userId, now)).token;
}

/**
 * Like the web client: JSON body + CSRF header on every request, and the session
 * cookie when `session` is given.
 */
export function api(
  path: string,
  {
    method = "GET",
    json,
    session,
  }: { method?: string; json?: unknown; session?: string } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "fetch",
  };
  if (session) headers.Cookie = `${SESSION_COOKIE}=${session}`;
  return request(path, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

const now = () => new Date().toISOString();

function first<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function seedUser(
  overrides: Partial<typeof schema.users.$inferInsert> = {},
) {
  const id = newId();
  return first(
    await db
      .insert(schema.users)
      .values({
        id,
        googleSub: `sub-${id}`,
        email: `${id.toLowerCase()}@example.com`,
        name: `User ${id.slice(-4)}`,
        createdAt: now(),
        ...overrides,
      })
      .returning(),
  );
}

/** A group with `owner` as its owner player (or no owner, like the demo group). */
export async function seedGroup(
  owner?: { id: string; name: string },
  overrides: Partial<typeof schema.groups.$inferInsert> = {},
) {
  const group = first(
    await db
      .insert(schema.groups)
      .values({
        id: newId(),
        name: "Test Group",
        teamFormat: { kind: "fixed", teams: 2, size: 2 },
        scoringMode: "optional",
        allowTies: false,
        defaultRole: "recorder",
        createdAt: now(),
        ...overrides,
      })
      .returning(),
  );
  const ownerPlayer = owner
    ? first(
        await db
          .insert(schema.players)
          .values({
            id: newId(),
            groupId: group.id,
            displayName: owner.name,
            role: "owner",
            userId: owner.id,
            createdAt: now(),
          })
          .returning(),
      )
    : undefined;
  return { group, ownerPlayer };
}
