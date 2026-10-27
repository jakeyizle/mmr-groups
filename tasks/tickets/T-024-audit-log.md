# T-024: Audit log API + UI

Status: ready
Milestone: M2
Scenarios: AUDIT-003, AUDIT-004, AUDIT-005, AUDIT-006, AUDIT-008, AUDIT-009, AUDIT-010
Depends on: T-020

## Notes

- PLAN §8: `GET /api/groups/:gid/audit?cursor=`, members only: a new `audit.view` action in core `can()` (any role; public non-members get 403, private non-members the usual 404).
- Keyset pagination on ULID `id` desc; page size 50; `nextCursor`.
- Actor shown as the actor's player name in this group (never user details); resolve server-side.
- AUDIT-008/009/010: the writes already exist (T-012/T-013); add tagged tests asserting the rows. Invite events arrive in M4, so AUDIT-009 covers settings only for now (note it in the test).
- AUDIT-006: no update/delete routes exist; test that the API offers none.
- UI `/g/$gid/audit`: infinite list with human-readable lines per action.

## Done when

- Listed scenarios have passing tagged tests; lint, typecheck, scenarios:check green
