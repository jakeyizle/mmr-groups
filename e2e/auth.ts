import { expect, type Page } from "@playwright/test";

/** Signs in via the test-login route; the session cookie lands in the page's context. */
export async function signIn(
  page: Page,
  name = "Test User",
  email = `${crypto.randomUUID()}@example.com`,
) {
  const res = await page.request.post("/api/test/login", {
    data: { name, email },
    headers: { "X-Requested-With": "fetch" },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { userId: string };
}
