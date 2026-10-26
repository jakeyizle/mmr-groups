# T-004: Drizzle schema + first migration

Status: ready
Milestone: M0
Scenarios: —
Depends on: T-003

## Notes

- Full schema from PLAN §5 in `packages/api/src/db/schema.ts`; Drizzle Kit outputs SQL to `packages/api/migrations` (Wrangler's D1 migrations dir).
- `unique(group_id, lower(display_name))` needs an expression index (`uniqueIndex().on(sql\`lower(...)\`)`) — confirm Drizzle Kit emits it; hand-edit the migration if not.
- Foreign keys with `ON DELETE CASCADE` from group-owned tables to `groups` (GROUP-007). D1 enforces FKs by default.
- `matches.teams` / JSON columns typed via `$type<...>()` using types from `packages/core`.
- Monotonic ULID helper in core (`ulid` package's `monotonicFactory`).
- Scripts: `db:generate`, `db:migrate:local`, `db:migrate:remote`.

## Done when

- Migration applies cleanly to a fresh local D1 and to the remote preview + production databases
