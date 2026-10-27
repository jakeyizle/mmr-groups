# T-033: Team generator (core) + perf benchmark

Status: ready
Milestone: M5
Scenarios: TEAMS-001, TEAMS-002, TEAMS-003, TEAMS-004, TEAMS-005, TEAMS-006, TEAMS-008
Depends on: —

## Notes

- PLAN §9 (Team generator). `packages/core/src/teams.ts`: `generateTeams({ players, ratings, format, sitOutCounts, skip })` → `{ matches: [{ teams, probabilities }], sittingOut, imbalance }` or `{ needed: n }` (TEAMS-006).
- Score: Σ over matches and teams of |P − 1/T| via `ratingSystem(config).predictWin`; unrated players use `initial()` (TEAMS-005). Deterministic tie-break by player-ID order of the partition.
- Exhaustive up to 12 players (canonical partitions only: sort within teams, teams within matches, matches within the suggestion, to avoid symmetric duplicates); above 12, seeded local search (fixed seed, swaps between teams).
- TEAMS-004: "regenerate" = the k-th best distinct partition (pass `skip: k`). TEAMS-003: sit-outs picked from the fewest-sat-out first (ties by ID), counts kept by the caller.
- TEAMS-008: a vitest test that times 12 players in 2×2 and asserts < 200 ms (generous CI margin: run it once warm).

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
