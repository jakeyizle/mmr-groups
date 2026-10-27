import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { snapshot } from "../../../test/fixtures";
import { renderRoute, stubApi } from "../../../test/render";

function open(
  create: (body: unknown) => unknown = () => ({ id: "g9", playerId: "p1" }),
  user: object | null = { id: "u1", name: "Ann" },
) {
  const calls = stubApi({
    "GET /api/me": () => ({ user }),
    "POST /api/groups": create,
    "GET /api/groups/g9": () => snapshot({ group: { id: "g9" } }),
  });
  const created = () =>
    calls.filter((c) => c.method === "POST").map((c) => c.body);
  return { created, ...renderRoute("/groups/new") };
}

const text = (name: string) => screen.getByRole("textbox", { name });
const number = (name: string) => screen.getByRole("spinbutton", { name });
const create = () => screen.getByRole("button", { name: "Create group" });

async function fillNames() {
  await userEvent.type(
    await screen.findByRole("textbox", { name: "Group name" }),
    "Padel",
  );
  await userEvent.type(text("Your player name"), "Ann");
}

describe("new group", { tags: ["GROUP-001", "GROUP-002", "GROUP-003"] }, () => {
  it("creates a fixed-format group with the defaults", async () => {
    const { created, router, queryClient } = open();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await fillNames();
    expect(number("Teams")).toHaveProperty("value", "2");
    expect(number("Players per team")).toHaveProperty("value", "2");
    expect(screen.getByRole("combobox", { name: "Scoring" }).textContent).toBe(
      "Scores optional",
    );
    expect(
      screen.getByRole("combobox", { name: "Default role for new players" })
        .textContent,
    ).toBe("Recorder");
    expect(
      screen.getByRole("combobox", { name: "Visibility" }).textContent,
    ).toBe("Private (members only)");
    await userEvent.click(create());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/g/g9");
    });
    expect(created()).toEqual([
      {
        name: "Padel",
        description: "",
        playerName: "Ann",
        scoringMode: "optional",
        allowTies: false,
        defaultRole: "recorder",
        visibility: "private",
        teamFormat: { kind: "fixed", teams: 2, size: 2 },
      },
    ]);
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual([
      "groups",
    ]);
  });

  it("creates flexible groups and other settings", async () => {
    const { created } = open();
    await fillNames();
    await userEvent.click(
      screen.getByRole("radio", {
        name: "Flexible (any number of teams, any sizes)",
      }),
    );
    expect(screen.queryByRole("spinbutton", { name: "Teams" })).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: "Allow ties" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Visibility" }));
    await userEvent.click(
      await screen.findByRole("option", {
        name: "Public (anyone can find and view it)",
      }),
    );
    await userEvent.click(create());
    await waitFor(() => {
      expect(created()).toEqual([
        expect.objectContaining({
          allowTies: true,
          visibility: "public",
          teamFormat: { kind: "flexible" },
        }),
      ]);
    });
  });

  it("sets team count and size for fixed formats", async () => {
    const { created } = open();
    await fillNames();
    await userEvent.clear(number("Teams"));
    await userEvent.type(number("Teams"), "4");
    await userEvent.clear(number("Players per team"));
    await userEvent.type(number("Players per team"), "1");
    await userEvent.click(create());
    await waitFor(() => {
      expect(created()).toEqual([
        expect.objectContaining({
          teamFormat: { kind: "fixed", teams: 4, size: 1 },
        }),
      ]);
    });
  });

  it(
    "validates names and team sizes before creating",
    { tags: ["GROUP-012"] },
    async () => {
      const { created } = open();
      await screen.findByRole("textbox", { name: "Group name" });
      await userEvent.clear(number("Teams"));
      await userEvent.type(number("Teams"), "9");
      await userEvent.clear(number("Players per team"));
      await userEvent.click(create());
      for (const field of [
        text("Group name"),
        text("Your player name"),
        number("Teams"),
        number("Players per team"),
      ])
        expect(field.getAttribute("aria-invalid")).toBe("true");
      // A cleared number field shows empty, not NaN.
      expect(number("Players per team")).toHaveProperty("value", "");
      expect(created()).toEqual([]);
    },
  );

  it("shows the API's error", async () => {
    open(() =>
      Response.json(
        { error: { code: "bad", message: "Too many groups" } },
        { status: 400 },
      ),
    );
    await fillNames();
    await userEvent.click(create());
    expect(await screen.findByText("Too many groups")).toBeTruthy();
  });

  it("needs a signed-in user", { tags: ["AUTH-005"] }, async () => {
    const { router } = open(undefined, null);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
  });
});
