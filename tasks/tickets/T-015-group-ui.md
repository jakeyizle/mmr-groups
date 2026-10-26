# T-015: Group create + settings UI

Status: ready
Milestone: M1
Scenarios: GROUP-001, GROUP-003, GROUP-004, GROUP-005, GROUP-006, GROUP-007, GROUP-008, ROLE-008
Depends on: T-012, T-014

## Notes

- `/` (my groups), `/groups/new`, `/g/:gid/settings` (general section). React Hook Form + core Zod schemas.
- Team format read-only after creation (GROUP-004). Delete/transfer behind a confirmation, owner-only via `<Can>`.
- E2E for the main journeys only (create group, edit settings); validation edge cases stay at API level.

## Done when

- Listed scenarios have tagged tests passing on both Playwright projects; lint, typecheck, scenarios:check green
