# T-012: Groups API

Status: ready
Milestone: M1
Scenarios: GROUP-001, GROUP-002, GROUP-003, GROUP-004, GROUP-005, GROUP-006, GROUP-007, GROUP-008, GROUP-009, GROUP-010, GROUP-011, GROUP-012, ROLE-006, ROLE-007, ROLE-009, ROLE-010
Depends on: T-009, T-010

## Notes

- PLAN §8: `GET/POST /groups`, `PATCH/DELETE /groups/:gid`, `POST /groups/:gid/transfer`. The snapshot `GET /groups/:gid` is M2; until then a minimal member-only read is fine for UI work.
- Zod schemas in `packages/core/src/schemas/` (shared with the UI); `@hono/zod-validator`. Limits from PLAN §3.
- Group middleware: resolve `(user, group, player, role)`; private + non-member → the same 404 as missing; then `can()` from T-009 → 403.
- Every mutation = one `db.batch()` with audit row(s) + `groups.version` bump. Add an unguarded `auditedBatch` next to `guardedBatch` rather than duplicating.
- GROUP-011: seed matches directly in the DB; settings changes must not touch them.
- Transfer: target must be a linked player; the old owner becomes admin; site admins can't receive ownership.

## Done when

- Listed scenarios have passing tagged API tests; lint, typecheck, scenarios:check green
