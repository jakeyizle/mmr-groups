import type { MatchTeam } from "@mmr/core";

/** Plain-language audit lines (AUDIT-003). Payloads are whatever each route stored. */
export interface AuditEvent {
  action: string;
  entityId: string;
  actorName: string | null;
  before: unknown;
  after: unknown;
}

type Fields = Record<string, unknown>;
const fields = (v: unknown): Fields =>
  v && typeof v === "object" ? (v as Fields) : {};

const ROLE: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  recorder: "recorder",
  viewer: "viewer",
};

const SETTING: Record<string, string> = {
  name: "the name",
  description: "the description",
  visibility: "visibility",
  scoringMode: "scoring",
  allowTies: "ties",
  defaultRole: "the default role",
};

function value(key: string, v: unknown): string {
  if (key === "allowTies") return v ? "allowed" : "not allowed";
  if (typeof v === "string") return v === "" ? "(empty)" : `“${v}”`;
  return JSON.stringify(v);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function matchSummary(m: Fields, names: Map<string, string>) {
  const teams = (m.teams as MatchTeam[] | undefined) ?? [];
  const sorted = [...teams].sort((a, b) => a.rank - b.rank);
  const label = (t: MatchTeam) =>
    t.playerIds.map((id) => names.get(id) ?? "a removed player").join(" & ");
  const scored = sorted.every((t) => t.score !== null);
  const summary = scored
    ? sorted.map((t) => `${label(t)} ${String(t.score)}`).join(" – ")
    : sorted.length === 2 && sorted[0]?.rank !== sorted[1]?.rank
      ? `${label(sorted[0] ?? { playerIds: [], score: null, rank: 1 })} beat ${label(sorted[1] ?? { playerIds: [], score: null, rank: 2 })}`
      : sorted.map(label).join(" vs ");
  return summary;
}

const matchDate = (m: Fields) =>
  typeof m.playedAt === "string"
    ? ` on ${dateFormat.format(new Date(m.playedAt))}`
    : "";

/** e.g. "changed the result from A 11 – B 7 to A 11 – B 8 of a match on Oct 12" */
function describeMatchEdit(
  before: Fields,
  after: Fields,
  names: Map<string, string>,
) {
  const parts: string[] = [];
  if ("teams" in after)
    parts.push(
      `the result from ${matchSummary(before, names)} to ${matchSummary(after, names)}`,
    );
  if ("playedAt" in after)
    parts.push(
      `the date from ${dateFormat.format(new Date(String(before.playedAt)))} to ${dateFormat.format(new Date(String(after.playedAt)))}`,
    );
  if ("notes" in after) parts.push("the notes");
  const when = matchDate(before);
  return `changed ${parts.join(", ")} of a match${when}`;
}

export function describeEvent(e: AuditEvent, names: Map<string, string>) {
  const before = fields(e.before);
  const after = fields(e.after);
  const who = e.actorName ?? "A site admin";
  const player =
    (typeof before.displayName === "string" ? before.displayName : null) ??
    names.get(e.entityId) ??
    (typeof after.displayName === "string" ? after.displayName : null) ??
    "a player";

  switch (e.action) {
    case "group.created":
      return `${who} created the group`;
    case "group.updated":
      return `${who} changed ${Object.keys(after)
        .map(
          (k) =>
            `${SETTING[k] ?? k} from ${value(k, before[k])} to ${value(k, after[k])}`,
        )
        .join(", ")}`;
    case "player.created":
      return `${who} added ${String(after.displayName)} as ${ROLE[String(after.role)] ?? "a player"}`;
    case "player.updated":
    case "player.roleChanged": {
      const parts: string[] = [];
      if ("displayName" in after)
        parts.push(`renamed ${player} to ${String(after.displayName)}`);
      if ("role" in after)
        parts.push(
          `changed ${"displayName" in after ? String(after.displayName) : player}'s role from ${String(before.role)} to ${String(after.role)}`,
        );
      return `${who} ${parts.join(" and ")}`;
    }
    case "player.deleted":
      return `${who} removed ${player}`;
    case "player.unlinked":
      return `${who} unlinked ${player}'s account`;
    case "invite.created":
    case "invite.regenerated": {
      const expires =
        typeof after.expiresAt === "string"
          ? `, expiring ${dateFormat.format(new Date(after.expiresAt))}`
          : "";
      return `${who} ${e.action === "invite.created" ? "created" : "replaced"} the invite link${expires}`;
    }
    case "invite.revoked":
      return `${who} revoked the invite link`;
    case "match.created":
      return `${who} recorded a match${matchDate(after)}: ${matchSummary(after, names)}`;
    case "match.updated":
      return `${who} ${describeMatchEdit(before, after, names)}`;
    case "match.deleted":
      return `${who} deleted a match${matchDate(before)}: ${matchSummary(before, names)}`;
    default:
      return `${who}: ${e.action}`;
  }
}
