import { describe, expect, it } from "vitest";

import { type AuditEvent, describeEvent } from "./audit";

const names = new Map([
  ["p1", "Ann"],
  ["p2", "Bob"],
  ["p3", "Cy"],
]);
const ev = (e: Partial<AuditEvent>): AuditEvent => ({
  action: "x",
  entityId: "e1",
  actorName: "Ann",
  before: null,
  after: null,
  ...e,
});
const say = (e: Partial<AuditEvent>) => describeEvent(ev(e), names);
const day = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(iso),
  );

const PLAYED = "2026-10-12T18:00:00.000Z";
const team = (ids: string[], rank: number, score: number | null = null) => ({
  playerIds: ids,
  rank,
  score,
});

describe("describeEvent", { tags: ["AUDIT-003"] }, () => {
  it("names the actor, or a site admin when there is none", () => {
    expect(say({ action: "group.created" })).toBe("Ann created the group");
    expect(say({ action: "group.created", actorName: null })).toBe(
      "A site admin created the group",
    );
  });

  it("falls back to the raw action", () => {
    expect(say({ action: "weird.thing" })).toBe("Ann: weird.thing");
  });

  it("describes settings changes in words", () => {
    expect(
      say({
        action: "group.updated",
        before: { name: "Old", description: "", allowTies: false },
        after: { name: "New", description: "Fun", allowTies: true },
      }),
    ).toBe(
      "Ann changed the name from “Old” to “New”, the description from (empty) to “Fun”, ties from not allowed to allowed",
    );
    expect(
      say({
        action: "group.updated",
        before: {
          visibility: "private",
          scoringMode: "none",
          defaultRole: "viewer",
          other: 1,
        },
        after: {
          visibility: "public",
          scoringMode: "required",
          defaultRole: "recorder",
          other: 2,
        },
      }),
    ).toBe(
      "Ann changed visibility from “private” to “public”, scoring from “none” to “required”, the default role from “viewer” to “recorder”, other from 1 to 2",
    );
  });

  it("describes player changes", () => {
    expect(
      say({
        action: "player.created",
        after: { displayName: "Dee", role: "recorder" },
      }),
    ).toBe("Ann added Dee as recorder");
    for (const role of ["owner", "admin", "viewer"])
      expect(
        say({ action: "player.created", after: { displayName: "Dee", role } }),
      ).toBe(`Ann added Dee as ${role}`);
    expect(
      say({ action: "player.created", after: { displayName: "Dee" } }),
    ).toBe("Ann added Dee as a player");
    expect(
      say({
        action: "player.updated",
        entityId: "p2",
        before: { displayName: "Bob" },
        after: { displayName: "Rob" },
      }),
    ).toBe("Ann renamed Bob to Rob");
    expect(
      say({
        action: "player.roleChanged",
        entityId: "p2",
        before: { role: "viewer" },
        after: { role: "admin" },
      }),
    ).toBe("Ann changed Bob's role from viewer to admin");
    expect(
      say({
        action: "player.updated",
        entityId: "p2",
        before: { displayName: "Bob", role: "viewer" },
        after: { displayName: "Rob", role: "admin" },
      }),
    ).toBe(
      "Ann renamed Bob to Rob and changed Rob's role from viewer to admin",
    );
  });

  it("names players from the payload, then the roster, else generically", () => {
    expect(
      say({
        action: "player.deleted",
        entityId: "p1",
        before: { displayName: "Old Ann" },
      }),
    ).toBe("Ann removed Old Ann");
    expect(say({ action: "player.deleted", entityId: "p2" })).toBe(
      "Ann removed Bob",
    );
    expect(
      say({
        action: "player.deleted",
        entityId: "gone",
        after: { displayName: "Zed" },
      }),
    ).toBe("Ann removed Zed");
    expect(say({ action: "player.deleted", entityId: "gone" })).toBe(
      "Ann removed a player",
    );
    expect(
      say({
        action: "player.deleted",
        entityId: "gone",
        before: { displayName: 5 },
        after: { displayName: 6 },
      }),
    ).toBe("Ann removed a player");
  });

  it("describes joining, leaving and unlinking", () => {
    expect(say({ action: "player.claimed", entityId: "p2" })).toBe(
      "Ann joined as Bob",
    );
    expect(say({ action: "player.joined" })).toBe("Ann joined as a new player");
    expect(say({ action: "player.left", entityId: "p2" })).toBe(
      "Bob left the group",
    );
    expect(say({ action: "player.unlinked", entityId: "p2" })).toBe(
      "Ann unlinked Bob's account",
    );
  });

  it("describes invite links", () => {
    const expiresAt = "2026-11-01T00:00:00.000Z";
    expect(say({ action: "invite.created", after: { expiresAt } })).toBe(
      `Ann created the invite link, expiring ${day(expiresAt)}`,
    );
    expect(say({ action: "invite.regenerated", after: {} })).toBe(
      "Ann replaced the invite link",
    );
    expect(say({ action: "invite.revoked" })).toBe(
      "Ann revoked the invite link",
    );
  });

  it("summarises matches by score, winner, or placement", () => {
    expect(
      say({
        action: "match.created",
        after: {
          playedAt: PLAYED,
          teams: [team(["p2"], 2, 7), team(["p1", "p3"], 1, 11)],
        },
      }),
    ).toBe(`Ann recorded a match on ${day(PLAYED)}: Ann & Cy 11 – Bob 7`);
    expect(
      say({
        action: "match.created",
        after: { teams: [team(["p2"], 2), team(["gone"], 1)] },
      }),
    ).toBe("Ann recorded a match: a removed player beat Bob");
    expect(
      say({
        action: "match.created",
        after: { teams: [team(["p1"], 1), team(["p2"], 1)] },
      }),
    ).toBe("Ann recorded a match: Ann vs Bob");
    expect(
      say({
        action: "match.created",
        after: {
          teams: [team(["p3"], 3), team(["p1"], 1), team(["p2"], 2)],
        },
      }),
    ).toBe("Ann recorded a match: Ann vs Bob vs Cy");
    expect(say({ action: "match.created", after: {} })).toBe(
      "Ann recorded a match: ",
    );
    expect(
      say({
        action: "match.deleted",
        before: {
          playedAt: PLAYED,
          teams: [team(["p1"], 1, 2), team(["p2"], 2, 1)],
        },
      }),
    ).toBe(`Ann deleted a match on ${day(PLAYED)}: Ann 2 – Bob 1`);
  });

  it("describes match edits", () => {
    const later = "2026-10-14T18:00:00.000Z";
    const before = {
      playedAt: PLAYED,
      teams: [team(["p1"], 1, 11), team(["p2"], 2, 7)],
      notes: "",
    };
    expect(
      say({
        action: "match.updated",
        before,
        after: {
          teams: [team(["p1"], 1, 11), team(["p2"], 2, 8)],
          playedAt: later,
          notes: "rematch",
        },
      }),
    ).toBe(
      `Ann changed the result from Ann 11 – Bob 7 to Ann 11 – Bob 8, the date from ${day(PLAYED)} to ${day(later)}, the notes of a match on ${day(PLAYED)}`,
    );
    expect(
      say({ action: "match.updated", before, after: { notes: "x" } }),
    ).toBe(`Ann changed the notes of a match on ${day(PLAYED)}`);
    expect(
      say({ action: "match.updated", before: {}, after: { notes: "x" } }),
    ).toBe("Ann changed the notes of a match");
  });
});
