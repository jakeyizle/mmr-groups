import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type BatchForm, blankRow, toLocalInput } from "@/lib/batch";
import type { GroupData } from "@/lib/groups";

import { user } from "../../../test/fixtures";
import { renderInRouter, stubApi, type Stubs } from "../../../test/render";
import { BatchEntry } from "./batch-entry";

const KEY = "mmr:draft:g1";
const FORMAT = { kind: "fixed", teams: 2, size: 1 } as const;
const data = (role: string) =>
  ({
    group: {
      id: "g1",
      version: 1,
      ratingConfig: null,
      teamFormat: FORMAT,
      scoringMode: "optional",
      allowTies: false,
    },
    players: [
      { id: "a", displayName: "Ann" },
      { id: "b", displayName: "Bob" },
    ],
    matches: [],
    me: { role, playerId: "a" },
  }) as unknown as GroupData;

const error = (status: number, body: object) => () =>
  Response.json(
    { error: { code: "bad", message: "Rejected", ...body } },
    { status },
  );

type Overridable =
  "POST /api/groups/g1/matches" | "POST /api/groups/g1/players";
function setup(role = "recorder", overrides: Partial<Stubs<Overridable>> = {}) {
  const calls = stubApi({
    "GET /api/me": () => ({ user: user() }),
    "POST /api/groups/g1/matches": () => ({ matches: [] }),
    "POST /api/groups/g1/players": () => ({ players: [] }),
    ...overrides,
  });
  const rendered = renderInRouter(<BatchEntry data={data(role)} />);
  const posts = (path: string) =>
    calls
      .filter((c) => c.method === "POST" && c.path === path)
      .map((c) => c.body);
  return { ...rendered, calls, posts };
}

const draft = (rows: BatchForm["rows"]) => {
  localStorage.setItem(KEY, JSON.stringify({ rows }));
};
const filled = (playedAt: string, a = "a", b = "b") => ({
  playedAt,
  teams: [
    { playerIds: [a], score: "11", rank: "" },
    { playerIds: [b], score: "7", rank: "" },
  ],
});
const matchRows = () => screen.getAllByRole("group", { name: /^Match \d+$/ });
const save = () => screen.getByRole("button", { name: /^Save/ });

afterEach(() => {
  localStorage.clear();
});

describe("BatchEntry", { tags: ["MATCH-001", "MATCH-002"] }, () => {
  it("is read-only for viewers", { tags: ["ROLE-008"] }, async () => {
    setup("viewer");
    expect(
      await screen.findByText(
        "You can view this group but not record matches.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("starts with one blank match at the current minute", async () => {
    const before = toLocalInput(new Date());
    setup();
    await screen.findByRole("group", { name: "Match 1" });
    const after = toLocalInput(new Date());
    expect(matchRows()).toHaveLength(1);
    const at = screen.getByLabelText<HTMLInputElement>(
      "Match 1 date and time",
    ).value;
    expect([before, after]).toContain(at);
    expect(save().textContent).toBe("Save match");
    // Only admins can add players inline.
    expect(screen.queryByRole("textbox", { name: "New player" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it(
    "adds a match a minute after the last, and removes it",
    { tags: ["MATCH-005"] },
    async () => {
      setup();
      await screen.findByRole("group", { name: "Match 1" });
      fireEvent.change(screen.getByLabelText("Match 1 date and time"), {
        target: { value: "2026-10-12T18:05" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Add match" }));
      expect(matchRows()).toHaveLength(2);
      expect(screen.getByLabelText("Match 2 date and time")).toHaveProperty(
        "value",
        "2026-10-12T18:06",
      );
      expect(save().textContent).toBe("Save 2 matches");
      await userEvent.click(
        within(screen.getByRole("group", { name: "Match 1" })).getByRole(
          "button",
          {
            name: "Remove",
          },
        ),
      );
      expect(matchRows()).toHaveLength(1);
      expect(screen.getByLabelText("Match 1 date and time")).toHaveProperty(
        "value",
        "2026-10-12T18:06",
      );
    },
  );

  it(
    "duplicates a match's players into the next row",
    { tags: ["MATCH-004"] },
    async () => {
      draft([filled("2026-10-12T18:05"), blankRow(FORMAT, "2026-10-12T19:00")]);
      setup();
      await userEvent.click(
        within(await screen.findByRole("group", { name: "Match 1" })).getByRole(
          "button",
          { name: "Duplicate" },
        ),
      );
      expect(matchRows()).toHaveLength(3);
      const two = screen.getByRole("group", { name: "Match 2" });
      expect(
        within(two).getByLabelText("Match 2 date and time"),
      ).toHaveProperty("value", "2026-10-12T18:06");
      expect(
        within(two).getByRole("combobox", { name: "Match 2 team 1 player 1" }),
      ).toHaveProperty("value", "a");
      expect(
        within(two).getByRole("textbox", { name: "Match 2 team 1 score" }),
      ).toHaveProperty("value", "");
      expect(screen.getByLabelText("Match 3 date and time")).toHaveProperty(
        "value",
        "2026-10-12T19:00",
      );
    },
  );

  it("stops at 50 matches", async () => {
    draft(Array.from({ length: 50 }, () => filled("2026-10-12T18:05")));
    setup();
    expect(
      await screen.findByRole("button", { name: "Add match" }),
    ).toHaveProperty("disabled", true);
  });

  it("allows a 50th match", async () => {
    draft(Array.from({ length: 49 }, () => filled("2026-10-12T18:05")));
    setup();
    expect(
      await screen.findByRole("button", { name: "Add match" }),
    ).toHaveProperty("disabled", false);
  });
});

describe("drafts", { tags: ["MATCH-014"] }, () => {
  it("restores and keeps saving the unsaved batch", async () => {
    draft([filled("2026-10-12T18:05")]);
    setup();
    const score = await screen.findByRole("textbox", {
      name: "Match 1 team 2 score",
    });
    expect(score).toHaveProperty("value", "7");
    await userEvent.clear(score);
    await userEvent.type(score, "9");
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as BatchForm;
    expect(saved.rows[0]?.teams[1]?.score).toBe("9");
  });

  it("keeps drafts per group", async () => {
    localStorage.setItem(
      "mmr:draft:other",
      JSON.stringify({ rows: [filled("2026-01-01T00:00")] }),
    );
    setup();
    expect(
      await screen.findByLabelText("Match 1 date and time"),
    ).not.toHaveProperty("value", "2026-01-01T00:00");
  });
});

describe("saving", { tags: ["MATCH-003"] }, () => {
  it("checks every row first and saves nothing if any is invalid", async () => {
    draft([filled("2026-10-12T18:05"), filled("2026-10-12T18:06", "a", "a")]);
    const { posts } = setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Save 2 matches" }),
    );
    const issues = within(
      screen.getByRole("group", { name: "Match 2" }),
    ).getByRole("alert");
    expect(issues.textContent).toContain("A player can only appear once");
    expect(
      within(screen.getByRole("group", { name: "Match 1" })).queryByRole(
        "alert",
      ),
    ).toBeNull();
    expect(posts("/api/groups/g1/matches")).toEqual([]);
  });

  it(
    "duplicates the last match to the end",
    { tags: ["MATCH-004"] },
    async () => {
      draft([filled("2026-10-12T18:05"), filled("2026-10-12T19:00", "b", "a")]);
      setup();
      await userEvent.click(
        within(await screen.findByRole("group", { name: "Match 2" })).getByRole(
          "button",
          { name: "Duplicate" },
        ),
      );
      expect(screen.getByLabelText("Match 1 date and time")).toHaveProperty(
        "value",
        "2026-10-12T18:05",
      );
      expect(screen.getByLabelText("Match 3 date and time")).toHaveProperty(
        "value",
        "2026-10-12T19:01",
      );
    },
  );

  it("clears issues when a row is removed", async () => {
    draft([
      filled("2026-10-12T18:05"),
      filled("2026-10-12T18:06", "a", "a"),
      filled("2026-10-12T18:07"),
    ]);
    setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Save 3 matches" }),
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    await userEvent.click(
      within(screen.getByRole("group", { name: "Match 1" })).getByRole(
        "button",
        {
          name: "Remove",
        },
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // The leaderboard renders from the group snapshot this invalidates.
  it(
    "saves the batch, clears the draft and opens the history",
    { tags: ["BOARD-007"] },
    async () => {
      draft([filled("2026-10-12T18:05"), filled("2026-10-12T18:06", "b", "a")]);
      const { posts, router, queryClient } = setup();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      await userEvent.click(
        await screen.findByRole("button", { name: "Save 2 matches" }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/g/g1/matches");
      });
      const at = (local: string) => new Date(local).toISOString();
      expect(posts("/api/groups/g1/matches")).toEqual([
        {
          matches: [
            {
              playedAt: at("2026-10-12T18:05"),
              teams: [
                { playerIds: ["a"], score: 11 },
                { playerIds: ["b"], score: 7 },
              ],
            },
            {
              playedAt: at("2026-10-12T18:06"),
              teams: [
                { playerIds: ["b"], score: 11 },
                { playerIds: ["a"], score: 7 },
              ],
            },
          ],
        },
      ]);
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual([
        "group",
        "g1",
      ]);
    },
  );

  it("shows the server's issues on their rows", async () => {
    draft([filled("2026-10-12T18:05"), filled("2026-10-12T18:06")]);
    setup("recorder", {
      "POST /api/groups/g1/matches": error(400, {
        details: [
          { path: ["matches", 1, "teams"], message: "Too many matches today" },
          { path: ["matches", 1] },
          { path: ["matches", "x"], message: "ignored" },
          { message: "no path" },
        ],
      }),
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Save 2 matches" }),
    );
    const issues = await within(
      screen.getByRole("group", { name: "Match 2" }),
    ).findByRole("alert");
    expect(
      [...issues.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual(["Too many matches today", "Invalid"]);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("Rejected")).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("shows other errors below the form", async () => {
    draft([filled("2026-10-12T18:05")]);
    setup("recorder", { "POST /api/groups/g1/matches": error(409, {}) });
    await userEvent.click(
      await screen.findByRole("button", { name: "Save match" }),
    );
    expect(await screen.findByText("Rejected")).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "Match 1" })).queryByRole(
        "alert",
      ),
    ).toBeNull();
  });

  it("treats errors whose details aren't a list as general", async () => {
    draft([filled("2026-10-12T18:05")]);
    setup("recorder", {
      "POST /api/groups/g1/matches": error(400, { details: { path: [] } }),
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Save match" }),
    );
    expect(await screen.findByText("Rejected")).toBeTruthy();
  });
});

describe("adding players inline", { tags: ["MATCH-015"] }, () => {
  it("adds a player without leaving the batch", async () => {
    const { posts, queryClient } = setup("admin");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const name = await screen.findByRole("textbox", { name: "New player" });
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toHaveProperty("disabled", true);
    await userEvent.type(name, "  ");
    expect(add).toHaveProperty("disabled", true);
    await userEvent.clear(name);
    await userEvent.type(name, "Cy");
    await userEvent.click(add);
    await waitFor(() => {
      expect(name).toHaveProperty("value", "");
    });
    expect(posts("/api/groups/g1/players")).toEqual([
      { players: [{ name: "Cy" }] },
    ]);
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["group", "g1"],
    ]);
    expect(matchRows()).toHaveLength(1);
  });

  it("shows the API's error until the name changes", async () => {
    setup("admin", {
      "POST /api/groups/g1/players": error(409, { message: "Name taken" }),
    });
    const name = await screen.findByRole("textbox", { name: "New player" });
    await userEvent.type(name, "Ann");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Name taken")).toBeTruthy();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(name, "e");
    expect(screen.queryByText("Name taken")).toBeNull();
    expect(name.getAttribute("aria-invalid")).toBe("false");
  });
});
