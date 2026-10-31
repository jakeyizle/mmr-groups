import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GroupData } from "@/lib/groups";

import { renderWithQuery, stubApi } from "../../../test/render";
import { InviteSettings } from "./invite-settings";

const data = (invite: { code: string; expiresAt: string | null } | null) =>
  ({ group: { id: "g1" }, invite }) as unknown as GroupData;

const api = () =>
  stubApi({
    "PUT /api/groups/g1/invite": () => ({
      invite: { code: "abc", expiresAt: null },
    }),
    "DELETE /api/groups/g1/invite": () => ({ invite: null }),
  });

const sent = (calls: ReturnType<typeof api>) =>
  calls.map((c) => [`${c.method} ${c.path}`, c.body]);

describe(
  "InviteSettings",
  { tags: ["JOIN-001", "JOIN-002", "JOIN-003"] },
  () => {
    it("offers to create a link when there is none", async () => {
      const calls = api();
      renderWithQuery(<InviteSettings data={data(null)} />);
      expect(screen.getByText(/^No invite link\./)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
      await userEvent.click(
        screen.getByRole("button", { name: "Create link" }),
      );
      await waitFor(() => {
        expect(sent(calls)).toEqual([
          ["PUT /api/groups/g1/invite", { expiresInDays: null }],
        ]);
      });
    });

    it("creates links that expire after the chosen days", async () => {
      const calls = api();
      const { queryClient } = renderWithQuery(
        <InviteSettings data={data(null)} />,
      );
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const expiry = screen.getByRole("combobox", { name: "Expires after" });
      expect(
        [...(expiry as HTMLSelectElement).options].map((o) => [
          o.value,
          o.textContent,
        ]),
      ).toEqual([
        ["never", "Never"],
        ["1", "1 day"],
        ["7", "7 days"],
        ["30", "30 days"],
      ]);
      fireEvent.change(expiry, { target: { value: "7" } });
      await userEvent.click(
        screen.getByRole("button", { name: "Create link" }),
      );
      await waitFor(() => {
        expect(sent(calls)).toEqual([
          ["PUT /api/groups/g1/invite", { expiresInDays: 7 }],
        ]);
      });
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["group", "g1"],
      ]);
    });

    it("shows the link and when it expires", () => {
      api();
      const expiresAt = "2026-11-01T10:00:00.000Z";
      renderWithQuery(
        <InviteSettings data={data({ code: "abc", expiresAt })} />,
      );
      expect(
        screen.getByRole("textbox", { name: "Invite link" }),
      ).toHaveProperty("value", `${location.origin}/join/abc`);
      const when = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(expiresAt));
      expect(screen.getByText(new RegExp(`Expires ${when}\\.`))).toBeTruthy();
    });

    it("says when a link doesn't expire, and selects it on focus", () => {
      api();
      renderWithQuery(
        <InviteSettings data={data({ code: "abc", expiresAt: null })} />,
      );
      expect(screen.getByText(/It doesn't expire\./).textContent).toBe(
        "Anyone with this link can join and claim an unclaimed player. It doesn't expire.",
      );
      const field = screen.getByRole<HTMLInputElement>("textbox", {
        name: "Invite link",
      });
      fireEvent.focus(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([
        0,
        field.value.length,
      ]);
    });

    it("copies the link, and resets after making a new one", async () => {
      const calls = api();
      const user = userEvent.setup();
      renderWithQuery(
        <InviteSettings data={data({ code: "abc", expiresAt: null })} />,
      );
      await user.click(screen.getByRole("button", { name: "Copy" }));
      expect(await navigator.clipboard.readText()).toBe(
        `${location.origin}/join/abc`,
      );
      expect(
        await screen.findByRole("button", { name: "Copied" }),
      ).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "New link" }));
      expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
      await waitFor(() => {
        expect(sent(calls)).toEqual([
          ["PUT /api/groups/g1/invite", { expiresInDays: null }],
        ]);
      });
    });

    it("stays on Copy without clipboard access", async () => {
      api();
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
        new Error("denied"),
      );
      renderWithQuery(
        <InviteSettings data={data({ code: "abc", expiresAt: null })} />,
      );
      await user.click(screen.getByRole("button", { name: "Copy" }));
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    });

    it("revokes the link", async () => {
      const calls = api();
      const { queryClient } = renderWithQuery(
        <InviteSettings data={data({ code: "abc", expiresAt: null })} />,
      );
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
      await waitFor(() => {
        expect(sent(calls)).toEqual([
          ["DELETE /api/groups/g1/invite", undefined],
        ]);
      });
      expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
        ["group", "g1"],
      ]);
    });
  },
);
