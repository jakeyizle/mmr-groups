import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { db, request } from "../test/helpers";
import type { Bindings } from "./env";
import { hashSessionToken, SESSION_COOKIE } from "./auth/session";
import { authSessions, users } from "./db/schema";
import { testLogin } from "./test-login";

const login = (body: unknown, vars: Partial<Bindings> = {}) =>
  new Hono<{ Bindings: Bindings }>()
    .basePath("/api")
    .route("/test", testLogin)
    .request(
      "/api/test/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { ...env, ...vars },
    );

describe("test login", () => {
  it("is not part of the production app", { tags: ["AUTH-008"] }, async () => {
    // A well-formed request (passes CSRF), so only a missing route can explain 404.
    const res = await request("/api/test/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
      },
      body: JSON.stringify({ name: "Eve", email: "eve@example.com" }),
    });
    expect(res.status).toBe(404);
  });

  it(
    "refuses without ENABLE_TEST_LOGIN even when mounted",
    { tags: ["AUTH-008"] },
    async () => {
      const res = await login({ name: "Eve", email: "eve@example.com" });
      expect(res.status).toBe(404);
    },
  );

  it("upserts the user and starts a session", async () => {
    const enabled = { ENABLE_TEST_LOGIN: "true" };
    const first = await login(
      { name: "Ann", email: "ann@example.com" },
      enabled,
    );
    expect(first.status).toBe(200);
    const again = await login(
      { name: "Ann B", email: "ann@example.com" },
      enabled,
    );
    const { userId } = await again.json<{ userId: string }>();

    const cookie = again.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const token = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(cookie)?.[1];
    expect(token).toBeDefined();

    const session = await db.query.authSessions.findFirst({
      where: eq(authSessions.id, await hashSessionToken(token ?? "")),
    });
    expect(session?.userId).toBe(userId);
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    expect(user).toMatchObject({ name: "Ann B", email: "ann@example.com" });
    expect(await db.$count(users, eq(users.email, "ann@example.com"))).toBe(1);
  });

  it("rejects a body without name and email", async () => {
    const res = await login({ name: "x" }, { ENABLE_TEST_LOGIN: "true" });
    expect(res.status).toBe(400);
  });
});
