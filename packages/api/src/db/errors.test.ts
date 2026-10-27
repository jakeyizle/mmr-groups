import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

const d1 = (message: string) =>
  new Error("Failed query", { cause: new Error(message) });

describe("isUniqueViolation", () => {
  it("matches a UNIQUE failure on the given index", () => {
    const err = d1(
      "D1_ERROR: UNIQUE constraint failed: players.group_id, players.name_key",
    );
    expect(isUniqueViolation(err, "players.name_key")).toBe(true);
    expect(isUniqueViolation(err, "players.user_id")).toBe(false);
  });

  it("ignores other errors", () => {
    expect(
      isUniqueViolation(
        d1("NOT NULL constraint failed: players.name_key"),
        "players.name_key",
      ),
    ).toBe(false);
    expect(
      isUniqueViolation(
        new Error("UNIQUE constraint failed: players.name_key"),
        "players.name_key",
      ),
    ).toBe(false);
    expect(
      isUniqueViolation(
        { cause: new Error("UNIQUE constraint failed: x") },
        "x",
      ),
    ).toBe(false);
    expect(
      isUniqueViolation(
        new Error("x", { cause: "UNIQUE constraint failed: x" }),
        "x",
      ),
    ).toBe(false);
  });
});
