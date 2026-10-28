import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GroupData } from "@/lib/groups";

import { renderInRouter, stubApi } from "../../../test/render";
import { DangerZone } from "./danger-zone";

const player = (id: string, displayName: string, linked: boolean) => ({
  id,
  displayName,
  linked,
});

const data = (role: string, players = [player("p1", "Me", true)]) =>
  ({
    group: { id: "g1", name: "Chess club" },
    players,
    me: { role, playerId: "p1" },
  }) as unknown as GroupData;

const api = () =>
  stubApi({
    "GET /api/me": () => ({ user: { isSiteAdmin: false } }),
    "POST /api/groups/g1/transfer": () => ({}),
    "DELETE /api/groups/g1": () => ({}),
  });
const writes = (calls: ReturnType<typeof api>) =>
  calls
    .filter((c) => c.method !== "GET")
    .map((c) => [`${c.method} ${c.path}`, c.body]);

describe(
  "DangerZone",
  { tags: ["GROUP-007", "GROUP-008", "GROUP-009"] },
  () => {
    it(
      "is hidden from everyone but the owner",
      { tags: ["ROLE-008"] },
      async () => {
        const calls = api();
        renderInRouter(<DangerZone data={data("admin")} />);
        await waitFor(() => {
          expect(calls).toHaveLength(1);
        });
        expect(screen.queryByText("Danger zone")).toBeNull();
      },
    );

    it("explains transfers need another linked member", async () => {
      api();
      renderInRouter(
        <DangerZone
          data={data("owner", [
            player("p1", "Me", true),
            player("p2", "Unclaimed", false),
          ])}
        />,
      );
      expect(
        await screen.findByText(
          "To transfer ownership, another member must first join with an invite link.",
        ),
      ).toBeTruthy();
      expect(screen.queryByRole("combobox")).toBeNull();
    });

    it("transfers to a chosen linked member after confirming", async () => {
      const calls = api();
      const { queryClient } = renderInRouter(
        <DangerZone
          data={data("owner", [
            player("p1", "Me", true),
            player("p2", "Bob", true),
            player("p3", "Unclaimed", false),
            player("p4", "Cy", true),
          ])}
        />,
      );
      const transfer = await screen.findByRole("button", { name: "Transfer" });
      expect(transfer).toHaveProperty("disabled", true);
      await userEvent.click(
        screen.getByRole("combobox", { name: "Transfer ownership" }),
      );
      expect(
        (await screen.findAllByRole("option")).map((o) => o.textContent),
      ).toEqual(["Bob", "Cy"]);
      await userEvent.click(screen.getByRole("option", { name: "Cy" }));
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      await userEvent.click(transfer);
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog.textContent).toContain("Make Cy the owner?");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(writes(calls)).toEqual([]);

      await userEvent.click(transfer);
      await userEvent.click(
        await screen.findByRole("button", { name: "Transfer ownership" }),
      );
      await waitFor(() => {
        expect(writes(calls)).toEqual([
          ["POST /api/groups/g1/transfer", { playerId: "p4" }],
        ]);
      });
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["group", "g1"],
      ]);
    });

    it("deletes the group after confirming, then goes home", async () => {
      const calls = api();
      const { router, queryClient } = renderInRouter(
        <DangerZone data={data("owner")} />,
      );
      queryClient.setQueryData(["group", "g1"], { cached: true });
      queryClient.setQueryData(["group", "g2"], { cached: true });
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      await userEvent.click(
        await screen.findByRole("button", { name: "Delete group" }),
      );
      expect((await screen.findByRole("alertdialog")).textContent).toContain(
        "Delete Chess club?",
      );
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(writes(calls)).toEqual([]);

      await userEvent.click(
        screen.getByRole("button", { name: "Delete group" }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Delete permanently" }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/");
      });
      expect(writes(calls)).toEqual([["DELETE /api/groups/g1", undefined]]);
      expect(queryClient.getQueryData(["group", "g1"])).toBeUndefined();
      expect(queryClient.getQueryData(["group", "g2"])).toEqual({
        cached: true,
      });
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["groups"],
      ]);
    });
  },
);
