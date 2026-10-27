import { describe, expect, it } from "vitest";

import { demoSql, generateDemo, mondayUtc } from "./demo.ts";

const END = new Date("2026-10-26T00:00:00.000Z"); // a Monday

describe("demo generator", () => {
  it("is deterministic for the same seed and end", () => {
    expect(generateDemo(END)).toEqual(generateDemo(END));
    expect(generateDemo(END, 1)).not.toEqual(generateDemo(END, 2));
  });

  it("has 12 players and 16 weeks of 2v2 to 11, ending before the end week", () => {
    const demo = generateDemo(END);
    expect(demo.players).toHaveLength(12);
    const times = demo.matches.map((m) => Date.parse(m.playedAt));
    const weeks = (Math.max(...times) - Math.min(...times)) / (7 * 86_400_000);
    expect(weeks).toBeGreaterThan(15);
    expect(weeks).toBeLessThan(16);
    expect(Math.max(...times)).toBeLessThan(END.getTime());
    for (const m of demo.matches) {
      expect(m.teams.map((t) => t.playerIds.length)).toEqual([2, 2]);
      expect(new Set(m.teams.flatMap((t) => t.playerIds)).size).toBe(4);
      expect(m.teams.map((t) => t.score).sort((a, b) => b - a)[0]).toBe(11);
      expect(m.teams.map((t) => t.rank).sort()).toEqual([1, 2]);
    }
    // IDs sort in play order, like ULIDs.
    const ids = demo.matches.map((m) => m.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("emits idempotent inserts for the group, players and matches", () => {
    const sql = demoSql(generateDemo(END));
    const statements = sql.trim().split("\n");
    expect(statements).toHaveLength(1 + 12 + 160);
    expect(statements.every((s) => s.endsWith("ON CONFLICT DO NOTHING;"))).toBe(
      true,
    );
    expect(statements[0]).toContain("'demo'");
  });

  it("mondayUtc snaps to the week's Monday", () => {
    expect(mondayUtc(new Date("2026-10-29T15:00:00Z")).toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
    expect(mondayUtc(new Date("2026-10-26T00:00:00Z")).toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
  });
});
