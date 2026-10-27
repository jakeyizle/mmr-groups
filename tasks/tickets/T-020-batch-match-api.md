# T-020: Batch match create API + audit

Status: ready
Milestone: M2
Scenarios: MATCH-001, MATCH-002, MATCH-003, AUDIT-001, AUDIT-002, AUDIT-007, GROUP-011
Depends on: T-018, T-019

## Notes

- PLAN §8: `POST /api/groups/:gid/matches { matches: [...] }`, `match.record` permission; `recordedByPlayerId` = my player.
- Validate every match with core `validateMatch` against current settings; also check all player IDs belong to the group. Any failure → 400 with per-match issue paths (`matches.3.teams.1...`), nothing written.
- One `auditedBatch`: N inserts + N `match.created` audit rows + one version bump. Remember D1's 100 bound-params-per-statement limit when inserting (one statement per match is fine).
- AUDIT-001 here covers the create half; edit/delete land with M3.
- GROUP-011: tied and score-less matches stay after settings tighten; new ones are validated against new settings.

## Done when

- Listed scenarios have passing tagged API tests; lint, typecheck, scenarios:check green
