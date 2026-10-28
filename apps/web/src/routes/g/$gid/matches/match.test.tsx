import { displayRating, replay, resolveRatingConfig } from "@mmr/core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { toLocalInput } from "@/lib/batch";
import type { GroupData } from "@/lib/groups";

import { match, snapshot } from "../../../../../test/fixtures";
import { type Call, renderRoute, stubApi } from "../../../../../test/render";

const M1 = match(
  "m1",
  0,
  [
    [["b"], 2, 7],
    [["a"], 1, 11],
  ],
  { notes: "Close one", recordedByPlayerId: "b", version: 3 },
);
const OTHER = match("m0", -1, [
  [["a"], 1],
  [["b"], 2],
]);

function open(
  role: string | null,
  opts: {
    data?: () => GroupData;
    patch?: (body: unknown) => unknown;
    del?: () => unknown;
  } = {},
) {
  const data = opts.data ?? (() => snapshot({ role, matches: [OTHER, M1] }));
  const calls: Call[] = stubApi({
    "GET /api/me": () => ({ user: role ? { id: "u1", name: "Ann" } : null }),
    "GET /api/groups/g1": data,
    "PATCH /api/groups/g1/matches/m1": opts.patch ?? (() => ({})),
    "DELETE /api/groups/g1/matches/m1": opts.del ?? (() => ({})),
  });
  const writes = () =>
    calls.filter((c) => c.method !== "GET").map((c) => [c.method, c.body]);
  const ifMatch = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method && init.method !== "GET")
      .map(([, init]) => new Headers(init?.headers).get("If-Match"));
  return { calls, writes, ifMatch, ...renderRoute("/g/g1/matches/m1") };
}

const error = (status: number, details?: unknown) => () =>
  Response.json(
    { error: { code: "bad", message: "Rejected", details } },
    { status },
  );
const edit = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
};
const saveChanges = () =>
  userEvent.click(screen.getByRole("button", { name: "Save changes" }));
const score = (team: number) =>
  screen.getByRole("textbox", { name: `Match 1 team ${String(team)} score` });

describe("match details", { tags: ["BOARD-005"] }, () => {
  it("shows the date, teams by place with scores and rating changes, notes and recorder", async () => {
    open("viewer");
    const teams = await screen.findByRole("list", { name: "Teams" });
    const when = new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(M1.playedAt));
    expect(screen.getByText(when)).toBeTruthy();
    const { matches } = replay(
      [OTHER, M1],
      resolveRatingConfig(undefined),
      new Date().toISOString(),
    );
    const delta = (pid: string) => {
      const c = matches.get("m1")?.get(pid);
      return c ? displayRating(c.after) - displayRating(c.before) : 0;
    };
    const sign = (d: number) => `${d >= 0 ? "+" : "−"}${String(Math.abs(d))}`;
    expect([...teams.children].map((li) => li.textContent)).toEqual([
      `Winner11Ann${sign(delta("a"))}`,
      `Place 27Bob${sign(delta("b"))}`,
    ]);
    expect(delta("b")).toBeLessThan(0);
    expect(screen.getByText("Close one").tagName).toBe("P");
    expect(screen.getByText("Recorded by Bob")).toBeTruthy();
  });

  it("shows unscored placements, removed players and no recorder for the public", async () => {
    const unscored = match("m1", 0, [
      [["a"], 1],
      [["gone"], 2],
      [["c"], 3],
    ]);
    open(null, {
      data: () =>
        snapshot({
          role: null,
          group: { teamFormat: { kind: "flexible" } },
          matches: [unscored],
        }),
    });
    const teams = await screen.findByRole("list", { name: "Teams" });
    expect(
      [...teams.children].map((li) => li.textContent.replace(/[+−]\d+$/, "")),
    ).toEqual(["WinnerAnn", "Place 2Removed player", "Place 3Cy"]);
    expect(screen.queryByText(/Recorded by/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("shows an unchanged rating as +0", async () => {
    // Alternating wins and ties: by m18 one of Ann's changes rounds to zero.
    const history = Array.from({ length: 19 }, (_, i) => {
      const [w, l] = i % 3 === 0 ? ["b", "a"] : ["a", "b"];
      return match(`m${String(i)}`, i - 19, [
        [[w], 1],
        [[l], i % 2 === 0 ? 1 : 2],
      ]);
    });
    const { matches } = replay(
      history,
      resolveRatingConfig(undefined),
      new Date().toISOString(),
    );
    const c = matches.get("m18")?.get("a");
    expect(c && displayRating(c.after) - displayRating(c.before)).toBe(0);
    stubApi({
      "GET /api/me": () => ({ user: { id: "u1", name: "Ann" } }),
      "GET /api/groups/g1": () =>
        snapshot({
          role: "viewer",
          group: { allowTies: true },
          matches: history,
        }),
    });
    renderRoute("/g/g1/matches/m18");
    const teams = await screen.findByRole("list", { name: "Teams" });
    expect(within(teams).getByText("Ann").nextSibling?.textContent).toBe("+0");
  });

  it("explains a deleted match", async () => {
    open("viewer", { data: () => snapshot({ role: "viewer" }) });
    expect(
      (await screen.findByText(/This match doesn't exist anymore\./))
        .textContent,
    ).toBe("This match doesn't exist anymore. Back to matches");
    expect(
      screen
        .getByRole("link", { name: "Back to matches" })
        .getAttribute("href"),
    ).toBe("/g/g1/matches");
  });
});

describe("who can edit", { tags: ["ROLE-003", "ROLE-004"] }, () => {
  it("lets admins edit any match", async () => {
    open("admin");
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("lets recorders edit only their own matches", async () => {
    // The fixture member is player a; M1 was recorded by b.
    open("recorder");
    await screen.findByRole("list", { name: "Teams" });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("lets recorders edit what they recorded", async () => {
    open("recorder", {
      data: () =>
        snapshot({
          role: "recorder",
          matches: [{ ...M1, recordedByPlayerId: "a" }],
        }),
    });
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
  });
});

describe(
  "editing",
  { tags: ["EDIT-002", "EDIT-006", "EDIT-008", "EDIT-011"] },
  () => {
    it("opens the editor on the current values, and cancels", async () => {
      open("admin");
      await edit();
      expect(score(1)).toHaveProperty("value", "7");
      expect(score(2)).toHaveProperty("value", "11");
      expect(screen.getByLabelText("Match 1 date and time")).toHaveProperty(
        "value",
        toLocalInput(new Date(M1.playedAt)),
      );
      expect(screen.getByRole("textbox", { name: "Notes" })).toHaveProperty(
        "value",
        "Close one",
      );
      expect(
        screen
          .getByRole("textbox", { name: "Notes" })
          .getAttribute("maxlength"),
      ).toBe("500");
      expect(screen.getAllByText(/% to win/)).toHaveLength(2);
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    });

    it("closes without saving when nothing changed", async () => {
      const { writes } = open("admin");
      await edit();
      await saveChanges();
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
      expect(writes()).toEqual([]);
    });

    it("saves just the changed fields against the version shown", async () => {
      const { writes, ifMatch, queryClient } = open("admin");
      await edit();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      await userEvent.clear(screen.getByRole("textbox", { name: "Notes" }));
      await userEvent.type(
        screen.getByRole("textbox", { name: "Notes" }),
        "Rematch",
      );
      await saveChanges();
      await waitFor(() => {
        expect(writes()).toEqual([["PATCH", { notes: "Rematch" }]]);
      });
      expect(ifMatch()).toEqual(['"3"']);
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Save changes" }),
        ).toBeNull();
      });
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["group", "g1"],
      ]);
    });

    it("checks changed teams against the group's rules first", async () => {
      const { writes } = open("admin");
      await edit();
      await userEvent.clear(score(1));
      await userEvent.type(score(1), "11");
      await saveChanges();
      expect(
        within(screen.getByRole("group", { name: "Match 1" })).getByRole(
          "alert",
        ).textContent,
      ).toContain("This group doesn't allow ties");
      expect(writes()).toEqual([]);
    });

    it("only checks the date when just the date changed", async () => {
      const { writes } = open("admin", {
        // Ties are no longer allowed, but the teams aren't being edited (EDIT-011).
        data: () =>
          snapshot({
            role: "admin",
            matches: [
              {
                ...M1,
                teams: M1.teams.map((t) => ({ ...t, score: 5, rank: 1 })),
              },
            ],
          }),
      });
      await edit();
      const date = screen.getByLabelText("Match 1 date and time");
      fireEvent.change(date, {
        target: { value: toLocalInput(new Date(Date.now() + 3 * 86_400_000)) },
      });
      await saveChanges();
      expect(screen.getByRole("alert").textContent).toBe(
        "Can't be more than 24 hours from now",
      );
      expect(writes()).toEqual([]);
      fireEvent.change(date, { target: { value: "2026-09-01T10:00" } });
      await saveChanges();
      await waitFor(() => {
        expect(writes()).toEqual([
          ["PATCH", { playedAt: new Date("2026-09-01T10:00").toISOString() }],
        ]);
      });
    });

    it("shows the server's issues", async () => {
      open("admin", {
        patch: error(400, [{ message: "Too old" }, {}]),
      });
      await edit();
      await userEvent.type(screen.getByRole("textbox", { name: "Notes" }), "!");
      await saveChanges();
      const alert = await within(
        screen.getByRole("group", { name: "Match 1" }),
      ).findByRole("alert");
      expect(
        [...alert.querySelectorAll("li")].map((li) => li.textContent),
      ).toEqual(["Too old", "Invalid"]);
      expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    });

    it("keeps the editor open on other errors", async () => {
      open("admin", { patch: error(500) });
      await edit();
      await userEvent.type(screen.getByRole("textbox", { name: "Notes" }), "!");
      await saveChanges();
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  },
);

describe("stale edits", { tags: ["EDIT-010"] }, () => {
  it("shows the newer version and asks to edit again", async () => {
    let version = 3;
    const { writes, queryClient } = open("admin", {
      data: () =>
        snapshot({
          role: "admin",
          matches: [
            {
              ...M1,
              version,
              notes: version > 3 ? "Changed elsewhere" : M1.notes,
            },
          ],
        }),
      patch: () => {
        version = 4;
        return error(412)();
      },
    });
    await edit();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.type(screen.getByRole("textbox", { name: "Notes" }), "!");
    await saveChanges();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This match changed while you were editing. The latest version is shown; make your change again.",
    );
    // The form remounted on version 4.
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Notes" })).toHaveProperty(
        "value",
        "Changed elsewhere",
      );
    });
    expect(writes()).toHaveLength(1);
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["group", "g1"],
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await edit();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("deleting", { tags: ["EDIT-007"] }, () => {
  it("confirms, deletes the shown version and returns to the list", async () => {
    const { writes, ifMatch, router, queryClient } = open("admin");
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
    );
    expect((await screen.findByRole("alertdialog")).textContent).toContain(
      "Delete this match?",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(writes()).toEqual([]);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete match" }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/g/g1/matches");
    });
    expect(writes()).toEqual([["DELETE", undefined]]);
    expect(ifMatch()).toEqual(['"3"']);
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual([
      "group",
      "g1",
    ]);
  });

  it("refreshes but stays put when the delete fails", async () => {
    const { router, queryClient } = open("admin", { del: error(412) });
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete match" }),
    );
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled();
    });
    expect(router.state.location.pathname).toBe("/g/g1/matches/m1");
  });
});
