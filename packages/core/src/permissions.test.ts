import { describe, expect, it } from "vitest";

import {
  type Action,
  type Actor,
  can,
  type Target,
  validRoleFor,
} from "./permissions";
import type { Role } from "./types";

// Scenario tags are literal on each describe so `scenarios:check` can see them.

const ME = "p-me";
const as = (role: Role | null, isSiteAdmin = false): Actor => ({
  role,
  playerId: role ? ME : null,
  isSiteAdmin,
});
const mine = { recordedByPlayerId: ME };
const theirs = { recordedByPlayerId: "p-other" };

/** Allowed roles, highest first. */
type Row = [Action, Target | undefined, Role[]];
const ROLES: Role[] = ["owner", "admin", "recorder", "viewer"];

function matrix(rows: Row[]) {
  for (const [action, target, allowed] of rows) {
    for (const role of ROLES) {
      const ok = allowed.includes(role);
      it(`${role} ${ok ? "can" : "cannot"} ${action} ${JSON.stringify(target ?? "")}`, () => {
        expect(can(as(role), action, target)).toBe(ok);
      });
    }
  }
}

const ALL = ROLES;
const RECORDER_UP: Role[] = ["owner", "admin", "recorder"];
const ADMIN_UP: Role[] = ["owner", "admin"];
const OWNER: Role[] = ["owner"];

describe("ROLE-001: roles are per group", { tags: ["ROLE-001"] }, () => {
  it("the same user acts with the role of the group at hand", () => {
    const inA = as("admin");
    const inB = as("viewer");
    expect(can(inA, "match.edit", theirs)).toBe(true);
    expect(can(inB, "match.edit", theirs)).toBe(false);
    expect(can(inB, "group.view")).toBe(true);
  });
});

describe(
  "ROLE-002: viewers can see but not record",
  { tags: ["ROLE-002"] },
  () => {
    matrix([
      ["group.view", undefined, ALL],
      ["match.record", undefined, RECORDER_UP],
    ]);
  },
);

describe(
  "ROLE-003: recorders manage their own matches",
  { tags: ["ROLE-003"] },
  () => {
    matrix([
      ["match.record", undefined, RECORDER_UP],
      ["match.edit", mine, RECORDER_UP],
      ["match.delete", mine, RECORDER_UP],
      ["match.edit", theirs, ADMIN_UP],
    ]);
  },
);

describe(
  "ROLE-004: admins can edit or delete any match",
  { tags: ["ROLE-004"] },
  () => {
    matrix([
      ["match.edit", theirs, ADMIN_UP],
      ["match.delete", theirs, ADMIN_UP],
    ]);
  },
);

describe("ROLE-011: admins can manage players", { tags: ["ROLE-011"] }, () => {
  matrix([
    ["player.manage", undefined, ADMIN_UP],
    ["player.setRole", { from: "viewer", to: "recorder" }, ADMIN_UP],
    ["player.setRole", { from: "recorder", to: "viewer" }, ADMIN_UP],
    ["player.unlink", { role: "recorder" }, ADMIN_UP],
  ]);
});

describe("ROLE-012: admins can edit settings", { tags: ["ROLE-012"] }, () => {
  matrix([["group.editSettings", undefined, ADMIN_UP]]);
});

describe(
  "ROLE-013: admins can manage the invite link",
  { tags: ["ROLE-013"] },
  () => {
    matrix([["invite.manage", undefined, ADMIN_UP]]);
  },
);

describe(
  "ROLE-005: only the owner grants or revokes admin",
  { tags: ["ROLE-005"] },
  () => {
    matrix([
      ["player.setRole", { from: "recorder", to: "admin" }, OWNER],
      ["player.setRole", { from: "admin", to: "viewer" }, OWNER],
      ["player.unlink", { role: "admin" }, OWNER],
    ]);
  },
);

describe(
  "ROLE-006: only the owner deletes or transfers",
  { tags: ["ROLE-006"] },
  () => {
    matrix([
      ["group.delete", undefined, OWNER],
      ["group.transfer", undefined, OWNER],
    ]);
  },
);

describe("ROLE-007: always exactly one owner", { tags: ["ROLE-007"] }, () => {
  matrix([
    ["player.setRole", { from: "admin", to: "owner" }, []],
    ["player.setRole", { from: "owner", to: "admin" }, []],
    ["player.unlink", { role: "owner" }, []],
  ]);

  it("no one becomes owner through role editing", () => {
    expect(validRoleFor({ linked: true }, "owner")).toBe(false);
  });
});

describe("ROLE-010: site admins act as owner", { tags: ["ROLE-010"] }, () => {
  const siteAdmin = as(null, true);

  it("can perform owner actions as a non-member", () => {
    for (const action of [
      "group.view",
      "group.delete",
      "group.transfer",
      "player.manage",
    ] as const) {
      expect(can(siteAdmin, action)).toBe(true);
    }
    expect(
      can(siteAdmin, "player.setRole", { from: "recorder", to: "admin" }),
    ).toBe(true);
  });

  it("still can't assign the owner role", () => {
    expect(
      can(siteAdmin, "player.setRole", { from: "admin", to: "owner" }),
    ).toBe(false);
  });
});

describe(
  "ROLE-014: unclaimed players cannot be admins",
  { tags: ["ROLE-014"] },
  () => {
    it("admin requires a linked user", () => {
      expect(validRoleFor({ linked: false }, "admin")).toBe(false);
      expect(validRoleFor({ linked: true }, "admin")).toBe(true);
      expect(validRoleFor({ linked: false }, "recorder")).toBe(true);
      expect(validRoleFor({ linked: false }, "viewer")).toBe(true);
    });
  },
);

describe("non-members", () => {
  it("can do nothing", () => {
    expect(can(as(null), "group.view")).toBe(false);
    expect(can(as(null), "match.record")).toBe(false);
  });

  it("a recorder without a player doesn't own recorder-less matches", () => {
    const actor = {
      role: "recorder",
      playerId: null,
      isSiteAdmin: false,
    } as const;
    expect(can(actor, "match.edit", { recordedByPlayerId: null })).toBe(false);
  });
});

describe("targets", () => {
  it("own-match checks need a match target", () => {
    expect(can(as("recorder"), "match.edit")).toBe(false);
    expect(can(as("recorder"), "match.delete", { role: "viewer" })).toBe(false);
  });

  it("role changes need a from/to target", () => {
    expect(can(as("owner"), "player.setRole")).toBe(false);
    expect(can(as("owner"), "player.setRole", { role: "viewer" })).toBe(false);
  });

  it("unlinking needs a role target", () => {
    expect(can(as("owner"), "player.unlink")).toBe(false);
    expect(
      can(as("owner"), "player.unlink", { from: "viewer", to: "recorder" }),
    ).toBe(false);
  });
});
