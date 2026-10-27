import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GroupData } from "@/lib/groups";

import { renderWithQuery, stubApi } from "../../../test/render";
import { PlayersSettings } from "./players-settings";

interface P {
  id: string;
  displayName: string;
  role?: string;
  linked?: boolean;
}
const p = (id: string, displayName: string, role?: string, linked?: boolean) =>
  ({ id, displayName, role, linked }) as P;

const ROSTER = [
  p("p1", "Olive", "owner", true),
  p("p2", "Adam", "admin", true),
  p("p3", "Rita", "recorder", true),
  p("p4", "Vic", "viewer", false),
];

const data = (role: string | null, players: P[] = ROSTER) =>
  ({
    group: { id: "g1" },
    players,
    me: role ? { role, playerId: "p1" } : null,
  }) as unknown as GroupData;

const error = (message: string) => () =>
  Response.json({ error: { code: "bad", message } }, { status: 400 });

function api(overrides: Record<string, (body: unknown) => unknown> = {}) {
  return stubApi({
    "GET /api/me": () => ({ user: { isSiteAdmin: false } }),
    "POST /api/groups/g1/players": () => ({ players: [] }),
    ...overrides,
  });
}
const writes = (calls: ReturnType<typeof api>) =>
  calls
    .filter((c) => c.method !== "GET")
    .map((c) => [`${c.method} ${c.path}`, c.body]);

const row = (name: string) =>
  screen.getByText(name, { selector: "p" }).closest("li") as HTMLElement;
const edit = (name: string) =>
  userEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));

describe("player list", { tags: ["PLAYER-001", "ROLE-008"] }, () => {
  it("shows names, roles and claimed status to admins", async () => {
    api();
    renderWithQuery(<PlayersSettings data={data("admin")} />);
    await screen.findByRole("textbox", { name: "Add players" });
    expect(
      screen
        .getAllByRole("listitem")
        .map((li) =>
          [...li.querySelectorAll("p, [data-slot=badge]")].map(
            (e) => e.textContent,
          ),
        ),
    ).toEqual([
      ["Olive", "Claimed", "Owner"],
      ["Adam", "Claimed", "Admin"],
      ["Rita", "Claimed", "Recorder"],
      ["Vic", "Unclaimed", "Viewer"],
    ]);
  });

  it("shows just names to members, with nothing to edit", async () => {
    const calls = api();
    renderWithQuery(
      <PlayersSettings data={data("recorder", [p("p1", "Olive")])} />,
    );
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(screen.getByRole("listitem").textContent).toBe("Olive");
    expect(screen.queryByRole("textbox", { name: "Add players" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });
});

describe("adding players", { tags: ["PLAYER-001", "PLAYER-002"] }, () => {
  it("adds one name per line or comma", async () => {
    const calls = api();
    const { queryClient } = renderWithQuery(
      <PlayersSettings data={data("admin")} />,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const box = await screen.findByRole("textbox", { name: "Add players" });
    expect(screen.getByRole("button", { name: "Add player" })).toHaveProperty(
      "disabled",
      true,
    );
    await userEvent.type(box, "Dave");
    expect(screen.getByRole("button", { name: "Add player" })).toHaveProperty(
      "disabled",
      false,
    );
    await userEvent.type(box, ", Sue{Enter}{Enter} Al ,");
    await userEvent.click(
      screen.getByRole("button", { name: "Add 3 players" }),
    );
    await waitFor(() => {
      expect(writes(calls)).toEqual([
        [
          "POST /api/groups/g1/players",
          { players: [{ name: "Dave" }, { name: "Sue" }, { name: "Al" }] },
        ],
      ]);
    });
    await waitFor(() => {
      expect(box).toHaveProperty("value", "");
    });
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["group", "g1"],
    ]);
  });

  it("shows the API's error until the text changes", async () => {
    api({ "POST /api/groups/g1/players": error("Name taken") });
    renderWithQuery(<PlayersSettings data={data("admin")} />);
    const box = await screen.findByRole("textbox", { name: "Add players" });
    await userEvent.type(box, "Olive");
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    expect(await screen.findByText("Name taken")).toBeTruthy();
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box).toHaveProperty("value", "Olive");
    await userEvent.type(box, "x");
    expect(screen.queryByText("Name taken")).toBeNull();
    expect(box.getAttribute("aria-invalid")).toBe("false");
  });
});

describe(
  "editing players",
  { tags: ["PLAYER-003", "PLAYER-005", "ROLE-005"] },
  () => {
    it("toggles the editor", async () => {
      api();
      renderWithQuery(<PlayersSettings data={data("owner")} />);
      const button = await screen.findByRole("button", { name: "Edit Rita" });
      expect(button.textContent).toBe("Edit");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      await userEvent.click(button);
      expect(button.textContent).toBe("Done");
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(
        within(row("Rita")).getByRole("textbox", { name: "Name" }),
      ).toBeTruthy();
      await userEvent.click(button);
      expect(within(row("Rita")).queryByRole("textbox")).toBeNull();
    });

    it("renames once the name changes", async () => {
      const calls = api({ "PATCH /api/groups/g1/players/p3": () => ({}) });
      const { queryClient } = renderWithQuery(
        <PlayersSettings data={data("admin")} />,
      );
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      await edit("Rita");
      const rename = screen.getByRole("button", { name: "Rename" });
      const name = screen.getByRole("textbox", { name: "Name" });
      expect(rename).toHaveProperty("disabled", true);
      await userEvent.type(name, " ");
      expect(rename).toHaveProperty("disabled", true);
      await userEvent.clear(name);
      await userEvent.type(name, "Rhea");
      await userEvent.click(rename);
      await waitFor(() => {
        expect(writes(calls)).toEqual([
          ["PATCH /api/groups/g1/players/p3", { displayName: "Rhea" }],
        ]);
      });
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["group", "g1"],
      ]);
    });

    it("shows rename errors until the name changes", async () => {
      api({ "PATCH /api/groups/g1/players/p3": error("Too long") });
      renderWithQuery(<PlayersSettings data={data("admin")} />);
      await edit("Rita");
      const name = screen.getByRole("textbox", { name: "Name" });
      await userEvent.type(name, "!");
      await userEvent.click(screen.getByRole("button", { name: "Rename" }));
      expect(await screen.findByText("Too long")).toBeTruthy();
      expect(name.getAttribute("aria-invalid")).toBe("true");
      await userEvent.type(name, "!");
      expect(screen.queryByText("Too long")).toBeNull();
    });

    it("lets the owner make claimed players admins", async () => {
      const calls = api({ "PATCH /api/groups/g1/players/p3": () => ({}) });
      renderWithQuery(<PlayersSettings data={data("owner")} />);
      await edit("Rita");
      const role = screen.getByRole("combobox", { name: "Role" });
      expect(role.textContent).toBe("Recorder");
      await userEvent.click(role);
      expect(
        (await screen.findAllByRole("option")).map((o) => o.textContent),
      ).toEqual(["Admin", "Recorder", "Viewer"]);
      await userEvent.click(screen.getByRole("option", { name: "Admin" }));
      await waitFor(() => {
        expect(writes(calls)).toEqual([
          ["PATCH /api/groups/g1/players/p3", { role: "admin" }],
        ]);
      });
      expect(screen.queryByText(/Whoever claims this player/)).toBeNull();
    });

    it("keeps unclaimed players out of admin, and says why", async () => {
      api();
      renderWithQuery(<PlayersSettings data={data("owner")} />);
      await edit("Vic");
      await userEvent.click(screen.getByRole("combobox", { name: "Role" }));
      expect(
        (await screen.findAllByRole("option")).map((o) => o.textContent),
      ).toEqual(["Recorder", "Viewer"]);
      expect(
        screen.getByText(
          "Whoever claims this player gets this role. Only claimed players can be admins.",
        ),
      ).toBeTruthy();
    });

    it("gives admins no role choice for admins", async () => {
      api();
      renderWithQuery(<PlayersSettings data={data("admin")} />);
      await edit("Adam");
      expect(screen.queryByRole("combobox", { name: "Role" })).toBeNull();
      // Renaming is still allowed; removing a claimed admin is not.
      expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Unlink account" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Remove player" }),
      ).toBeNull();
    });

    it("never offers role changes or removal for the owner", async () => {
      api();
      renderWithQuery(<PlayersSettings data={data("owner")} />);
      await edit("Olive");
      expect(screen.queryByRole("combobox", { name: "Role" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Unlink account" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Remove player" }),
      ).toBeNull();
    });
  },
);

describe(
  "unlinking and removing",
  { tags: ["PLAYER-006", "PLAYER-008"] },
  () => {
    it("unlinks and removes claimed players", async () => {
      const calls = api({
        "POST /api/groups/g1/players/p3/unlink": () => ({}),
        "DELETE /api/groups/g1/players/p3": () => ({}),
      });
      const { queryClient } = renderWithQuery(
        <PlayersSettings data={data("admin")} />,
      );
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      await edit("Rita");
      await userEvent.click(
        screen.getByRole("button", { name: "Unlink account" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Remove player" }),
      );
      await waitFor(() => {
        expect(writes(calls)).toEqual([
          ["POST /api/groups/g1/players/p3/unlink", undefined],
          ["DELETE /api/groups/g1/players/p3", undefined],
        ]);
      });
      await waitFor(() => {
        expect(invalidate).toHaveBeenCalledTimes(2);
      });
    });

    it("removes unclaimed players, with nothing to unlink", async () => {
      api();
      renderWithQuery(<PlayersSettings data={data("admin")} />);
      await edit("Vic");
      expect(
        screen.queryByRole("button", { name: "Unlink account" }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Remove player" }),
      ).toBeTruthy();
    });

    it("shows remove and unlink errors", async () => {
      api({
        "DELETE /api/groups/g1/players/p4": error("Has matches"),
        "POST /api/groups/g1/players/p3/unlink": error("Not linked"),
      });
      renderWithQuery(<PlayersSettings data={data("admin")} />);
      await edit("Vic");
      await userEvent.click(
        screen.getByRole("button", { name: "Remove player" }),
      );
      expect(await screen.findByText("Has matches")).toBeTruthy();
      await edit("Rita");
      await userEvent.click(
        screen.getByRole("button", { name: "Unlink account" }),
      );
      expect(await screen.findByText("Not linked")).toBeTruthy();
    });

    it("lets the owner unlink an admin", async () => {
      api();
      renderWithQuery(<PlayersSettings data={data("owner")} />);
      await edit("Adam");
      expect(
        screen.getByRole("button", { name: "Unlink account" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Remove player" }),
      ).toBeTruthy();
    });
  },
);
