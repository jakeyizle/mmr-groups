import { describe, expect, it } from "vitest";

import { updateGroupSchema, updatePlayerSchema } from "./schemas";

describe("group settings", { tags: ["GROUP-005"] }, () => {
  it("trims the description", () => {
    expect(updateGroupSchema.parse({ description: "  Tuesdays  " })).toEqual({
      description: "Tuesdays",
    });
  });

  it(
    "accepts every scoring mode",
    { tags: ["MATCH-010", "MATCH-017", "MATCH-018"] },
    () => {
      for (const scoringMode of ["required", "optional", "none"])
        expect(updateGroupSchema.parse({ scoringMode })).toEqual({
          scoringMode,
        });
      expect(updateGroupSchema.safeParse({ scoringMode: "" }).success).toBe(
        false,
      );
    },
  );
});

describe("player updates", { tags: ["PLAYER-005"] }, () => {
  it("need a name or a role", () => {
    const r = updatePlayerSchema.safeParse({});
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      "Nothing to change",
    ]);
    expect(updatePlayerSchema.parse({ role: "viewer" })).toEqual({
      role: "viewer",
    });
    expect(updatePlayerSchema.parse({ displayName: " Bo " })).toEqual({
      displayName: "Bo",
    });
  });
});
