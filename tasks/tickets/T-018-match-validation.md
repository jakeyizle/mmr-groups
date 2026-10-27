# T-018: Match schemas + validation (core)

Status: ready
Milestone: M2
Scenarios: MATCH-007, MATCH-008, MATCH-009, MATCH-010, MATCH-011, MATCH-012, MATCH-013, MATCH-017, MATCH-018, MATCH-019, MATCH-020, MATCH-021, MATCH-022, MATCH-023, GROUP-003
Depends on: —

## Notes

- PLAN §3 (Match, limits). `packages/core/src/match.ts`: `matchInputSchema` (zod: shape and limits) and `validateMatch(input, settings, now)` (format, scoring mode, ties, duplicate players, `playedAt` ≤ now + 24 h), which returns the stored `MatchTeam[]` with ranks derived from scores when present.
- Errors as `{ path, code }` issues so the form can attach them to fields; same function runs in the browser and the API.
- `batchSchema`: 1–50 matches (MATCH-021).
- Player existence/group membership is the API's job (T-020), not core's.
- Table-driven tests with a describe-level literal tag per scenario.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
