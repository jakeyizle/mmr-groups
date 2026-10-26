import { type Action, type Actor, can, type Target } from "@mmr/core";
import type { ReactNode } from "react";

/** Renders children only when `actor` may perform `action` (ROLE-008); the server re-checks. */
export function Can({
  actor,
  action,
  target,
  children,
}: {
  actor: Actor;
  action: Action;
  target?: Target;
  children: ReactNode;
}) {
  return can(actor, action, target) ? children : null;
}
