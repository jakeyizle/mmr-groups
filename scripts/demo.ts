// Deterministic demo group (PLAN §12): same seed and end date, same data.

export const DEMO_GROUP_ID = "demo";

const NAMES = [
  "Alex",
  "Blair",
  "Casey",
  "Devon",
  "Emery",
  "Finley",
  "Harper",
  "Jordan",
  "Kai",
  "Logan",
  "Morgan",
  "Riley",
];
const WEEKS = 16;
/** Two evening sessions a week (Tue, Thu at 18:00 UTC), five matches each. */
const SESSIONS = [1, 3];
const MATCHES_PER_SESSION = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoTeam {
  playerIds: string[];
  score: number;
  rank: number;
}

export interface Demo {
  group: { id: string; name: string; description: string; createdAt: string };
  players: { id: string; displayName: string; createdAt: string }[];
  matches: { id: string; playedAt: string; teams: DemoTeam[] }[];
}

/**
 * 12 unlinked players with a hidden "true skill", 16 weeks of 2v2 to 11 ending
 * the week before `end` (a Monday, UTC).
 */
export function generateDemo(end: Date, seed = 20261027): Demo {
  const rand = mulberry32(seed);
  const start = new Date(end.getTime() - WEEKS * 7 * DAY_MS);
  const createdAt = new Date(start.getTime() - DAY_MS).toISOString();
  const players = NAMES.map((displayName, i) => ({
    id: `demo-p${String(i + 1).padStart(2, "0")}`,
    displayName,
    createdAt,
  }));
  // Hidden skill, roughly 15–35.
  const skill = new Map(players.map((p) => [p.id, 15 + rand() * 20]));

  const matches: Demo["matches"] = [];
  for (let week = 0; week < WEEKS; week++) {
    for (const day of SESSIONS) {
      const session =
        start.getTime() + (week * 7 + day) * DAY_MS + 18 * 3_600_000;
      for (let n = 0; n < MATCHES_PER_SESSION; n++) {
        // Four distinct players, split at random into two pairs.
        const pool = [...players.map((p) => p.id)];
        const four: string[] = [];
        while (four.length < 4) {
          const [id] = pool.splice(Math.floor(rand() * pool.length), 1);
          if (id) four.push(id);
        }
        const teams = [four.slice(0, 2), four.slice(2)];
        const strength = teams.map((t) =>
          t.reduce((s, id) => s + (skill.get(id) ?? 25), 0),
        );
        const pFirst =
          1 / (1 + Math.exp(((strength[1] ?? 0) - (strength[0] ?? 0)) / 6));
        const winner = rand() < pFirst ? 0 : 1;
        // Closer matchups give closer scores.
        const gap = Math.abs((strength[0] ?? 0) - (strength[1] ?? 0));
        const loserScore = Math.max(
          0,
          Math.min(9, Math.round(9 - gap / 3 - rand() * 4)),
        );
        matches.push({
          id: `demo-m${String(matches.length + 1).padStart(4, "0")}`,
          playedAt: new Date(session + n * 20 * 60_000).toISOString(),
          teams: teams.map((playerIds, i) => ({
            playerIds,
            score: i === winner ? 11 : loserScore,
            rank: i === winner ? 1 : 2,
          })),
        });
      }
    }
  }
  return {
    group: {
      id: DEMO_GROUP_ID,
      name: "Demo Pickleball League",
      description: "Generated demo data: 12 players, 16 weeks of doubles.",
      createdAt,
    },
    players,
    matches,
  };
}

const q = (v: string) => `'${v.replaceAll("'", "''")}'`;

/** Idempotent SQL: re-running never duplicates or overwrites. */
export function demoSql(demo: Demo): string {
  const { group } = demo;
  const lines = [
    `INSERT INTO groups (id, name, description, visibility, is_demo, team_format, scoring_mode, allow_ties, default_role, rating_config, version, created_at) VALUES (${[
      q(group.id),
      q(group.name),
      q(group.description),
      q("public"),
      "1",
      q(JSON.stringify({ kind: "fixed", teams: 2, size: 2 })),
      q("required"),
      "0",
      q("viewer"),
      q("{}"),
      "1",
      q(group.createdAt),
    ].join(", ")}) ON CONFLICT DO NOTHING;`,
    ...demo.players.map(
      (p) =>
        `INSERT INTO players (id, group_id, display_name, role, user_id, created_at) VALUES (${q(p.id)}, ${q(group.id)}, ${q(p.displayName)}, 'viewer', NULL, ${q(p.createdAt)}) ON CONFLICT DO NOTHING;`,
    ),
    ...demo.matches.map(
      (m) =>
        `INSERT INTO matches (id, group_id, played_at, teams, notes, recorded_by_player_id, version, created_at, updated_at) VALUES (${q(m.id)}, ${q(group.id)}, ${q(m.playedAt)}, ${q(JSON.stringify(m.teams))}, '', NULL, 1, ${q(m.playedAt)}, ${q(m.playedAt)}) ON CONFLICT DO NOTHING;`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

/** The Monday (00:00 UTC) of `d`'s week. */
export function mondayUtc(d: Date) {
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset),
  );
}
