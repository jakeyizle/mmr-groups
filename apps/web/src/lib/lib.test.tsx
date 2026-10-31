import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { user } from "../../test/fixtures";
import { renderWithQuery, stubApi } from "../../test/render";
import { ApiError, client, meQuery, unwrap } from "./api";
import { requireUser } from "./auth";
import { Can } from "./can";
import { SERIES } from "./charts";
import {
  formatLabel,
  type GroupData,
  groupQuery,
  groupsQuery,
  useGroupActor,
} from "./groups";

describe("unwrap", () => {
  it("returns the JSON body on success", async () => {
    stubApi({ "GET /api/me": () => ({ user: null }) });
    expect(await unwrap(await client.me.$get())).toEqual({ user: null });
  });

  it("throws the API's error, with status and details", async () => {
    stubApi({
      "GET /api/me": () =>
        Response.json(
          { error: { code: "nope", message: "No way", details: [1] } },
          { status: 403 },
        ),
    });
    const err = await unwrap(await client.me.$get()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 403,
      code: "nope",
      message: "No way",
      details: [1],
    });
  });

  it("falls back for errors without a JSON body", async () => {
    stubApi({ "GET /api/me": () => new Response("oops", { status: 502 }) });
    const err = await unwrap(await client.me.$get()).catch((e: unknown) => e);
    expect(err).toMatchObject({
      status: 502,
      code: "unknown",
      message: "HTTP 502",
      details: undefined,
    });
  });

  it("sends the CSRF headers (PLAN §7)", async () => {
    stubApi({ "GET /api/me": () => ({ user: null }) });
    await client.me.$get();
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("X-Requested-With")).toBe("fetch");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });
});

describe("stubApi", () => {
  it("types handlers by the real route's success body", () => {
    const calls = stubApi({
      // @ts-expect-error -- /api/me's user has every field
      "GET /api/me": () => ({ user: { id: "u1" } }),
      // @ts-expect-error -- no such route, so only a Response fits
      "GET /api/nope": () => ({}),
      "GET /api/groups/g1/audit": () => new Response("oops", { status: 502 }),
    });
    expect(calls).toEqual([]);
  });
});

describe("queries", () => {
  it("reads the signed-in user and their groups", async () => {
    const groups = [
      {
        id: "g1",
        name: "Chess club",
        visibility: "private" as const,
        role: "owner" as const,
      },
    ];
    stubApi({
      "GET /api/me": () => ({ user: user() }),
      "GET /api/groups": () => ({ groups }),
    });
    const qc = new QueryClient();
    expect(await qc.query(meQuery)).toEqual(user());
    expect(await qc.query(groupsQuery)).toEqual(groups);
    expect(meQuery.staleTime).toBe(300_000);
  });

  it("are keyed the way mutations invalidate them", () => {
    expect(meQuery.queryKey).toEqual(["me"]);
    expect(groupsQuery.queryKey).toEqual(["groups"]);
    expect(groupQuery("g1").queryKey).toEqual(["group", "g1"]);
  });
});

describe("requireUser", { tags: ["AUTH-005"] }, () => {
  it("returns the signed-in user", async () => {
    stubApi({ "GET /api/me": () => ({ user: user() }) });
    const context = { queryClient: new QueryClient() };
    expect(await requireUser({ context, location: { href: "/x" } })).toEqual({
      me: user(),
    });
  });

  it("redirects to sign-in, coming back afterwards", async () => {
    stubApi({ "GET /api/me": () => ({ user: null }) });
    const context = { queryClient: new QueryClient() };
    const thrown = await requireUser({
      context,
      location: { href: "/g/1?x=1" },
    }).catch((e: unknown) => e);
    expect(thrown).toMatchObject({
      options: { to: "/login", search: { returnTo: "/g/1?x=1" } },
    });
  });

  it("asks the API only once per session", async () => {
    const calls = stubApi({ "GET /api/me": () => ({ user: user() }) });
    const context = { queryClient: new QueryClient() };
    await requireUser({ context, location: { href: "/" } });
    await requireUser({ context, location: { href: "/" } });
    expect(calls).toHaveLength(1);
  });
});

describe("Can", { tags: ["ROLE-008"] }, () => {
  it("renders children only when allowed", () => {
    render(
      <>
        <Can
          actor={{ role: "admin", playerId: "p", isSiteAdmin: false }}
          action="group.editSettings"
        >
          yes
        </Can>
        <Can
          actor={{ role: "viewer", playerId: "p", isSiteAdmin: false }}
          action="group.editSettings"
        >
          no
        </Can>
      </>,
    );
    expect(screen.getByText("yes")).toBeTruthy();
    expect(screen.queryByText("no")).toBeNull();
  });
});

describe("SERIES", () => {
  it("names the eight palette colors in order", () => {
    expect(SERIES).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `var(--series-${String(i)})`),
    );
  });
});

describe("formatLabel", () => {
  it("describes the team format", () => {
    expect(formatLabel({ kind: "flexible" })).toBe(
      "Flexible (any teams and sizes)",
    );
    expect(formatLabel({ kind: "fixed", teams: 2, size: 3 })).toBe(
      "2 teams of 3",
    );
  });
});

describe("useGroupActor", () => {
  it("combines the group role with site-admin status", async () => {
    stubApi({ "GET /api/me": () => ({ user: user({ isSiteAdmin: true }) }) });
    const data = { me: { role: "recorder", playerId: "p1" } } as GroupData;
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useGroupActor(data));
      return null;
    }
    renderWithQuery(<Probe />);
    await waitFor(() => {
      expect(seen.at(-1)).toEqual({
        role: "recorder",
        playerId: "p1",
        isSiteAdmin: true,
      });
    });
    expect(seen[0]).toEqual({
      role: "recorder",
      playerId: "p1",
      isSiteAdmin: false,
    });
  });

  it("is an outsider without data or membership", async () => {
    const calls = stubApi({ "GET /api/me": () => ({ user: null }) });
    const seen: unknown[] = [];
    function Probe({ data }: { data: GroupData | undefined }) {
      seen.push(useGroupActor(data));
      return null;
    }
    renderWithQuery(
      <>
        <Probe data={undefined} />
        <Probe data={{ me: null } as GroupData} />
      </>,
    );
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    const outsider = { role: null, playerId: null, isSiteAdmin: false };
    expect(seen.slice(-2)).toEqual([outsider, outsider]);
  });
});
