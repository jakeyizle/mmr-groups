import { expect, test } from "@playwright/test";

import { signIn } from "./auth";

test("admins create, replace and revoke the invite link", async ({ page }) => {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Club",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 1 },
    },
    headers: { "X-Requested-With": "fetch" },
  });
  const { id } = (await res.json()) as { id: string };
  await page.goto(`/g/${id}/settings`);

  await page.getByLabel("Expires after").selectOption({ label: "7 days" });
  await page.getByRole("button", { name: "Create link" }).click();
  const link = page.getByLabel("Invite link");
  await expect(link).toHaveValue(/\/join\/[a-z2-9]{12}$/);
  await expect(page.getByText(/Expires .*\d{4}/)).toBeVisible();
  const first = await link.inputValue();

  await page.getByRole("button", { name: "New link" }).click();
  await expect(link).not.toHaveValue(first);

  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(link).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create link" })).toBeVisible();
});
