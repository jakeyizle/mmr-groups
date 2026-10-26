import { describe, expect, it } from "vitest";

import * as core from "./index";

describe("core", () => {
  it("loads", () => {
    expect(core).toBeTypeOf("object");
  });
});
