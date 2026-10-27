# T-030: Stats functions (core)

Status: ready
Milestone: M5
Scenarios: STATS-001, STATS-002, STATS-003, STATS-004, STATS-006, STATS-007, STATS-008, STATS-009, STATS-010, STATS-011
Depends on: —

## Notes

- `packages/core/src/stats.ts`: pure functions over `(matches, replay result)`; definitions at the top of `scenarios/stats.md` (min 3 shared matches, ties = half a win, tie-breaks, streak rules, >2 teams: win = ranked first).
- One pass that walks matches in `compareMatches` order and builds per-player records/streaks/partners/opponents; group stats reuse it. Upsets need the pre-match ratings: use `replay`'s observer and `predictWin`.
- Weeks start Monday in the viewer's zone: take a `weekStart(date)` function as a parameter so core stays zone-free and tests are deterministic.
- Rating series (STATS-001/006): `{ playerId, points: [{ at, rating }] }` from `replay().matches` after-ratings (display scale).
- Unit tests only; UI tickets add E2E.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
