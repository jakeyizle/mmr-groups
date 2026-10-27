import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, db, request } from "../../test/helpers";
import { users } from "../db/schema";
import { SESSION_COOKIE } from "./session";

const b64url = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

interface Claims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}

/** Stubs Google's token endpoint; the ID token comes straight from it, so it isn't signature-checked. */
function stubGoogle(claims: Claims) {
  const idToken = `${b64url({ alg: "RS256" })}.${b64url(claims)}.sig`;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== "https://oauth2.googleapis.com/token")
      throw new Error(`unexpected fetch ${url}`);
    return Promise.resolve(
      Response.json({
        access_token: "at",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: idToken,
      }),
    );
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const cookies = (res: Response) =>
  Object.fromEntries(
    res.headers.getSetCookie().map((c) => {
      const [pair = ""] = c.split(";");
      const i = pair.indexOf("=");
      return [pair.slice(0, i), pair.slice(i + 1)];
    }),
  );

/** Runs the whole redirect flow; returns the callback response and its session token. */
async function signInWithGoogle(claims: Claims, returnTo?: string) {
  const fetchSpy = stubGoogle(claims);
  const start = await request(
    `/api/auth/google${returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`}`,
  );
  expect(start.status).toBe(302);
  const authUrl = new URL(start.headers.get("Location") ?? "");
  const flow = cookies(start);

  const callback = await request(
    `/api/auth/google/callback?code=abc&state=${authUrl.searchParams.get("state") ?? ""}`,
    {
      headers: {
        Cookie: Object.entries(flow)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    },
  );
  return {
    authUrl,
    callback,
    fetchSpy,
    session: cookies(callback)[SESSION_COOKIE],
    location: callback.headers.get("Location"),
  };
}

async function me(session: string | undefined) {
  const res = await api("/api/me", { session });
  return (
    await res.json<{
      user: { id: string; email: string; isSiteAdmin: boolean } | null;
    }>()
  ).user;
}

describe("Google redirect", () => {
  it("sends the visitor to Google with PKCE and the callback URL", async () => {
    const { authUrl, fetchSpy } = await signInWithGoogle({
      sub: "g-redirect",
      email: "r@example.com",
    });
    expect(authUrl.origin).toBe("https://accounts.google.com");
    expect(authUrl.searchParams.get("client_id")).toBe("test-client");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost/api/auth/google/callback",
    );
    expect(authUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("rejects a callback whose state doesn't match", async () => {
    stubGoogle({ sub: "g-state", email: "s@example.com" });
    const start = await request("/api/auth/google");
    const flow = cookies(start);
    const res = await request("/api/auth/google/callback?code=abc&state=bad", {
      headers: {
        Cookie: `oauth_state=${flow.oauth_state ?? ""}; oauth_verifier=${flow.oauth_verifier ?? ""}`,
      },
    });
    expect(res.headers.get("Location")).toBe("/login?error=state");
    expect(cookies(res)[SESSION_COOKIE]).toBeUndefined();
  });

  it("reports a failed token exchange", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );
    const start = await request("/api/auth/google");
    const state =
      new URL(start.headers.get("Location") ?? "").searchParams.get("state") ??
      "";
    const flow = cookies(start);
    const res = await request(
      `/api/auth/google/callback?code=abc&state=${state}`,
      {
        headers: {
          Cookie: Object.entries(flow)
            .map(([k, v]) => `${k}=${v}`)
            .join("; "),
        },
      },
    );
    expect(res.headers.get("Location")).toBe("/login?error=google");
  });
});

describe(
  "AUTH-001: signing in with Google creates an account",
  { tags: ["AUTH-001"] },
  () => {
    it("creates a user keyed by the Google account ID and signs them in", async () => {
      const { session, location } = await signInWithGoogle({
        sub: "g-new",
        email: "new@example.com",
        email_verified: true,
        name: "New Person",
      });
      expect(location).toBe("/");
      const user = await me(session);
      expect(user).toMatchObject({
        email: "new@example.com",
        isSiteAdmin: false,
      });
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.googleSub, "g-new"));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(user?.id);
      expect(rows[0]?.name).toBe("New Person");
    });
  },
);

describe(
  "AUTH-002: signing in again reuses the existing account",
  { tags: ["AUTH-002"] },
  () => {
    it("matches on Google ID even after the email changes", async () => {
      const first = await me(
        (await signInWithGoogle({ sub: "g-again", email: "old@example.com" }))
          .session,
      );
      const second = await me(
        (await signInWithGoogle({ sub: "g-again", email: "new2@example.com" }))
          .session,
      );
      expect(second?.id).toBe(first?.id);
      expect(second?.email).toBe("new2@example.com");
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.googleSub, "g-again"));
      expect(rows).toHaveLength(1);
    });
  },
);

describe(
  "AUTH-005: signing in returns the user to where they were going",
  { tags: ["AUTH-005"] },
  () => {
    it("redirects to the returnTo path, query included", async () => {
      const { location } = await signInWithGoogle(
        { sub: "g-return", email: "ret@example.com" },
        "/join/abc?x=1",
      );
      expect(location).toBe("/join/abc?x=1");
    });
  },
);

describe(
  "AUTH-006: return destinations are restricted to the app",
  { tags: ["AUTH-006"] },
  () => {
    it.each([
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "evil.com",
      "javascript:alert(1)",
    ])("%s goes home", async (returnTo) => {
      const { location } = await signInWithGoogle(
        { sub: "g-external", email: "ext@example.com" },
        returnTo,
      );
      expect(location).toBe("/");
    });
  },
);

describe(
  "ROLE-015: site admin status comes from configuration",
  { tags: ["ROLE-015"] },
  () => {
    it("a verified configured email is a site admin (case-insensitive)", async () => {
      const { session } = await signInWithGoogle({
        sub: "g-admin",
        email: "admin@example.com",
        email_verified: true,
      });
      expect((await me(session))?.isSiteAdmin).toBe(true);
    });

    it("an unverified configured email is not", async () => {
      const { session } = await signInWithGoogle({
        sub: "g-unverified",
        email: "other@example.com",
        email_verified: false,
      });
      expect((await me(session))?.isSiteAdmin).toBe(false);
    });

    it("is re-evaluated at the next sign-in once removed from the config", async () => {
      await db.insert(users).values({
        id: "01FORMERADMIN0000000000000",
        googleSub: "g-former",
        email: "former@example.com",
        name: "Former",
        isSiteAdmin: true,
        createdAt: new Date().toISOString(),
      });
      const { session } = await signInWithGoogle({
        sub: "g-former",
        email: "former@example.com",
        email_verified: true,
      });
      expect((await me(session))?.isSiteAdmin).toBe(false);
    });
  },
);

describe(
  "Google flow details",
  { tags: ["AUTH-001", "AUTH-006", "ROLE-015"] },
  () => {
    const attrs = (res: Response) =>
      Object.fromEntries(
        res.headers.getSetCookie().map((c) => {
          const [pair = "", ...rest] = c.split("; ");
          return [pair.slice(0, pair.indexOf("=")), rest.sort()];
        }),
      );

    it("keeps the flow in short-lived, HttpOnly, Lax cookies scoped to the callback", async () => {
      const start = await request("/api/auth/google");
      const flow = attrs(start);
      expect(Object.keys(flow).sort()).toEqual([
        "oauth_return",
        "oauth_state",
        "oauth_verifier",
      ]);
      for (const a of Object.values(flow))
        expect(a).toEqual([
          "HttpOnly",
          "Max-Age=600",
          "Path=/api/auth/google",
          "SameSite=Lax",
        ]);
      const secure = attrs(await request("https://localhost/api/auth/google"));
      for (const a of Object.values(secure)) expect(a).toContain("Secure");
    });

    it("clears the flow cookies on the callback", async () => {
      const res = await request("/api/auth/google/callback");
      const flow = attrs(res);
      for (const name of ["oauth_return", "oauth_state", "oauth_verifier"])
        expect(flow[name]).toEqual(
          expect.arrayContaining(["Path=/api/auth/google"]),
        );
    });

    it.each([
      ["no code", "", true, true],
      ["no state cookie", "code=abc&", false, true],
      ["no verifier cookie", "code=abc&", true, false],
    ])(
      "rejects a callback with %s",
      async (_, query, withState, withVerifier) => {
        const fetchSpy = stubGoogle({
          sub: "g-missing",
          email: "m@example.com",
        });
        const start = await request("/api/auth/google");
        const flow = cookies(start);
        const state = flow.oauth_state ?? "";
        const cookie = [
          withState && `oauth_state=${state}`,
          withVerifier && `oauth_verifier=${flow.oauth_verifier ?? ""}`,
        ]
          .filter(Boolean)
          .join("; ");
        const res = await request(
          `/api/auth/google/callback?${query}state=${state}`,
          {
            headers: { Cookie: cookie },
          },
        );
        expect(res.headers.get("Location")).toBe("/login?error=state");
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it("keeps in-app paths that contain a double slash later on", async () => {
      const { location } = await signInWithGoogle(
        { sub: "g-double", email: "dbl@example.com" },
        "/g/abc//x",
      );
      expect(location).toBe("/g/abc//x");
    });

    it("matches admin emails ignoring spaces and case in the config", async () => {
      // SITE_ADMIN_EMAILS is "Admin@Example.com, other@example.com".
      const { session } = await signInWithGoogle({
        sub: "g-other-admin",
        email: "OTHER@example.com",
        email_verified: true,
      });
      expect((await me(session))?.isSiteAdmin).toBe(true);
    });
  },
);
