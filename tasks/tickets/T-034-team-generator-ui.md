# T-034: Team generator UI

Status: ready
Milestone: M5
Scenarios: TEAMS-001, TEAMS-003, TEAMS-006, TEAMS-007
Depends on: T-033

## Notes

- `/g/$gid/teams`: player checklist (attendees, persisted per group in `localStorage` like the batch draft), format picker for flexible groups (TEAMS-007), Generate / Regenerate; shows matches with team win probabilities and who sits out; sit-out counts live in component state for the session.
- "Record these" button (recorders) prefills the batch entry draft with the suggested teams and navigates there.
- Run generation in a `useMemo`; it's fast enough per TEAMS-008, no worker.
- E2E: select 4, generate, see two teams and percentages; select 3 → "1 more player needed"; flexible group shows the format picker.

## Done when

- Listed scenarios have passing tagged E2E; lint, typecheck, scenarios:check green
