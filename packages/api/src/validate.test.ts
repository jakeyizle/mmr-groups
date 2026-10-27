import { describe, expect, it } from "vitest";

import { api, seedUser, signIn } from "../test/helpers";

describe("validation errors", () => {
  it("use the API's error shape with zod's issues as details", async () => {
    const user = await seedUser();
    const res = await api("/api/groups", {
      method: "POST",
      json: { name: "" },
      session: await signIn(user.id),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{
      error: { code: string; message: string; details: { path: unknown[] }[] };
    }>();
    expect(body.error.code).toBe("invalid");
    expect(body.error.message).toBe("Validation failed");
    expect(body.error.details.map((d) => d.path)).toContainEqual(["name"]);
  });
});

describe("logout", { tags: ["AUTH-004"] }, () => {
  it("answers ok", async () => {
    expect(
      await (await api("/api/auth/logout", { method: "POST" })).json(),
    ).toEqual({ ok: true });
  });
});
