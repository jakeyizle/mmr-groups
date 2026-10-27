import {
  defaultSortDir,
  type PublicGroupSort,
  publicGroupsQuerySchema,
} from "@mmr/core";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { groups } from "../db/schema";
import type { AppEnv } from "../env";
import { apiError } from "../errors";
import { validate } from "../validate";

export const PAGE_SIZE = 25;

/** Sort expressions; names compare case-insensitively in ORDER BY and keyset alike. */
const KEYS: Record<PublicGroupSort, SQL> = {
  name: sql`${groups.name} collate nocase`,
  played: sql`${groups.lastPlayedAt}`,
  matches: sql`${groups.matchCount}`,
  players: sql`${groups.playerCount}`,
  created: sql`${groups.createdAt}`,
};

const NUMERIC = new Set<PublicGroupSort>(["matches", "players"]);

interface Row {
  name: string;
  lastPlayedAt: string | null;
  matchCount: number;
  playerCount: number;
  createdAt: string;
}

/** The row's value for `sort`, matching `KEYS`. */
function sortValue(sort: PublicGroupSort, r: Row): string | number {
  switch (sort) {
    case "name":
      return r.name;
    case "played":
      return r.lastPlayedAt ?? "";
    case "matches":
      return r.matchCount;
    case "players":
      return r.playerCount;
    case "created":
      return r.createdAt;
  }
}

const cursorSchema = z.strictObject({
  sort: z.string(),
  dir: z.enum(["asc", "desc"]),
  value: z.union([z.string(), z.number()]),
  id: z.string(),
});
type Cursor = z.infer<typeof cursorSchema>;

function encodeCursor(c: Cursor) {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const bin = atob(raw.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed = cursorSchema.safeParse(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    return parsed.success ? parsed.data : null;
    // Stryker disable next-line BlockStatement: undefined is rejected like null
  } catch {
    return null;
  }
}

const escapeLike = (q: string) => q.replace(/[\\%_]/g, "\\$&");

/** VIS-009..012: listed = public, not hidden, at least one match. */
export const publicGroupsRoutes = new Hono<AppEnv>().get(
  "/",
  validate("query", publicGroupsQuerySchema),
  async (c) => {
    const { q, sort, cursor: rawCursor, ...rest } = c.req.valid("query");
    const dir = rest.dir ?? defaultSortDir(sort);
    const key = KEYS[sort];

    const where: SQL[] = [
      eq(groups.visibility, "public"),
      eq(groups.hiddenFromIndex, false),
      sql`${groups.matchCount} > 0`,
    ];
    if (q)
      where.push(sql`${groups.name} like ${`%${escapeLike(q)}%`} escape '\\'`);
    if (rawCursor !== undefined) {
      const cursor = decodeCursor(rawCursor);
      if (
        cursor?.sort !== sort ||
        cursor.dir !== dir ||
        typeof cursor.value !== (NUMERIC.has(sort) ? "number" : "string")
      ) {
        return apiError(c, 400, "bad_cursor", "Invalid cursor");
      }
      const op = dir === "asc" ? sql`>` : sql`<`;
      where.push(
        sql`(${key}, ${groups.id}) ${op} (${cursor.value}, ${cursor.id})`,
      );
    }

    // Stryker disable next-line StringLiteral: SQL orders ascending by default
    const order = dir === "asc" ? sql`asc` : sql`desc`;
    const rows = await c
      .get("db")
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        playerCount: groups.playerCount,
        matchCount: groups.matchCount,
        lastPlayedAt: groups.lastPlayedAt,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .where(and(...where))
      .orderBy(sql`${key} ${order}`, sql`${groups.id} ${order}`)
      .limit(PAGE_SIZE + 1);

    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return c.json({
      groups: page.map((g) => ({
        ...g,
        // Non-null for listed groups (match_count > 0).
        lastPlayedAt: g.lastPlayedAt ?? g.createdAt,
      })),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? encodeCursor({
              sort,
              dir,
              value: sortValue(sort, last),
              id: last.id,
            })
          : null,
    });
  },
);
