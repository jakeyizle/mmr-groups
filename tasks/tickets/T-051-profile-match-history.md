# T-051: Full match history on profile

Status: ready
Milestone: M9
Scenarios: STATS-012
Depends on: T-050

## Notes

- In this ticket's commit, retire STATS-005 (delete it from `scenarios/stats.md`) and add, in its place: STATS-012 "Player match history on profile": Given a player with match history / When their profile is viewed / Then all their matches are listed newest first, 20 at a time / And each shows their result and their displayed rating before and after. Retag the `@STATS-005` test in `e2e/profile.spec.ts`.
- Rows: `MatchCard` with an optional `perspective` player ID, rendering the result from core `teamOutcome` and `before → after` from `useReplay(...).matches` (`displayRating`). Highlight the player's own name.
- "Show more" appends 20 more (local state; no URL param). Drop the "All matches" link to the filtered history.
- Sort newest first by `(playedAt, id)` explicitly; don't rely on snapshot order.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check --strict, mutate:changed green
