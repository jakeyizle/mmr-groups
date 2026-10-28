import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GroupData } from "@/lib/groups";

import { match, snapshot } from "../../../../../test/fixtures";
import { renderRoute, stubApi } from "../../../../../test/render";

function open(path: string, data: GroupData, signedIn = true) {
  stubApi({
    "GET /api/me": () => ({
      user: signedIn ? { id: "u1", name: "Ann" } : null,
    }),
    "GET /api/groups/g1": () => data,
  });
  return renderRoute(path);
}

const MATCHES = [
  match("m1", 0, [
    [["a"], 1],
    [["b"], 2],
  ]),
  match("m2", 1, [
    [["b"], 1],
    [["c"], 2],
  ]),
  match("m3", 2, [
    [["c"], 1],
    [["a"], 2],
  ]),
];

const listed = async () =>
  within(await screen.findByRole("list", { name: "Matches" }))
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"));

describe(
  "match history",
  { tags: ["BOARD-004", "BOARD-005", "BOARD-006"] },
  () => {
    it("lists matches newest first, with rating changes", async () => {
      open("/g/g1/matches", snapshot({ matches: MATCHES }));
      expect(await listed()).toEqual([
        "/g/g1/matches/m3",
        "/g/g1/matches/m2",
        "/g/g1/matches/m1",
      ]);
      expect(
        screen.getByRole<HTMLSelectElement>("combobox", {
          name: "Filter by player",
        }).selectedIndex,
      ).toBe(0);
      // Every player in a rated match shows a change.
      const [first] = within(
        screen.getByRole("list", { name: "Matches" }),
      ).getAllByRole("link");
      expect(first?.textContent).toMatch(/Cy[+−]\d+.*Ann[+−]\d+/);
    });

    it("filters by player through the URL", async () => {
      const { router } = open(
        "/g/g1/matches?player=c",
        snapshot({ matches: MATCHES }),
      );
      expect(await listed()).toEqual(["/g/g1/matches/m3", "/g/g1/matches/m2"]);
      const filter = screen.getByRole<HTMLSelectElement>("combobox", {
        name: "Filter by player",
      });
      expect(filter.value).toBe("c");
      expect([...filter.options].map((o) => [o.value, o.textContent])).toEqual([
        ["", "Everyone"],
        ["a", "Ann"],
        ["b", "Bob"],
        ["c", "Cy"],
      ]);
      fireEvent.change(filter, { target: { value: "a" } });
      await waitFor(() => {
        expect(router.state.location.search).toEqual({ player: "a" });
      });
      expect(await listed()).toEqual(["/g/g1/matches/m3", "/g/g1/matches/m1"]);
      fireEvent.change(filter, { target: { value: "" } });
      await waitFor(() => {
        expect(router.state.location.search).toEqual({});
      });
      expect(await listed()).toHaveLength(3);
    });

    it("ignores a malformed filter", async () => {
      open("/g/g1/matches?player=5", snapshot({ matches: MATCHES }));
      expect(await listed()).toHaveLength(3);
    });

    it("says when there are no matches", async () => {
      open(
        "/g/g1/matches?player=a",
        snapshot({ matches: MATCHES.slice(1, 2) }),
      );
      expect(await screen.findByText("No matches yet.")).toBeTruthy();
    });

    it("links recorders to record matches", async () => {
      open("/g/g1/matches", snapshot({ role: "recorder" }));
      expect(
        (
          await screen.findByRole("link", { name: "Record matches" })
        ).getAttribute("href"),
      ).toBe("/g/g1/matches/new");
    });

    it("hides recording from viewers", { tags: ["ROLE-008"] }, async () => {
      open("/g/g1/matches", snapshot({ role: "viewer" }));
      await screen.findByText("No matches yet.");
      expect(screen.queryByRole("link", { name: "Record matches" })).toBeNull();
    });
  },
);

describe("recording page", { tags: ["MATCH-001"] }, () => {
  it("shows the batch form", async () => {
    open("/g/g1/matches/new", snapshot({ role: "recorder" }));
    expect(
      await screen.findByRole("heading", { name: "Record matches" }),
    ).toBeTruthy();
    expect(await screen.findByRole("group", { name: "Match 1" })).toBeTruthy();
  });

  it("needs a signed-in user", { tags: ["AUTH-005"] }, async () => {
    const router = open(
      "/g/g1/matches/new",
      snapshot({ role: null }),
      false,
    ).router;
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
  });
});
