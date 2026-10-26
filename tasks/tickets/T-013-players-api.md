# T-013: Players API

Status: ready
Milestone: M1
Scenarios: PLAYER-001, PLAYER-002, PLAYER-003, PLAYER-004, PLAYER-005, PLAYER-006, PLAYER-007, PLAYER-008, PLAYER-009, PLAYER-010, PLAYER-011, PLAYER-012, PLAYER-013, ROLE-005, ROLE-011, ROLE-014
Depends on: T-012

## Notes

- PLAN §8: `POST /groups/:gid/players` (one or many), `PATCH/DELETE /groups/:gid/players/:pid`, `POST …/unlink`. `/leave` and claims are M4.
- Name uniqueness: rely on the `lower(display_name)` unique index and map the constraint error to 409 (Drizzle wraps it; check `cause.message`).
- "Has matches" for delete: `json_each(matches.teams)` over `playerIds` (PLAN §5).
- Unlinking an admin resets the role to the group default (PLAN §3).
- Check the 200-player cap inside the write batch (count guard), not as a separate read-then-write.

## Done when

- Listed scenarios have passing tagged API tests; lint, typecheck, scenarios:check green
