# T-025: Match edit/delete API with versions

Status: ready
Milestone: M3
Scenarios: EDIT-001, EDIT-002, EDIT-003, EDIT-004, EDIT-005, EDIT-006, EDIT-007, EDIT-008, EDIT-009, EDIT-010, EDIT-011, AUDIT-001
Depends on: —

## Notes

- PLAN §5, §8: `PATCH /groups/:gid/matches/:mid` and `DELETE …`, both requiring `If-Match: <version>` (428 without it, 412 when stale with the current match in the body). `guardedBatch` guarded on `id` + `version`; bump `version`, `updatedAt`.
- Permission `match.edit` / `match.delete` with `{ recordedByPlayerId }` target (recorders only their own).
- PATCH body: partial of `playedAt`, `teams`, `notes`. EDIT-008/011: run `validateMatch` only when `teams` changed (merge with stored fields first); `playedAt` alone checks only the 24 h rule; notes alone checks nothing. Player IDs re-checked as in T-020.
- EDIT-003/004: ranks are re-derived from scores on every teams edit, so a same-winner score fix leaves ratings unchanged.
- Audit `match.updated` (changed fields only, before/after) and `match.deleted` (full before). Extend `describeEvent` in web for both.
- Rating scenarios (EDIT-001…007): API test edits, then assert `replay(snapshot.matches)` equals replaying the expected corrected history.

## Done when

- Listed scenarios have passing tagged API tests; lint, typecheck, scenarios:check green
