import { newId } from "@mmr/core";
import {
  decodeIdToken,
  generateCodeVerifier,
  generateState,
  Google,
} from "arctic";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { users } from "../db/schema";
import type { AppEnv } from "../env";
import { createSession, setSessionCookie } from "./session";

const FLOW_COOKIES = ["oauth_state", "oauth_verifier", "oauth_return"] as const;
const FLOW_MAX_AGE = 10 * 60;

interface GoogleClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}

function google(c: Context<AppEnv>) {
  const redirect = new URL("/api/auth/google/callback", c.req.url);
  return new Google(
    c.env.GOOGLE_CLIENT_ID,
    c.env.GOOGLE_CLIENT_SECRET,
    redirect.href,
  );
}

/** AUTH-006: only same-origin paths; `//evil.com` and `/\evil.com` are external. */
export function safeReturnTo(value: string | undefined) {
  if (!value?.startsWith("/") || /^\/[/\\]/.test(value)) return "/";
  return value;
}

/** ROLE-015: re-evaluated at every sign-in, and only for verified emails. */
export function isSiteAdminEmail(
  config: string | undefined,
  email: string,
  verified: boolean,
) {
  if (!verified || !config) return false;
  const admins = config.split(",").map((e) => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

export const googleAuth = new Hono<AppEnv>()
  .get("/", (c) => {
    const state = generateState();
    const verifier = generateCodeVerifier();
    const url = google(c).createAuthorizationURL(state, verifier, [
      "openid",
      "email",
      "profile",
    ]);
    const secure = new URL(c.req.url).protocol === "https:";
    const values = [state, verifier, safeReturnTo(c.req.query("returnTo"))];
    FLOW_COOKIES.forEach((name, i) => {
      setCookie(c, name, values[i] ?? "", {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/api/auth/google",
        maxAge: FLOW_MAX_AGE,
      });
    });
    return c.redirect(url.href);
  })
  .get("/callback", async (c) => {
    const [state, verifier, returnTo] = FLOW_COOKIES.map((n) =>
      getCookie(c, n),
    );
    for (const name of FLOW_COOKIES)
      deleteCookie(c, name, { path: "/api/auth/google" });

    const code = c.req.query("code");
    if (!code || !state || !verifier || c.req.query("state") !== state) {
      return c.redirect("/login?error=state");
    }

    let claims: GoogleClaims;
    try {
      const tokens = await google(c).validateAuthorizationCode(code, verifier);
      claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
    } catch {
      return c.redirect("/login?error=google");
    }

    const isSiteAdmin = isSiteAdminEmail(
      c.env.SITE_ADMIN_EMAILS,
      claims.email,
      claims.email_verified === true,
    );
    const name = claims.name ?? claims.email;
    const db = c.get("db");
    // AUTH-002: identity is the Google account ID; email and name follow Google.
    const [user] = await db
      .insert(users)
      .values({
        id: newId(),
        googleSub: claims.sub,
        email: claims.email,
        name,
        isSiteAdmin,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: users.googleSub,
        set: { email: claims.email, name, isSiteAdmin },
      })
      .returning({ id: users.id });
    if (!user) throw new Error("user upsert returned no row");

    const { token, expiresAt } = await createSession(db, user.id);
    setSessionCookie(c, token, expiresAt);
    return c.redirect(safeReturnTo(returnTo));
  });
