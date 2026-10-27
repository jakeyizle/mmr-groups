# T-022: Leaderboard

Status: ready
Milestone: M2
Scenarios: BOARD-001, BOARD-002, BOARD-003, BOARD-007
Depends on: T-017, T-019

## Notes

- `/g/$gid` index. `useRatings(gid)`: `replay()` memoized on `(snapshot version, asOf day)` (PLAN §9); `asOf` = now.
- Rank-change from each player's latest match: compare rank in a replay without that match vs with it (core helper, unit-tested), not a stored value.
- Provisional badge (RATE-010), unplayed players in their own section.
- BOARD-007 as E2E: record via API, leaderboard updates after refetch.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
