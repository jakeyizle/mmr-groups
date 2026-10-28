import { generateTeams, replay, resolveRatingConfig } from "@mmr/core";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type BatchForm, nextMinute, toLocalInput } from "@/lib/batch";
import type { GroupData } from "@/lib/groups";

import { match, snapshot } from "../../../../test/fixtures";
import { renderRoute, stubApi } from "../../../../test/render";

const KEY = "mmr:attendees:g1";
const config = resolveRatingConfig(undefined);
const ROSTER = "abcde".split("").map((id) => ({
  id,
  displayName: id.toUpperCase(),
  role: "recorder" as const,
  linked: true,
}));
const MATCHES = [
  match("m1", 0, [
    [["a"], 1],
    [["b"], 2],
  ]),
  match("m2", 1, [
    [["a"], 1],
    [["c"], 2],
  ]),
];

function open(data: GroupData) {
  stubApi({
    "GET /api/me": () => ({ user: { id: "u1", name: "Ann" } }),
    "GET /api/groups/g1": () => data,
  });
  return renderRoute("/g/g1/teams");
}
const singles = (role = "recorder", group = {}) =>
  snapshot({
    role,
    players: ROSTER,
    matches: MATCHES,
    group: { teamFormat: { kind: "fixed", teams: 2, size: 1 }, ...group },
  });

const box = (name: string) => screen.getByRole("checkbox", { name });
const generate = () =>
  screen.getByRole("button", { name: /^(Generate teams|Regenerate)$/ });
const suggestion = () =>
  within(screen.getByRole("region", { name: "Suggestion" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
const expected = (
  ids: string[],
  opts: {
    skip?: number;
    counts?: Map<string, number>;
    teams?: number;
    size?: number;
  } = {},
) => {
  const s = generateTeams({
    playerIds: ids,
    ratings: replay(MATCHES, config, new Date().toISOString()).players,
    config,
    format: { teams: opts.teams ?? 2, size: opts.size ?? 1 },
    sitOutCounts: opts.counts ?? new Map(),
    skip: opts.skip ?? 0,
  });
  if ("needed" in s) throw new Error("not enough players");
  return s;
};
const lines = (s: ReturnType<typeof expected>) =>
  s.matches.flatMap((m) =>
    m.teams.map(
      (t, i) =>
        `${t.map((id) => id.toUpperCase()).join(" & ")}${String(Math.round((m.probabilities[i] ?? 0) * 100))}%`,
    ),
  );

afterEach(() => {
  localStorage.clear();
});

describe("attendees", { tags: ["TEAMS-001"] }, () => {
  it("selects players, everyone or no one, and remembers the choice", async () => {
    open(singles());
    expect(
      await screen.findByRole("heading", { name: "Who's playing? (0)" }),
    ).toBeTruthy();
    await userEvent.click(box("A"));
    await userEvent.click(box("C"));
    expect(
      screen.getByRole("heading", { name: "Who's playing? (2)" }),
    ).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY) ?? "[]")).toEqual(["a", "c"]);
    await userEvent.click(box("A"));
    expect(JSON.parse(localStorage.getItem(KEY) ?? "[]")).toEqual(["c"]);

    await userEvent.click(screen.getByRole("button", { name: "Everyone" }));
    expect(
      ROSTER.every((p) => (box(p.displayName) as HTMLInputElement).checked),
    ).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(
      screen.getByRole("heading", { name: "Who's playing? (0)" }),
    ).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe("[]");
  });

  it("restores remembered attendees who are still in the group", async () => {
    localStorage.setItem(KEY, JSON.stringify(["b", "gone", 5, "d"]));
    open(singles());
    await screen.findByRole("heading", { name: "Who's playing? (2)" });
    expect((box("B") as HTMLInputElement).checked).toBe(true);
    expect((box("D") as HTMLInputElement).checked).toBe(true);
  });

  it("ignores unreadable or unusable storage", async () => {
    localStorage.setItem(KEY, "{oops");
    open(singles());
    await screen.findByRole("heading", { name: "Who's playing? (0)" });
    cleanup();
    localStorage.setItem(KEY, JSON.stringify("abcde"));
    open(singles());
    await screen.findByRole("heading", { name: "Who's playing? (0)" });
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    await userEvent.click(box("A"));
    expect(
      screen.getByRole("heading", { name: "Who's playing? (1)" }),
    ).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe(
  "suggestions",
  { tags: ["TEAMS-001", "TEAMS-003", "TEAMS-004", "TEAMS-006"] },
  () => {
    it("asks for more players when there aren't enough", async () => {
      open(singles());
      await userEvent.click(
        await screen.findByRole("button", { name: "Generate teams" }),
      );
      expect(screen.getByRole("alert").textContent).toBe(
        "Select 2 more players for a match of 2 teams of 1.",
      );
      await userEvent.click(box("A"));
      expect(screen.queryByRole("alert")).toBeNull();
      await userEvent.click(generate());
      expect(screen.getByRole("alert").textContent).toBe(
        "Select 1 more player for a match of 2 teams of 1.",
      );
      expect(generate().textContent).toBe("Generate teams");
      await userEvent.click(generate());
      expect(screen.getByRole("alert").textContent).toBe(
        "Select 1 more player for a match of 2 teams of 1.",
      );
    });

    it("suggests balanced teams with win chances, and the next best on regenerate", async () => {
      localStorage.setItem(KEY, JSON.stringify(["a", "b", "c", "d"]));
      open(singles());
      await userEvent.click(
        await screen.findByRole("button", { name: "Generate teams" }),
      );
      const ids = ["a", "b", "c", "d"];
      expect(suggestion()).toEqual(lines(expected(ids)));
      expect(screen.getByText("Match 1")).toBeTruthy();
      expect(screen.getByText("Match 2")).toBeTruthy();
      expect(screen.queryByText(/Sitting out/)).toBeNull();
      expect(generate().textContent).toBe("Regenerate");
      await userEvent.click(generate());
      expect(suggestion()).toEqual(lines(expected(ids, { skip: 1 })));
      expect(lines(expected(ids, { skip: 1 }))).not.toEqual(
        lines(expected(ids)),
      );
    });

    it("rotates who sits out", async () => {
      localStorage.setItem(KEY, JSON.stringify(["a", "b", "c"]));
      open(singles());
      await userEvent.click(
        await screen.findByRole("button", { name: "Generate teams" }),
      );
      const first = expected(["a", "b", "c"]);
      expect(screen.getByText(/^Sitting out:/).textContent).toBe(
        `Sitting out: ${first.sittingOut.map((id) => id.toUpperCase()).join(", ")}`,
      );
      await userEvent.click(generate());
      const counts = new Map(first.sittingOut.map((id) => [id, 1]));
      const second = expected(["a", "b", "c"], { counts });
      expect(second.sittingOut).not.toEqual(first.sittingOut);
      expect(screen.getByText(/^Sitting out:/).textContent).toBe(
        `Sitting out: ${second.sittingOut.map((id) => id.toUpperCase()).join(", ")}`,
      );
      await userEvent.click(generate());
      for (const id of second.sittingOut)
        counts.set(id, (counts.get(id) ?? 0) + 1);
      expect(screen.getByText(/^Sitting out:/).textContent).toBe(
        `Sitting out: ${expected(["a", "b", "c"], { counts })
          .sittingOut.map((id) => id.toUpperCase())
          .join(", ")}`,
      );
    });

    it("starts over when the attendees change", async () => {
      localStorage.setItem(KEY, JSON.stringify(["a", "b"]));
      open(singles());
      await userEvent.click(
        await screen.findByRole("button", { name: "Generate teams" }),
      );
      expect(screen.getByRole("region", { name: "Suggestion" })).toBeTruthy();
      await userEvent.click(box("C"));
      expect(screen.queryByRole("region", { name: "Suggestion" })).toBeNull();
      expect(generate().textContent).toBe("Generate teams");
    });
  },
);

describe("recording a suggestion", () => {
  it("prefills the batch form, a minute apart, and opens it", async () => {
    localStorage.setItem(KEY, JSON.stringify(["a", "b", "c", "d"]));
    const { router } = open(
      singles("recorder", { teamFormat: { kind: "fixed", teams: 2, size: 1 } }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Generate teams" }),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 4, 1, 10, 0, 30));
    await userEvent.click(screen.getByRole("button", { name: "Record these" }));
    vi.useRealTimers();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/g/g1/matches/new");
    });
    const draft = JSON.parse(
      localStorage.getItem("mmr:draft:g1") ?? "{}",
    ) as BatchForm;
    const s = expected(["a", "b", "c", "d"]);
    expect(draft.rows.map((r) => r.teams)).toEqual(
      s.matches.map((m) =>
        m.teams.map((t) => ({ playerIds: t, score: "", rank: "" })),
      ),
    );
    expect(draft.rows).toHaveLength(2);
    const [one, two] = draft.rows;
    expect(one?.playedAt).toBe(toLocalInput(new Date(2026, 4, 1, 10, 0)));
    expect(two?.playedAt).toBe(nextMinute(one?.playedAt ?? ""));
  });

  it("isn't offered to viewers", { tags: ["ROLE-008"] }, async () => {
    localStorage.setItem(KEY, JSON.stringify(["a", "b"]));
    open(singles("viewer"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Generate teams" }),
    );
    expect(screen.getByRole("region", { name: "Suggestion" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record these" })).toBeNull();
  });
});

describe("flexible groups", { tags: ["TEAMS-007"] }, () => {
  const flexible = () =>
    singles("recorder", { teamFormat: { kind: "flexible" } });
  const select = (name: string) =>
    within(
      screen.getByRole("region", { name: "Format" }),
    ).getByRole<HTMLSelectElement>("combobox", { name });

  it("picks the shape, defaulting to 2 teams of 2", async () => {
    localStorage.setItem(KEY, JSON.stringify(["a", "b", "c", "d", "e"]));
    open(flexible());
    await screen.findByRole("region", { name: "Format" });
    expect(select("Teams per match").value).toBe("2");
    expect(select("Players per team").value).toBe("2");
    expect([...select("Teams per match").options].map((o) => o.value)).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    expect([...select("Players per team").options].map((o) => o.value)).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8"],
    );
    await userEvent.click(generate());
    expect(suggestion()).toEqual(
      lines(expected(["a", "b", "c", "d", "e"], { teams: 2, size: 2 })),
    );
    fireEvent.change(select("Teams per match"), { target: { value: "3" } });
    // The shape changed: generate again.
    expect(screen.queryByRole("region", { name: "Suggestion" })).toBeNull();
    fireEvent.change(select("Players per team"), { target: { value: "1" } });
    await userEvent.click(generate());
    expect(suggestion()).toEqual(
      lines(expected(["a", "b", "c", "d", "e"], { teams: 3, size: 1 })),
    );
    expect(screen.getByText(/^Sitting out:/).textContent).toBe(
      `Sitting out: ${expected(["a", "b", "c", "d", "e"], { teams: 3, size: 1 })
        .sittingOut.map((id) => id.toUpperCase())
        .join(", ")}`,
    );
    expect(screen.getByRole("button", { name: "Record these" })).toBeTruthy();
  });

  it("shows no format choice for fixed groups", async () => {
    open(singles());
    await screen.findByRole("heading", { name: /Who's playing/ });
    expect(screen.queryByRole("region", { name: "Format" })).toBeNull();
  });
});
