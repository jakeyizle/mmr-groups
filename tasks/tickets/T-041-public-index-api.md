# T-041: Public group index API

Status: ready
Milestone: M7
Scenarios: VIS-009, VIS-010, VIS-011, VIS-012, VIS-013
Depends on: —

## Notes

- Commit VIS-009..013 with this ticket: `scenarios:check --strict` fails CI on required scenarios without tests.
- Migration `0001` via `drizzle-kit generate`: the four `groups` columns (PLAN §5), plus a hand-added backfill `UPDATE` (same recompute SQL as the bump). No indexes.
- Counters: extend `bumpVersion` in `db/guarded-batch.ts` to recompute them with group-scoped subqueries; also run the recompute in the create batch (`bump: false` only skips the version increment). Writes that bypass it: `scripts/demo.ts` `demoSql` (append the recompute `UPDATE` for the demo group, as the seed runs after migrations) and `test/helpers.ts` `seedGroup` (recompute after inserting). Grep for any other direct player/match write. Test each mutation kind (batch create, edit `playedAt`, delete, add/remove player, claim new player) leaves counters equal to a fresh aggregate.
- `GET /api/public-groups` (PLAN §8): its own sub-app, no group middleware; zod-validate query. Keyset `WHERE (key, id) > (?, ?)` (flip for desc; `name COLLATE NOCASE` on both sides of the name comparison and in `ORDER BY`); `last_played_at` is non-null for listed groups. Cursor = base64url JSON; escape `%`, `_`, `\` in `q` (`LIKE … ESCAPE '\'`).
- Hide: `hiddenFromIndex` in `updateGroupSchema`; after the existing no-op filter in `PATCH /groups/:gid`, 403 if it's among the changed keys and `!actor.isSiteAdmin`. Admin snapshot only (next to `invite`), never `serializeGroup`. Audited as part of `group.updated`.
- VIS-012/VIS-010 tests: fixtures with known order (ties on counts, mixed-case names) and expected ids written out in the test; walk every page in both directions for each sort. Stale-sort cursor → 400.

## Done when

- Listed scenarios have passing tagged API tests; lint, typecheck, scenarios:check --strict green
