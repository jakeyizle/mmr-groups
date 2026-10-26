import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import type { Db } from "../db";
import { authSessions, users } from "../db/schema";
import type { SessionUser } from "../env";

export const SESSION_COOKIE = "session";
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
/** Sessions are extended only when less than this remains (limits D1 writes). */
export const SESSION_EXTEND_BELOW_MS = 15 * DAY_MS;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function generateSessionToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The DB stores only the token's SHA-256, never the token. */
export async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSession(db: Db, userId: string, now = new Date()) {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(authSessions).values({
    id: await hashSessionToken(token),
    userId,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  });
  return { token, expiresAt };
}

/**
 * The session's user, or null if the token is unknown or expired. When less than
 * SESSION_EXTEND_BELOW_MS remains, the expiry is pushed out and `extendedTo` is set
 * so the caller can refresh the cookie.
 */
export async function validateSession(db: Db, token: string, now = new Date()) {
  const id = await hashSessionToken(token);
  const [row] = await db
    .select({
      expiresAt: authSessions.expiresAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        isSiteAdmin: users.isSiteAdmin,
      },
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.id, id));
  if (!row) return null;

  const expiresAt = new Date(row.expiresAt);
  if (expiresAt <= now) {
    await db.delete(authSessions).where(eq(authSessions.id, id));
    return null;
  }

  let extendedTo: Date | undefined;
  if (expiresAt.getTime() - now.getTime() < SESSION_EXTEND_BELOW_MS) {
    extendedTo = new Date(now.getTime() + SESSION_TTL_MS);
    await db
      .update(authSessions)
      .set({ expiresAt: extendedTo.toISOString() })
      .where(eq(authSessions.id, id));
  }
  return { user: row.user satisfies SessionUser, extendedTo };
}

export async function invalidateSession(db: Db, token: string) {
  await db
    .delete(authSessions)
    .where(eq(authSessions.id, await hashSessionToken(token)));
}

export function setSessionCookie(c: Context, token: string, expires: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    // Production is always https; local http (dev, E2E) can't set Secure cookies in every browser.
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
