import type { Group, Player } from "./access";

/** Group fields any viewer may see (no invite code). */
export function serializeGroup(g: Group) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    visibility: g.visibility,
    isDemo: g.isDemo,
    teamFormat: g.teamFormat,
    scoringMode: g.scoringMode,
    allowTies: g.allowTies,
    defaultRole: g.defaultRole,
    ratingConfig: g.ratingConfig,
    version: g.version,
    createdAt: g.createdAt,
  };
}

/** Never exposes user IDs: only whether the player is claimed. */
export function serializePlayer(p: Player) {
  return {
    id: p.id,
    displayName: p.displayName,
    role: p.role,
    linked: p.userId !== null,
  };
}
