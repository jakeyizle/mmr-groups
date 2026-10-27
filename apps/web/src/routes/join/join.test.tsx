import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { snapshot } from "../../../test/fixtures";
import { renderRoute, stubApi } from "../../../test/render";

const offer = (extra: object = {}) => ({
  group: { id: "g1", name: "Chess club" },
  member: false,
  players: [
    { id: "p2", displayName: "Bob", role: "recorder" },
    { id: "p3", displayName: "Cy", role: "viewer" },
  ],
  ...extra,
});
const error =
  (status: number, code: string, message = "Nope") =>
  () =>
    Response.json({ error: { code, message } }, { status });

function open(
  overrides: Record<string, (body: unknown) => unknown> = {},
  user: object | null = { id: "u1", name: "Dee" },
) {
  const calls = stubApi({
    "GET /api/me": () => ({ user }),
    "GET /api/invites/abc": () => offer(),
    "POST /api/invites/abc/claim": () => ({}),
    "GET /api/groups/g1": () => snapshot(),
    ...overrides,
  });
  const claims = () =>
    calls.filter((c) => c.path === "/api/invites/abc/claim").map((c) => c.body);
  return { calls, claims, ...renderRoute("/join/abc") };
}

describe("joining", { tags: ["JOIN-005", "JOIN-006", "JOIN-007"] }, () => {
  it("offers the unclaimed players with their roles", async () => {
    open();
    expect(
      await screen.findByRole("heading", { name: "Join Chess club" }),
    ).toBeTruthy();
    expect(screen.getByText("Which player are you?")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Unclaimed players" }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["BobRecorder", "CyViewer"]);
  });

  it("claims a player and opens the group", async () => {
    const { claims, router, queryClient } = open();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(await screen.findByRole("button", { name: /^Cy/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/g/g1");
    });
    expect(claims()).toEqual([{ playerId: "p3" }]);
    await waitFor(() => {
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual([
        "groups",
      ]);
    });
  });

  it("joins as a new player with a valid name", async () => {
    const { claims, router } = open({
      "GET /api/invites/abc": () => offer({ players: [] }),
    });
    await screen.findByRole("heading", { name: "Join Chess club" });
    expect(
      screen.queryByRole("list", { name: "Unclaimed players" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "I'm not listed" }),
    );
    const name = screen.getByRole("textbox", {
      name: "Your name in this group",
    });
    expect(document.activeElement).toBe(name);
    const join = screen.getByRole("button", { name: "Join" });
    expect(join).toHaveProperty("disabled", true);
    await userEvent.type(name, "   ");
    expect(join).toHaveProperty("disabled", true);
    await userEvent.type(name, "{Enter}");
    expect(claims()).toEqual([]);
    await userEvent.clear(name);
    await userEvent.type(name, "Dee");
    await userEvent.click(join);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/g/g1");
    });
    expect(claims()).toEqual([{ newPlayerName: "Dee" }]);
  });

  it("disables choices while claiming", async () => {
    let release = (): void => undefined;
    open({
      "POST /api/invites/abc/claim": () =>
        new Promise((resolve) => {
          release = () => {
            resolve({});
          };
        }),
    });
    await userEvent.click(await screen.findByRole("button", { name: /^Bob/ }));
    expect(screen.getByRole("button", { name: /^Cy/ })).toHaveProperty(
      "disabled",
      true,
    );
    release();
  });
});

describe("join problems", { tags: ["JOIN-009", "JOIN-013"] }, () => {
  it("offers what's left when someone else claimed the player first", async () => {
    let lost = false;
    const { calls } = open({
      "GET /api/invites/abc": () =>
        offer(
          lost
            ? { players: [{ id: "p3", displayName: "Cy", role: "viewer" }] }
            : {},
        ),
      "POST /api/invites/abc/claim": () => {
        lost = true;
        return error(409, "claim_lost")();
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: /^Bob/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Someone else just claimed that player. Pick again.",
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Bob/ })).toBeNull();
    });
    expect(calls.filter((c) => c.path === "/api/invites/abc")).toHaveLength(2);
  });

  it("shows other claim errors as they are, until the name changes", async () => {
    const { calls } = open({
      "POST /api/invites/abc/claim": error(409, "name_taken", "Name taken"),
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "I'm not listed" }),
    );
    const name = screen.getByRole("textbox", {
      name: "Your name in this group",
    });
    await userEvent.type(name, "Bob{Enter}");
    expect((await screen.findByRole("alert")).textContent).toBe("Name taken");
    // Not a lost claim: the offer isn't reloaded.
    expect(calls.filter((c) => c.path === "/api/invites/abc")).toHaveLength(1);
    await userEvent.type(name, "by");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows no group details for an invalid link", async () => {
    open({ "GET /api/invites/abc": error(404, "not_found") });
    expect(
      await screen.findByText(
        "This invite link is no longer valid. Ask the group for a new one.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Chess club/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Go home" }).getAttribute("href"),
    ).toBe("/");
  });
});

describe(
  "joining as a member or visitor",
  { tags: ["JOIN-004", "JOIN-008"] },
  () => {
    it("sends members straight to the group, replacing the history entry", async () => {
      const { router } = open({
        "GET /api/invites/abc": () => offer({ member: true }),
      });
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/g/g1");
      });
      expect(router.history.length).toBe(1);
    });

    it("asks visitors to sign in, then comes back", async () => {
      const { router } = open({}, null);
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/login");
      });
      expect(router.state.location.search).toEqual({ returnTo: "/join/abc" });
    });
  },
);
