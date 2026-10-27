import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GroupData } from "@/lib/groups";

import { snapshot } from "../../../../test/fixtures";
import { renderRoute, stubApi } from "../../../../test/render";

function open(
  data: GroupData,
  user: object | null = { id: "u1", name: "Ann" },
) {
  stubApi({
    "GET /api/me": () => ({ user }),
    "GET /api/groups/g1": () => data,
  });
  return renderRoute("/g/g1/settings");
}
const headings = () =>
  screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe(
  "settings page",
  { tags: ["GROUP-005", "JOIN-001", "ROLE-008"] },
  () => {
    it("shows every section to the owner", async () => {
      open(snapshot({ extra: { invite: null, hiddenFromIndex: false } }));
      await screen.findByRole("heading", { name: "Invite link" });
      expect(headings()).toEqual([
        "General",
        "Players & roles",
        "Invite link",
        "Leave group",
        "Danger zone",
      ]);
    });

    it("leaves out the invite link for members who can't manage it", async () => {
      open(snapshot({ role: "recorder" }));
      await screen.findByRole("heading", { name: "Leave group" });
      expect(headings()).toEqual(["General", "Players & roles", "Leave group"]);
    });

    it("needs a signed-in user", { tags: ["AUTH-005"] }, async () => {
      const { router } = open(snapshot({ role: null }), null);
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/login");
      });
    });
  },
);
