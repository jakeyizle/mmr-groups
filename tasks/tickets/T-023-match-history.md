# T-023: Match history

Status: ready
Milestone: M2
Scenarios: BOARD-004, BOARD-005, BOARD-006
Depends on: T-017, T-019

## Notes

- `/g/$gid/matches`: newest first from the snapshot; per-player before → after from `replay().matches` (RATE-012), shown as display-rating deltas.
- Player filter as a search param (`?player=`), so it's linkable from profiles later.
- Mobile layout: one card per match, teams stacked, winner marked.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
