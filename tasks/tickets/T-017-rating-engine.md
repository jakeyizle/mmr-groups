# T-017: Rating replay engine (core)

Status: ready
Milestone: M2
Scenarios: RATE-001, RATE-002, RATE-003, RATE-004, RATE-005, RATE-006, RATE-007, RATE-008, RATE-009, RATE-010, RATE-011, RATE-012, RATE-013, RATE-014, MATCH-006
Depends on: —

## Notes

- PLAN §6. `packages/core/src/rating/`: `openskill` (5.x) behind the `RatingSystem` interface; `replay(matches, config, asOf)` plus `displayRating` / `isProvisional`.
- `DEFAULT_RATING_CONFIG` replaces the hardcoded group default (check `createGroup` and the `groups.rating_config` column default use it).
- MATCH-006 tie-break is `(playedAt, id)`: IDs are monotonic ULIDs and edits never change them.
- Decay before each match and once more to `asOf`; `asOf` is always passed in (no `Date.now()` in core).
- Tests: fixed matches and fixed `asOf`; assert directions and relations (upset > expected, decayed σ > σ), not openskill's exact floats, except one pinned snapshot for RATE-013 defaults.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
