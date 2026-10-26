import type { Context } from "hono";
import { setCookie } from "hono/cookie";

import type { Db } from "../db";
import { authSessions } from "../db/schema";

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
