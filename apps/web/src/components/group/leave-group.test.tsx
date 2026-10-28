import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GroupData } from "@/lib/groups";

import { renderInRouter, stubApi } from "../../../test/render";
import { LeaveGroup } from "./leave-group";

const data = (me: { role: string } | null) =>
  ({ group: { id: "g1", name: "Chess club" }, me }) as unknown as GroupData;

describe("LeaveGroup", { tags: ["JOIN-010", "JOIN-011"] }, () => {
  it("renders nothing for non-members", async () => {
    renderInRouter(
      <>
        <LeaveGroup data={data(null)} />
        <p>Next</p>
      </>,
    );
    await waitFor(() => {
      expect(document.body.textContent).toBe("Next");
    });
  });

  it("tells the owner to transfer ownership first", async () => {
    renderInRouter(<LeaveGroup data={data({ role: "owner" })} />);
    expect(
      await screen.findByText(
        "You own this group. Transfer ownership before leaving.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave group" })).toBeNull();
  });

  it("confirms, can be cancelled, and leaves to the home page", async () => {
    const calls = stubApi({ "POST /api/groups/g1/leave": () => ({}) });
    const { router, queryClient } = renderInRouter(
      <LeaveGroup data={data({ role: "recorder" })} />,
    );
    queryClient.setQueryData(["group", "g1"], { cached: true });
    queryClient.setQueryData(["group", "g2"], { cached: true });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await userEvent.click(
      await screen.findByRole("button", { name: "Leave group" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Leave Chess club?");
    expect(dialog.textContent).toContain(
      "Your player and their matches stay in the group, unclaimed.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(calls).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Leave group" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /api/groups/g1/leave",
    ]);
    expect(queryClient.getQueryData(["group", "g1"])).toBeUndefined();
    expect(queryClient.getQueryData(["group", "g2"])).toEqual({ cached: true });
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["groups"],
    ]);
  });
});
