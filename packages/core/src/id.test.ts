import { describe, expect, it } from "vitest";

import { clampPage, newId } from "./id";

describe("newId", () => {
  it("is strictly increasing within the same millisecond", () => {
    const ids = Array.from({ length: 1000 }, () => newId(1_700_000_000_000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

it("clampPage", () => {
  expect(clampPage(5)).toBe(5);
});
