import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GroupData } from "@/lib/groups";

import { snapshot, user } from "../../../test/fixtures";
import {
  renderWithQuery,
  type StubHandler,
  stubApi,
} from "../../../test/render";
import { GeneralSettings } from "./general-settings";

const data = (role: string, group: Record<string, unknown> = {}) =>
  ({
    group: {
      id: "g1",
      name: "Chess club",
      description: "Tuesdays",
      scoringMode: "optional",
      allowTies: false,
      defaultRole: "recorder",
      visibility: "private",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
      ...group,
    },
    me: { role, playerId: "p1" },
  }) as unknown as GroupData;

const api = (
  patch: StubHandler<"PATCH /api/groups/g1"> = () => ({
    group: snapshot().group,
  }),
) =>
  stubApi({
    "GET /api/me": () => ({ user: user() }),
    "PATCH /api/groups/g1": patch,
  });

const save = () => screen.getByRole("button", { name: "Save settings" });
const patches = (calls: ReturnType<typeof api>) =>
  calls.filter((c) => c.method === "PATCH").map((c) => c.body);

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("GeneralSettings", { tags: ["GROUP-005"] }, () => {
  it("shows the current settings", async () => {
    api();
    renderWithQuery(
      <GeneralSettings
        data={data("admin", { teamFormat: { kind: "flexible" } })}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveProperty(
      "value",
      "Chess club",
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveProperty(
      "value",
      "Tuesdays",
    );
    expect(screen.getByText("Flexible (any teams and sizes)")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Scoring" }).textContent).toBe(
      "Scores optional",
    );
    expect(
      screen
        .getByRole("switch", { name: "Allow ties" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen.getByRole("combobox", { name: "Default role for new players" })
        .textContent,
    ).toBe("Recorder");
    expect(
      screen.getByRole("combobox", { name: "Visibility" }).textContent,
    ).toBe("Private (members only)");
    // Nothing to save yet.
    await waitFor(() => {
      expect(save()).toHaveProperty("disabled", true);
    });
  });

  it("offers every option, labelled", async () => {
    api();
    renderWithQuery(<GeneralSettings data={data("admin")} />);
    const options = async (label: string) => {
      await userEvent.click(screen.getByRole("combobox", { name: label }));
      const names = (await screen.findAllByRole("option")).map(
        (o) => o.textContent,
      );
      await userEvent.keyboard("{Escape}");
      return names;
    };
    expect(await options("Scoring")).toEqual([
      "Scores required",
      "Scores optional",
      "No scores (winner only)",
    ]);
    expect(await options("Default role for new players")).toEqual([
      "Recorder",
      "Viewer",
    ]);
    expect(await options("Visibility")).toEqual([
      "Private (members only)",
      "Public (anyone can find and view it)",
    ]);
  });

  it("saves only the changed fields, then shows Saved", async () => {
    const calls = api();
    renderWithQuery(<GeneralSettings data={data("owner")} />);
    const name = screen.getByRole("textbox", { name: "Group name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Chess society");
    await userEvent.click(screen.getByRole("switch", { name: "Allow ties" }));
    await choose("Visibility", "Public (anyone can find and view it)");
    await choose("Scoring", "Scores required");
    await choose("Default role for new players", "Viewer");
    await userEvent.click(save());
    await waitFor(() => {
      expect(patches(calls)).toEqual([
        {
          name: "Chess society",
          scoringMode: "required",
          allowTies: true,
          defaultRole: "viewer",
          visibility: "public",
        },
      ]);
    });
  });

  it("shows Saved once the refreshed group matches", async () => {
    api();
    const { rerender } = renderWithQuery(
      <GeneralSettings data={data("admin")} />,
    );
    const description = screen.getByRole("textbox", { name: "Description" });
    await userEvent.clear(description);
    await userEvent.type(description, "Thursdays");
    await userEvent.click(save());
    // The refetched snapshot carries the saved value.
    rerender(
      <GeneralSettings data={data("admin", { description: "Thursdays" })} />,
    );
    expect((await screen.findByRole("status")).textContent).toBe("Saved");
    expect(save()).toHaveProperty("disabled", true);
  });

  it("refreshes the group and the group list after saving", async () => {
    api();
    const { queryClient } = renderWithQuery(
      <GeneralSettings data={data("admin")} />,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(screen.getByRole("switch", { name: "Allow ties" }));
    await userEvent.click(save());
    await waitFor(() => {
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["group", "g1"],
        ["groups"],
      ]);
    });
  });

  it("validates before saving", async () => {
    const calls = api();
    renderWithQuery(<GeneralSettings data={data("admin")} />);
    await userEvent.clear(screen.getByRole("textbox", { name: "Group name" }));
    await userEvent.click(save());
    expect(
      screen
        .getByRole("textbox", { name: "Group name" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(patches(calls)).toEqual([]);
  });

  it("shows the API's error", async () => {
    api(() =>
      Response.json(
        { error: { code: "forbidden", message: "Not allowed" } },
        { status: 403 },
      ),
    );
    renderWithQuery(<GeneralSettings data={data("admin")} />);
    await userEvent.click(screen.getByRole("switch", { name: "Allow ties" }));
    await userEvent.click(save());
    expect(await screen.findByText("Not allowed")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is read-only for members who can't edit", { tags: ["ROLE-008"] }, () => {
    api();
    renderWithQuery(<GeneralSettings data={data("recorder")} />);
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
  });
});
