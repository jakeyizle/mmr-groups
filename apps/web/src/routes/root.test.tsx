import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderRoute, stubApi } from "../../test/render";

const ANN = { id: "u1", name: "Ann Smith", isSiteAdmin: false };

function open(
  path: string,
  user: object | null,
  overrides: Record<string, (body: unknown) => unknown> = {},
) {
  const calls = stubApi({
    "GET /api/me": () => ({ user }),
    "GET /api/groups": () => ({ groups: [] }),
    ...overrides,
  });
  return { calls, ...renderRoute(path) };
}

describe("header", { tags: ["AUTH-003", "AUTH-004"] }, () => {
  it("shows neither sign-in nor the landing page until it knows the user", async () => {
    stubApi({ "GET /api/me": () => new Promise(() => undefined) });
    renderRoute("/");
    await screen.findByRole("banner");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("main")?.textContent ?? "").toBe("");
  });

  it("links home and offers sign-in to visitors", async () => {
    open("/", null);
    const banner = await screen.findByRole("banner");
    expect(
      within(banner)
        .getByRole("link", { name: "MMR Groups" })
        .getAttribute("href"),
    ).toBe("/");
    expect(
      (
        await within(banner).findByRole("link", { name: "Sign in" })
      ).getAttribute("href"),
    ).toBe("/login");
  });

  it("shows the signed-in user and signs them out", async () => {
    const { calls, router } = open("/groups", ANN, {
      "POST /api/auth/logout": () => ({}),
      "GET /api/public-groups": () => ({ groups: [], nextCursor: null }),
    });
    const banner = await screen.findByRole("banner");
    expect(await within(banner).findByText("Ann Smith")).toBeTruthy();
    await userEvent.click(
      within(banner).getByRole("button", { name: "Sign out" }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(
      ["/api/auth/logout"],
    );
    // The cache is cleared, so who's signed in is asked again.
    await waitFor(() => {
      expect(calls.filter((c) => c.path === "/api/me").length).toBeGreaterThan(
        1,
      );
    });
  });
});

describe("home", { tags: ["GROUP-006", "VIS-005", "VIS-009"] }, () => {
  it("invites visitors to sign in, see the demo or browse", async () => {
    open("/", null);
    expect(
      await screen.findByRole("heading", {
        name: "Track your group's ratings",
      }),
    ).toBeTruthy();
    const href = (name: string) =>
      within(screen.getByRole("main"))
        .getByRole("link", { name })
        .getAttribute("href");
    expect(href("Sign in to get started")).toBe("/login");
    expect(href("See the demo league")).toBe("/g/demo");
    expect(href("Browse public groups")).toBe("/groups");
  });

  it("lists the user's groups with their role", async () => {
    open("/", ANN, {
      "GET /api/groups": () => ({
        groups: [
          { id: "g1", name: "Chess club", role: "owner" },
          { id: "g2", name: "Go", role: "viewer" },
        ],
      }),
    });
    expect(
      await screen.findByRole("heading", { name: "Your groups" }),
    ).toBeTruthy();
    const items = await screen.findAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Chess clubowner",
      "Goviewer",
    ]);
    expect(
      within(items.at(0) ?? document.body)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/g/g1");
    expect(
      screen.getByRole("link", { name: "New group" }).getAttribute("href"),
    ).toBe("/groups/new");
    expect(
      screen
        .getByRole("link", { name: "Browse public groups" })
        .getAttribute("href"),
    ).toBe("/groups");
    expect(screen.queryByText(/not in any groups/)).toBeNull();
  });

  it("explains how to get started without groups", async () => {
    open("/", ANN);
    expect(
      await screen.findByText(
        "You're not in any groups yet. Create one, or ask a friend for an invite link.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders nothing until it knows who's signed in", () => {
    stubApi({ "GET /api/me": () => new Promise(() => undefined) });
    renderRoute("/");
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

describe("sign-in page", { tags: ["AUTH-001", "AUTH-005"] }, () => {
  const google = () =>
    screen
      .getByRole("link", { name: "Continue with Google" })
      .getAttribute("href");

  it("signs in with Google", async () => {
    open("/login", null);
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeTruthy();
    expect(google()).toBe("/api/auth/google");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("passes the return destination on", async () => {
    open("/login?returnTo=%2Fg%2F1%3Fx%3D1%26y", null);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(google()).toBe(
      `/api/auth/google?returnTo=${encodeURIComponent("/g/1?x=1&y")}`,
    );
  });

  it("explains a failed sign-in", async () => {
    open("/login?error=denied", null);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sign-in didn't complete. Please try again.",
    );
  });

  it("ignores non-string params", async () => {
    open("/login?returnTo=5&error=true", null);
    await screen.findByRole("heading", { name: "Sign in" });
    expect(google()).toBe("/api/auth/google");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
