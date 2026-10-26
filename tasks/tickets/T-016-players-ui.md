# T-016: Players & roles UI

Status: ready
Milestone: M1
Scenarios: PLAYER-001, PLAYER-003, PLAYER-005, PLAYER-006, PLAYER-008, ROLE-005, ROLE-008
Depends on: T-013, T-015

## Notes

- `/g/:gid/settings` players & roles section: add (multi-add), rename, set role, remove, unlink. Role options filtered by `can()` + `validRoleFor()` (no admin on unclaimed players).
- Server errors (409 name taken, cap reached) show inline on the field.

## Done when

- Listed scenarios have tagged tests passing on both Playwright projects; lint, typecheck, scenarios:check green
