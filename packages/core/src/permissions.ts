import type { Role } from "./types";

export interface Actor {
  /** null = not a member of the group. */
  role: Role | null;
  playerId: string | null;
  isSiteAdmin: boolean;
}

export type Action =
  /** leaderboard, matches, stats, audit log, team generator */
  | "group.view"
  | "group.editSettings"
  | "group.delete"
  | "group.transfer"
  | "invite.manage"
  | "match.record"
  | "match.edit"
  | "match.delete"
  | "player.manage"
  | "player.setRole"
  | "player.unlink";

export type Target =
  | { recordedByPlayerId: string | null } // match.edit, match.delete
  | { from: Role; to: Role } // player.setRole
  | { role: Role }; // player.unlink

const RANK: Record<Role, number> = {
  viewer: 0,
  recorder: 1,
  admin: 2,
  owner: 3,
};

/** Site admins act as owner in every group (taking ownership is handled by transfer). */
export function effectiveRole(actor: Actor): Role | null {
  return actor.isSiteAdmin ? "owner" : actor.role;
}

export function can(actor: Actor, action: Action, target?: Target): boolean {
  const role = effectiveRole(actor);
  if (!role) return false;
  const atLeast = (min: Role) => RANK[role] >= RANK[min];

  switch (action) {
    case "group.view":
      return true;
    case "match.record":
      return atLeast("recorder");
    case "match.edit":
    case "match.delete":
      if (atLeast("admin")) return true;
      return (
        atLeast("recorder") &&
        target !== undefined &&
        "recordedByPlayerId" in target &&
        actor.playerId !== null &&
        target.recordedByPlayerId === actor.playerId
      );
    case "group.editSettings":
    case "invite.manage":
    case "player.manage":
      return atLeast("admin");
    case "group.delete":
    case "group.transfer":
      return atLeast("owner");
    case "player.setRole": {
      if (!target || !("from" in target)) return false;
      const { from, to } = target;
      // Ownership only changes by transfer.
      if (from === "owner" || to === "owner") return false;
      if (from === "admin" || to === "admin") return atLeast("owner");
      return atLeast("admin");
    }
    case "player.unlink": {
      if (!target || !("role" in target)) return false;
      if (target.role === "owner") return false;
      if (target.role === "admin") return atLeast("owner");
      return atLeast("admin");
    }
  }
}

/** Whether a player may hold `role`. Admin needs a linked user; owner only via transfer. */
export function validRoleFor(player: { linked: boolean }, role: Role) {
  return role !== "owner" && (role !== "admin" || player.linked);
}
