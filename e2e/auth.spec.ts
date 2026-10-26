import { expect, test } from "@playwright/test";

import { signIn } from "./auth";

test(
  "signing out ends the session and private pages need sign-in again",
  { tag: "@AUTH-004" },
  async ({ page }) => {
    await signIn(page, "Ann Example");
    await page.goto("/");
    await expect(page.getByText("Ann Example")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();

    // The server session is gone, not just the client state.
    const me = await page.request.get("/api/me");
    expect(await me.json()).toEqual({ user: null });

    await page.goto("/groups/new");
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  },
);
