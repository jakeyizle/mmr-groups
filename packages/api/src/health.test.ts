import { describe, expect, it } from "vitest";

import { db, request, seedGroup, seedUser } from "../test/helpers";

describe("GET /api/health", () => {
  it("returns ok from D1", async () => {
    const res = await request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("test harness", () => {
  it("has migrations applied and seeds data", async () => {
    const user = await seedUser();
    const { group, ownerPlayer } = await seedGroup(user);
    expect(ownerPlayer).toMatchObject({ groupId: group.id, role: "owner" });
    expect(await db.query.groups.findFirst()).toMatchObject({
      teamFormat: { kind: "fixed", teams: 2, size: 2 },
      ratingConfig: {},
      version: 1,
    });
  });
});
