import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { api, db, request, seedUser, signIn } from "../../test/helpers";
import { authSessions } from "../db/schema";
import { hashSessionToken, SESSION_TTL_MS } from "./session";

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
