import { expect, test } from "@playwright/test";

test("the deployment is healthy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
});

test(
  "test login does not exist in production",
  { tag: "@AUTH-008" },
  async ({ request }) => {
    const res = await request.post("/api/test/login", {
      data: { email: "smoke@example.com", name: "Smoke" },
      headers: { "X-Requested-With": "fetch" },
    });
    expect(res.status()).toBe(404);
  },
);
