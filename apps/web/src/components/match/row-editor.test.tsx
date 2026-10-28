import type { MatchSettings } from "@mmr/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { BatchForm, MatchRow } from "@/lib/batch";
import type { GroupData } from "@/lib/groups";

import { MatchRowEditor } from "./row-editor";

const PLAYERS = [
  { id: "a", displayName: "Ann" },
  { id: "b", displayName: "Bob" },
  { id: "c", displayName: "Cy" },
] as GroupData["players"];

const team = (playerIds: string[], score = "", rank = "") => ({
  playerIds,
  score,
  rank,
});
const row = (...teams: ReturnType<typeof team>[]): MatchRow => ({
  playedAt: "2026-10-12T18:05",
  teams,
});
const fixed = (teams = 2, size = 1): MatchSettings["teamFormat"] => ({
  kind: "fixed",
  teams,
  size,
});
const settings = (s: Partial<MatchSettings> = {}): MatchSettings => ({
  teamFormat: fixed(),
  scoringMode: "optional",
  allowTies: false,
  ...s,
});

type Props = Partial<Parameters<typeof MatchRowEditor>[0]>;

/** Renders row `index` of a form holding `rows`; `values()` reads the form. */
function setup(rows: MatchRow[], props: Props = {}) {
  let values = (): BatchForm => ({ rows: [] });
  function Harness() {
    const form = useForm<BatchForm>({ defaultValues: { rows } });
    values = () => form.getValues();
    return (
      <MatchRowEditor
        index={0}
        form={form}
        players={PLAYERS}
        settings={settings()}
        issues={undefined}
        {...props}
      />
    );
  }
  render(<Harness />);
  return { values: () => values() };
}

const match = (n = 1) =>
  screen.getByRole("group", { name: `Match ${String(n)}` });
const slot = (t: number, s = 1) =>
  screen.getByRole<HTMLSelectElement>("combobox", {
    name: `Match 1 team ${String(t)} player ${String(s)}`,
  });
const button = (name: string) => screen.queryByRole("button", { name });
const nth = (name: string, i: number) => {
  const el = screen.getAllByRole("button", { name }).at(i);
  if (!el) throw new Error(`no button ${name} #${String(i)}`);
  return el;
};

describe("MatchRowEditor", { tags: ["MATCH-001", "MATCH-007"] }, () => {
  it("labels the row by its position, and renders nothing past the end", () => {
    setup([row(team([""]), team([""])), row(team([""]), team([""]))], {
      index: 1,
    });
    expect(match(2)).toBeTruthy();
    expect(within(match(2)).getByText("Match 2").tagName).toBe("LEGEND");
    expect(screen.getByLabelText("Match 2 date and time")).toHaveProperty(
      "value",
      "2026-10-12T18:05",
    );
  });

  it("renders nothing for a missing row", () => {
    setup([], { index: 0 });
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("edits the date and time", () => {
    const { values } = setup([row(team([""]), team([""]))]);
    fireEvent.change(screen.getByLabelText("Match 1 date and time"), {
      target: { value: "2026-10-13T09:30" },
    });
    expect(values().rows[0]?.playedAt).toBe("2026-10-13T09:30");
  });

  it("offers duplicate and remove only when given", async () => {
    const onRemove = vi.fn();
    const onDuplicate = vi.fn();
    setup([row(team([""]), team([""]))], {
      onDuplicate,
      onRemove,
      canRemove: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("hides remove when the row can't be removed", () => {
    setup([row(team([""]), team([""]))], { onRemove: vi.fn() });
    expect(button("Remove")).toBeNull();
    expect(button("Duplicate")).toBeNull();
  });

  it("picks players, each only once per match", { tags: ["MATCH-009"] }, () => {
    const { values } = setup([row(team(["", ""]), team(["", ""]))], {
      settings: settings({ teamFormat: fixed(2, 2) }),
    });
    const first = slot(1, 1);
    expect([...first.options].map((o) => o.textContent)).toEqual([
      "Player…",
      "Ann",
      "Bob",
      "Cy",
    ]);
    expect(
      within(match()).getByText("Team 1", { selector: "span" }),
    ).toBeTruthy();
    expect(
      within(match()).getByText("Team 2", { selector: "span" }),
    ).toBeTruthy();
    fireEvent.change(first, { target: { value: "a" } });
    expect(values().rows[0]?.teams[0]?.playerIds).toEqual(["a", ""]);
    const disabled = (s: HTMLSelectElement) =>
      [...s.options].filter((o) => o.disabled).map((o) => o.value);
    expect(disabled(slot(1, 1))).toEqual([]);
    expect(disabled(slot(1, 2))).toEqual(["a"]);
    expect(disabled(slot(2, 1))).toEqual(["a"]);
    // Fixed formats can't change shape.
    expect(button("+ Player")).toBeNull();
    expect(button("+ Team")).toBeNull();
    expect(button("Remove team")).toBeNull();
  });

  it("enters scores", { tags: ["MATCH-017"] }, async () => {
    const { values } = setup([row(team(["a"]), team(["b"]))]);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Match 1 team 2 score" }),
      "7",
    );
    expect(values().rows[0]?.teams[1]?.score).toBe("7");
  });

  it(
    "has no score inputs when the group records none",
    { tags: ["MATCH-018"] },
    () => {
      setup([row(team(["a"]), team(["b"]))], {
        settings: settings({ scoringMode: "none" }),
      });
      expect(screen.queryByRole("textbox", { name: /score/ })).toBeNull();
    },
  );

  it("shows the API's or form's issues", () => {
    setup([row(team([""]), team([""]))], { issues: ["Pick players", "Bad"] });
    expect(
      within(screen.getByRole("alert"))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Pick players", "Bad"]);
  });
});

describe("flexible teams", { tags: ["MATCH-008"] }, () => {
  const flexible = settings({ teamFormat: { kind: "flexible" } });

  it("adds and removes players and teams", async () => {
    const { values } = setup([row(team([""]), team([""]))], {
      settings: flexible,
    });
    const teams = () => values().rows[0]?.teams.map((t) => t.playerIds.length);
    expect(button("− Player")).toBeNull();
    expect(button("Remove team")).toBeNull();
    await userEvent.click(nth("+ Player", 0));
    expect(values().rows[0]?.teams[0]?.playerIds).toEqual(["", ""]);
    expect(teams()).toEqual([2, 1]);
    expect(screen.getAllByRole("button", { name: "− Player" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "+ Team" }));
    expect(teams()).toEqual([2, 1, 1]);
    expect(values().rows[0]?.teams[2]).toEqual(team([""]));
    await userEvent.click(screen.getByRole("button", { name: "− Player" }));
    expect(teams()).toEqual([1, 1, 1]);
    const removes = screen.getAllByRole("button", { name: "Remove team" });
    expect(removes).toHaveLength(3);
    await userEvent.click(nth("Remove team", 1));
    expect(teams()).toEqual([1, 1]);
    expect(button("Remove team")).toBeNull();
  });

  it("removes a team's last player", async () => {
    const { values } = setup([row(team(["a", "b", "c"]), team(["c"]))], {
      settings: flexible,
    });
    await userEvent.click(screen.getByRole("button", { name: "− Player" }));
    expect(values().rows[0]?.teams[0]?.playerIds).toEqual(["a", "b"]);
  });

  it("removes the chosen team", async () => {
    const { values } = setup([row(team(["a"]), team(["b"]), team(["c"]))], {
      settings: flexible,
    });
    await userEvent.click(nth("Remove team", 1));
    expect(values().rows[0]?.teams.map((t) => t.playerIds)).toEqual([
      ["a"],
      ["c"],
    ]);
  });

  it("stops at 8 players a team and 8 teams", () => {
    const eight = Array.from({ length: 8 }, () => "");
    setup([row(...Array.from({ length: 8 }, () => team(eight)))], {
      settings: flexible,
    });
    expect(button("+ Player")).toBeNull();
    expect(button("+ Team")).toBeNull();
  });

  it("allows a seventh player and team", () => {
    const seven = Array.from({ length: 7 }, () => "");
    setup([row(...Array.from({ length: 7 }, () => team(seven)))], {
      settings: flexible,
    });
    expect(screen.getAllByRole("button", { name: "+ Player" })).toHaveLength(7);
    expect(button("+ Team")).toBeTruthy();
  });
});

describe("placement", { tags: ["MATCH-012", "MATCH-019"] }, () => {
  const radios = () =>
    within(screen.getByRole("radiogroup", { name: "Match 1 winner" }))
      .getAllByRole("radio")
      .map((r) => [r.textContent, r.getAttribute("aria-checked")]);

  it("picks the winner of two unscored teams", async () => {
    const { values } = setup([row(team(["a"]), team(["b"]))]);
    expect(radios()).toEqual([
      ["Team 1", "false"],
      ["Team 2", "false"],
    ]);
    await userEvent.click(screen.getByRole("radio", { name: "Team 2" }));
    expect(values().rows[0]?.teams.map((t) => t.rank)).toEqual(["2", "1"]);
    expect(radios()).toEqual([
      ["Team 1", "false"],
      ["Team 2", "true"],
    ]);
    await userEvent.click(screen.getByRole("radio", { name: "Team 1" }));
    expect(values().rows[0]?.teams.map((t) => t.rank)).toEqual(["1", "2"]);
    expect(radios()).toEqual([
      ["Team 1", "true"],
      ["Team 2", "false"],
    ]);
    expect(
      screen.getAllByRole("radio").map((r) => r.getAttribute("data-variant")),
    ).toEqual(["default", "outline"]);
  });

  it("offers a tie when allowed", async () => {
    const { values } = setup([row(team(["a"]), team(["b"]))], {
      settings: settings({ allowTies: true }),
    });
    await userEvent.click(screen.getByRole("radio", { name: "Tie" }));
    expect(values().rows[0]?.teams.map((t) => t.rank)).toEqual(["1", "1"]);
    expect(radios()[2]).toEqual(["Tie", "true"]);
  });

  it("isn't needed once scores are entered, or when they're required", () => {
    setup([row(team(["a"], "3"), team(["b"]))]);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("isn't asked for when scores are required", () => {
    setup([row(team(["a"]), team(["b"]))], {
      settings: settings({ scoringMode: "required" }),
    });
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("picks a place for each of three or more teams", () => {
    const { values } = setup([row(team(["a"]), team(["b"]), team(["c"]))], {
      settings: settings({ teamFormat: fixed(3) }),
    });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    const place = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "Match 1 team 3 place",
    });
    expect([...place.options].map((o) => [o.value, o.textContent])).toEqual([
      ["", "Place…"],
      ["1", "1st"],
      ["2", "2nd"],
      ["3", "3rd"],
    ]);
    fireEvent.change(place, { target: { value: "2" } });
    expect(values().rows[0]?.teams[2]?.rank).toBe("2");
  });

  it("labels fourth place and beyond", () => {
    setup([row(team(["a"]), team(["b"]), team(["c"]), team([""]))], {
      settings: settings({ teamFormat: fixed(4) }),
    });
    const place = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "Match 1 team 1 place",
    });
    expect(place.options[4]?.textContent).toBe("4th");
  });

  it("has no place selects for two teams", () => {
    setup([row(team(["a"]), team(["b"]))]);
    expect(screen.queryByRole("combobox", { name: /place/ })).toBeNull();
  });
});

describe("win probability", { tags: ["MATCH-016"] }, () => {
  it("shows each team's chance once every slot has a different player", () => {
    const predict = vi.fn(() => [0.625, 0.375]);
    setup([row(team(["a"]), team(["b"]))], { predict });
    expect(predict).toHaveBeenCalledWith([["a"], ["b"]]);
    expect(screen.getByText("63% to win")).toBeTruthy();
    expect(screen.getByText("38% to win")).toBeTruthy();
  });

  it("waits for empty slots to be filled", () => {
    const predict = vi.fn(() => [0.5, 0.5]);
    setup([row(team(["a"]), team([""]))], { predict });
    expect(predict).not.toHaveBeenCalled();
    expect(screen.queryByText(/to win/)).toBeNull();
  });

  it("skips matches with a repeated player", () => {
    const predict = vi.fn(() => [0.5, 0.5]);
    setup([row(team(["a"]), team(["a"]))], { predict });
    expect(predict).not.toHaveBeenCalled();
  });

  it("shows nothing for teams without a prediction", () => {
    setup([row(team(["a"]), team(["b"]))], { predict: () => [0.5] });
    expect(screen.getAllByText(/to win/)).toHaveLength(1);
  });
});
