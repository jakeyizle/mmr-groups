import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, request, seedUser, signIn } from "../../test/helpers";
import { authSessions } from "../db/schema";
import {
  createSession,
  generateSessionToken,
  hashSessionToken,
  SESSION_EXTEND_BELOW_MS,
  SESSION_TTL_MS,
  validateSession,
} from "./session";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

async function me(session?: string) {
  const res = await api("/api/me", { session });
  return {
    res,
    user: (await res.json<{ user: { id: string } | null }>()).user,
  };
}

async function expiresAt(token: string) {
  const row = await db.query.authSessions.findFirst({
    where: eq(authSessions.id, await hashSessionToken(token)),
  });
  return row && new Date(row.expiresAt);
}

describe(
  "AUTH-003: sessions persist across visits",
  { tags: ["AUTH-003"] },
  () => {
    it("a session from 1 day ago is still signed in and isn't rewritten", async () => {
      const user = await seedUser();
      const token = await signIn(user.id, daysAgo(1));
      const before = await expiresAt(token);

      const { res, user: current } = await me(token);
      expect(current?.id).toBe(user.id);
      expect(res.headers.get("Set-Cookie")).toBeNull();
      expect(await expiresAt(token)).toEqual(before);
    });

    it("a session from 20 days ago is extended to 30 days from now", async () => {
      const user = await seedUser();
      const token = await signIn(user.id, daysAgo(20));

      const { res, user: current } = await me(token);
      expect(current?.id).toBe(user.id);
      expect(res.headers.get("Set-Cookie")).toMatch(/session=/);
      const extended = await expiresAt(token);
      expect(extended?.getTime()).toBeGreaterThan(
        Date.now() + SESSION_TTL_MS - 60_000,
      );
    });

    it("a session older than 30 days is signed out", async () => {
      const user = await seedUser();
      const token = await signIn(user.id, daysAgo(31));
      expect((await me(token)).user).toBeNull();
      expect(await expiresAt(token)).toBeUndefined();
    });

    it("an unknown token is signed out", async () => {
      expect((await me("not-a-session")).user).toBeNull();
    });
  },
);

describe(
  "AUTH-004: signing out ends the session",
  { tags: ["AUTH-004"] },
  () => {
    it("invalidates the session on the server and clears the cookie", async () => {
      const user = await seedUser();
      const token = await signIn(user.id);

      const res = await api("/api/auth/logout", {
        method: "POST",
        session: token,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Set-Cookie")).toMatch(/session=;/);
      expect(await expiresAt(token)).toBeUndefined();

      expect((await me(token)).user).toBeNull();
      const mutation = await api("/api/anything", {
        method: "POST",
        session: token,
        json: {},
      });
      expect(mutation.status).toBe(401);
    });
  },
);

describe(
  "AUTH-007: mutations require a signed-in user",
  { tags: ["AUTH-007"] },
  () => {
    it.each(["POST", "PUT", "PATCH", "DELETE"])(
      "rejects a signed-out %s",
      async (method) => {
        const res = await api("/api/groups", { method, json: {} });
        expect(res.status).toBe(401);
        expect(await res.json()).toMatchObject({
          error: { code: "unauthenticated" },
        });
      },
    );

    it("lets signed-out reads through", async () => {
      expect((await api("/api/me")).status).toBe(200);
    });
  },
);

describe("CSRF", () => {
  it("rejects a mutation without the fetch header or JSON body", async () => {
    const user = await seedUser();
    const token = await signIn(user.id);
    const cookie = `session=${token}`;

    const form = await request("/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    expect(form.status).toBe(403);
    const noHeader = await request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
    });
    expect(noHeader.status).toBe(403);
    expect(
      (await noHeader.json<{ error: { code: string } }>()).error.code,
    ).toBe("csrf");
    const noType = await request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, "X-Requested-With": "fetch" },
    });
    expect(noType.status).toBe(403);
    expect(await expiresAt(token)).toBeDefined();
  });
});

describe("/me", () => {
  it("returns the signed-in user", async () => {
    const user = await seedUser({ name: "Ann", isSiteAdmin: true });
    const { user: current } = await me(await signIn(user.id));
    expect(current).toEqual({
      id: user.id,
      name: "Ann",
      email: user.email,
      isSiteAdmin: true,
    });
  });
});

describe("session details", { tags: ["AUTH-003", "AUTH-004"] }, () => {
  it("tokens are URL-safe and long", () => {
    for (let i = 0; i < 50; i++)
      expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores the token's SHA-256 as hex", async () => {
    expect(await hashSessionToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("ends exactly at its expiry, and extends only below the threshold", async () => {
    const user = await seedUser();
    const start = new Date("2026-01-01T00:00:00.000Z");
    const { token } = await createSession(db, user.id, start);
    const expiry = start.getTime() + SESSION_TTL_MS;
    const atThreshold = new Date(expiry - SESSION_EXTEND_BELOW_MS);
    expect(
      (await validateSession(db, token, atThreshold))?.extendedTo,
    ).toBeUndefined();
    const below = new Date(atThreshold.getTime() + 1);
    expect((await validateSession(db, token, below))?.extendedTo).toEqual(
      new Date(below.getTime() + SESSION_TTL_MS),
    );
    // Checking one moment would extend it, so each check gets its own session.
    const fresh = async () => (await createSession(db, user.id, start)).token;
    expect(
      await validateSession(db, await fresh(), new Date(expiry - 1)),
    ).not.toBeNull();
    expect(
      await validateSession(db, await fresh(), new Date(expiry)),
    ).toBeNull();
  });

  const attrs = (res: Response, name: string) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${name}=`))
      ?.split("; ")
      .slice(1)
      .sort();

  it("sets a Secure cookie over https, HttpOnly and Lax for the whole site", async () => {
    const user = await seedUser();
    // 20 days old: the response refreshes the cookie.
    const token = await signIn(user.id, daysAgo(20));
    const https = await request("https://localhost/api/me", {
      headers: { Cookie: `session=${token}` },
    });
    expect(attrs(https, "session")).toEqual(
      expect.arrayContaining(["HttpOnly", "Path=/", "SameSite=Lax", "Secure"]),
    );
    const token2 = await signIn(user.id, daysAgo(20));
    const http = await request("/api/me", {
      headers: { Cookie: `session=${token2}` },
    });
    expect(attrs(http, "session")).not.toContain("Secure");
  });

  it("clears the cookie for the whole site on sign-out", async () => {
    const user = await seedUser();
    const res = await api("/api/auth/logout", {
      method: "POST",
      session: await signIn(user.id),
    });
    expect(attrs(res, "session")).toEqual(expect.arrayContaining(["Path=/"]));
  });

  it("lets signed-out visitors sign out", async () => {
    expect((await api("/api/auth/logout", { method: "POST" })).status).toBe(
      200,
    );
  });
});

describe("CSRF details", () => {
  const post = (headers: Record<string, string>) =>
    request("/api/groups", { method: "POST", headers, body: "{}" });

  it("accepts JSON with a charset, and nothing else", async () => {
    const ok = await post({
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "fetch",
    });
    // Past CSRF: signed out.
    expect(ok.status).toBe(401);
    expect((await post({ "X-Requested-With": "fetch" })).status).toBe(403);
    expect(
      (
        await post({
          "Content-Type": "text/plain; application/json",
          "X-Requested-With": "fetch",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post({
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        })
      ).status,
    ).toBe(403);
  });

  it.each(["HEAD", "OPTIONS"])("lets %s through", async (method) => {
    const res = await request("/api/me", { method });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
