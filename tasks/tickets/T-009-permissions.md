# T-009: Permissions module (core)

Status: ready
Milestone: M1
Scenarios: ROLE-001, ROLE-002, ROLE-003, ROLE-004, ROLE-005, ROLE-006, ROLE-010, ROLE-011, ROLE-012, ROLE-013, ROLE-014
Depends on: —

## Notes

- PLAN §3 role matrix + rules. `packages/core/src/permissions.ts`: `can(actor, action, target?)`, pure, used by the API middleware and to hide UI controls (ROLE-008 is verified in UI tickets, ROLE-009 in API tickets).
- `actor`: `{ role: Role | null, playerId: string | null, isSiteAdmin: boolean }` (null role = non-member). Site admins act as owner (ROLE-010) but can't _become_ owner (enforced in transfer, T-012).
- Actions as a string union (e.g. `match.record`, `match.edit`, `player.setRole`, `group.transfer`). Targets carry only what rules need: match `{ recordedByPlayerId }`, player `{ role, linked }`, the new role for `player.setRole`.
- Admin on unclaimed players is invalid regardless of actor (ROLE-014): expose a separate `validRoleFor(player)` rather than folding it into `can`.
- Table-driven unit tests over the matrix; tag rows with their scenario IDs.

## Done when

- Listed scenarios have passing tagged unit tests; lint, typecheck, scenarios:check green
