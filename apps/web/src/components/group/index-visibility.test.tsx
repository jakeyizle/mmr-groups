import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GroupData } from "@/lib/groups";

import { renderWithQuery, stubApi } from "../../../test/render";
import { IndexVisibility } from "./index-visibility";

const group = (hiddenFromIndex: boolean | undefined, visibility = "public") =>
  ({
    group: { id: "g1", visibility },
    hiddenFromIndex,
  }) as unknown as GroupData;

const me = (isSiteAdmin: boolean) => () => ({
  user: { id: "u1", name: "U", isSiteAdmin },
});

describe("IndexVisibility", { tags: ["VIS-013"] }, () => {
  it("renders nothing without the admin-only flag", async () => {
    const calls = stubApi({ "GET /api/me": me(true) });
    const { container } = renderWithQuery(
      <IndexVisibility data={group(undefined)} />,
    );
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(container.innerHTML).toBe("");
  });

  it("tells group admins when a site admin has hidden the group", async () => {
    stubApi({ "GET /api/me": me(false) });
    renderWithQuery(<IndexVisibility data={group(true)} />);
    const note = await screen.findByRole("note");
    expect(note.textContent).toBe(
      "A site admin has hidden this group from the public index. It can still be viewed by anyone with its link.",
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("notes a hidden private group is only viewable once public", async () => {
    stubApi({ "GET /api/me": me(false) });
    renderWithQuery(<IndexVisibility data={group(true, "private")} />);
    expect((await screen.findByRole("note")).textContent).toContain(
      "with its link once it's public.",
    );
  });

  it("shows group admins nothing while the group is listed", async () => {
    const calls = stubApi({ "GET /api/me": me(false) });
    const { container } = renderWithQuery(
      <IndexVisibility data={group(false)} />,
    );
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(container.innerHTML).toBe("");
  });

  it("lets site admins toggle the flag", async () => {
    const calls = stubApi({
      "GET /api/me": me(true),
      "PATCH /api/groups/g1": () => ({}),
    });
    renderWithQuery(<IndexVisibility data={group(false)} />);
    const toggle = await screen.findByRole("switch", {
      name: "Hide from public index",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(calls.at(-1)).toMatchObject({
        method: "PATCH",
        path: "/api/groups/g1",
        body: { hiddenFromIndex: true },
      });
    });
  });

  it("refreshes the group and the index after a change", async () => {
    stubApi({
      "GET /api/me": me(true),
      "PATCH /api/groups/g1": () => ({}),
    });
    const { queryClient } = renderWithQuery(
      <IndexVisibility data={group(false)} />,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(await screen.findByRole("switch"));
    await waitFor(() => {
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["group", "g1"],
        ["public-groups"],
      ]);
    });
  });

  it("shows a site admin's hidden group as switched on, and unhides it", async () => {
    const calls = stubApi({
      "GET /api/me": me(true),
      "PATCH /api/groups/g1": () => ({}),
    });
    renderWithQuery(<IndexVisibility data={group(true)} />);
    const toggle = await screen.findByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(calls.at(-1)?.body).toEqual({ hiddenFromIndex: false });
    });
  });

  it("shows the API error", async () => {
    stubApi({
      "GET /api/me": me(true),
      "PATCH /api/groups/g1": () =>
        Response.json(
          { error: { code: "forbidden", message: "Only site admins" } },
          { status: 403 },
        ),
    });
    renderWithQuery(<IndexVisibility data={group(false)} />);
    await userEvent.click(await screen.findByRole("switch"));
    expect(await screen.findByText("Only site admins")).toBeTruthy();
  });
});
